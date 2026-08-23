-- Final pre-staging sweep, part 2: submit-receipt Edge Function was
-- publicly callable with any submission_id, repeatable indefinitely, with
-- no relationship to the caller. Introduce a one-time receipt-send
-- capability minted by submit_form() itself (same pattern as
-- upload_tickets in 030), so the Edge Function authorizes on possession of
-- an unpredictable, single-use, submission-bound ticket instead of a bare
-- (guessable-by-nobody-but-still-unauthenticated) UUID.
--
-- Forward-only; supersedes 030's submit_form() by name. The return type is
-- changing (uuid -> a row), which CREATE OR REPLACE cannot do, so the old
-- signature is dropped first.

CREATE TABLE IF NOT EXISTS receipt_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
);

ALTER TABLE receipt_tickets ENABLE ROW LEVEL SECURITY;
-- Intentionally zero policies, same reasoning as upload_tickets: this table
-- grants no read/write capability to anon or authenticated regardless of
-- what a client knows about it. Only submit_form() (SECURITY DEFINER) and
-- the submit-receipt Edge Function (service role) ever touch it.

DROP FUNCTION IF EXISTS submit_form(uuid, jsonb, jsonb);

CREATE FUNCTION submit_form(
  p_form_id UUID,
  p_data JSONB,
  p_files JSONB DEFAULT '[]'::jsonb
)
RETURNS TABLE(submission_id UUID, receipt_ticket_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_submission_id UUID;
  v_file JSONB;
  v_organization_id UUID;
  v_ticket_id UUID;
  v_path TEXT;
  v_mime TEXT;
  v_size BIGINT;
  v_receipt_ticket_id UUID;
BEGIN
  SELECT organization_id INTO v_organization_id
  FROM forms
  WHERE id = p_form_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Form not found or no longer accepting submissions';
  END IF;

  INSERT INTO submissions (
    form_id, organization_id, name, email, contact_number, date, amount, description, status
  )
  VALUES (
    p_form_id,
    v_organization_id,
    p_data->>'name',
    p_data->>'email',
    p_data->>'contact_number',
    COALESCE((p_data->>'date')::date, CURRENT_DATE),
    COALESCE((p_data->>'amount')::numeric, 0),
    p_data->>'description',
    'new'
  )
  RETURNING id INTO v_submission_id;

  IF jsonb_array_length(p_files) > 0 THEN
    FOR v_file IN SELECT * FROM jsonb_array_elements(p_files)
    LOOP
      v_ticket_id := NULLIF(v_file->>'ticket_id', '')::uuid;

      IF v_ticket_id IS NULL THEN
        RAISE EXCEPTION 'Missing upload ticket';
      END IF;

      UPDATE upload_tickets
      SET consumed_at = now()
      WHERE id = v_ticket_id
        AND form_id = p_form_id
        AND consumed_at IS NULL
        AND expires_at > now()
      RETURNING path INTO v_path;

      IF v_path IS NULL THEN
        RAISE EXCEPTION 'Invalid, expired, or already-used upload ticket';
      END IF;

      SELECT (metadata->>'size')::bigint, metadata->>'mimetype'
      INTO v_size, v_mime
      FROM storage.objects
      WHERE bucket_id = 'submissions' AND name = v_path;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Attachment object not found';
      END IF;

      INSERT INTO files (
        submission_id, filename, path, mime, size, bucket
      )
      VALUES (
        v_submission_id,
        v_file->>'filename',
        v_path,
        v_mime,
        COALESCE(v_size, 0),
        'submissions'
      );
    END LOOP;
  END IF;

  -- Mint a one-time receipt-send capability bound to this exact submission.
  -- 24 hours covers a submitter opening the confirmation email link late;
  -- it is single-use regardless of when it's consumed.
  v_receipt_ticket_id := gen_random_uuid();
  INSERT INTO receipt_tickets (id, submission_id, expires_at)
  VALUES (v_receipt_ticket_id, v_submission_id, now() + interval '24 hours');

  RETURN QUERY SELECT v_submission_id, v_receipt_ticket_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION submit_form(uuid, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION submit_form(uuid, jsonb, jsonb) TO anon, authenticated;
