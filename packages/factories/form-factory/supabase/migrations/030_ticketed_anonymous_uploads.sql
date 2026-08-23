-- Close the same-form object-claiming gap left by 029: any anonymous user
-- who learns another submitter's exact object path (network observation,
-- log leak, anything) could call submit_form() with that path and have it
-- attached to their own submission -- reproduced and confirmed live before
-- writing this (see accompanying report). Path secrecy was the only thing
-- stopping this. Superseding, not editing, 029's INSERT policy and
-- submit_form() -- forward-only.
--
-- Also aligns submit_form()'s form eligibility check with
-- form_accepts_uploads()'s (both now reject deleted forms; submit_form
-- previously did not check deleted_at at all).

-- ============================================================
-- 1. Ticket table -- no client-facing RLS policy at all. Only the
-- SECURITY DEFINER functions below ever read or write it, so it grants no
-- read/list capability regardless of what a client knows about it.
-- ============================================================

CREATE TABLE IF NOT EXISTS upload_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES forms(id),
  path TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
);

ALTER TABLE upload_tickets ENABLE ROW LEVEL SECURITY;
-- Intentionally zero policies: default-deny for every client role.

-- ============================================================
-- 2. Issue a ticket: server generates the path, the form is validated
-- against the exact same rule submit_form now also checks (exists, not
-- deleted). 30 minutes covers the slow-path UI flow in SubmitReceipt.tsx
-- (OCR quality-warning confirmation dialog) without leaving tickets valid
-- indefinitely.
-- ============================================================

CREATE OR REPLACE FUNCTION create_upload_ticket(p_form_id UUID)
RETURNS TABLE(ticket_id UUID, path TEXT, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ticket_id UUID;
  v_path TEXT;
  v_expires TIMESTAMPTZ;
BEGIN
  IF NOT form_accepts_uploads(p_form_id::text) THEN
    RAISE EXCEPTION 'Form not found or not accepting uploads';
  END IF;

  v_ticket_id := gen_random_uuid();
  v_path := p_form_id::text || '/' || gen_random_uuid()::text;
  v_expires := now() + interval '30 minutes';

  INSERT INTO upload_tickets (id, form_id, path, expires_at)
  VALUES (v_ticket_id, p_form_id, v_path, v_expires);

  RETURN QUERY SELECT v_ticket_id, v_path, v_expires;
END;
$$;

REVOKE EXECUTE ON FUNCTION create_upload_ticket(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_upload_ticket(UUID) TO anon, authenticated;

-- ============================================================
-- 3. Storage INSERT policy: an object may only be written to a path that
-- has a live (unexpired, unconsumed) ticket -- not just "any path under a
-- valid form", as in 029. SECURITY DEFINER + row_security off, same reason
-- as form_accepts_uploads: a raw subquery against upload_tickets here would
-- see zero rows for anon regardless (no policy grants it), but this table
-- has literally no client policy at all, so a direct correlated subquery
-- would always evaluate empty -- must go through a bypassing function.
-- ============================================================

CREATE OR REPLACE FUNCTION upload_ticket_valid_for_path(p_path TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  SET LOCAL row_security = off;
  RETURN EXISTS (
    SELECT 1 FROM upload_tickets
    WHERE path = p_path AND consumed_at IS NULL AND expires_at > now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION upload_ticket_valid_for_path(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION upload_ticket_valid_for_path(TEXT) TO anon, authenticated;

DROP POLICY IF EXISTS "storage_insert_valid_form_path" ON storage.objects;

CREATE POLICY "storage_insert_ticketed_path" ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'submissions'
  AND upload_ticket_valid_for_path(storage.objects.name)
);

-- ============================================================
-- 4. submit_form: files are now finalized by presenting the ticket_id
-- returned only to whoever called create_upload_ticket, not by asserting a
-- path. Consuming the ticket is a single atomic UPDATE ... WHERE
-- consumed_at IS NULL, so under a race between the legitimate submitter and
-- anyone else who somehow obtained the same ticket_id, only one can ever
-- win -- there is no separate check-then-act window. filename is the only
-- client-supplied file field left; mime/size now come from the real object
-- recorded in storage.objects.metadata instead of the client's own claim.
-- ============================================================

CREATE OR REPLACE FUNCTION submit_form(
  p_form_id UUID,
  p_data JSONB,
  p_files JSONB DEFAULT '[]'::jsonb
)
RETURNS UUID
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

      -- Atomic single-use consumption: exactly one caller can ever win this.
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

  RETURN v_submission_id;
END;
$$;
