-- Persist submitted answers.
--
-- Diagnosis: submissions.data (jsonb) has existed since 001, but no version of
-- submit_form() (005, 029, 030, 032) ever wrote it. Only the summary columns
-- (name, email, contact_number, date, amount, description) were stored, so
-- every other answer was discarded at insert time. Receipts and the collector
-- view had nothing to show beyond id/date. Answers for submissions made before
-- this migration are unrecoverable; only the summary columns remain.
--
-- Changes (forward-only, same submit_form signature and return type):
--   * submissions.data        -- answers keyed by form field id. Only keys that
--                                are non-file fields of the target form are
--                                kept; the client cannot add arbitrary keys.
--   * submissions.field_snapshot -- id/label/type/order/options of the form's
--                                fields at submit time, so a later rename or
--                                deletion does not make old answers unreadable.
--   * files.field_id          -- which file field an attachment belongs to.
--                                Validated against the form; NULL otherwise.
--   * data/field_snapshot are immutable after insert.

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------

ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS field_snapshot JSONB;

ALTER TABLE public.files
  ADD COLUMN IF NOT EXISTS field_id TEXT;

-- Captured answers are a record of what the submitter sent. Collectors may
-- change workflow columns (status, deleted_at) but not the answers themselves.
CREATE OR REPLACE FUNCTION public.protect_submission_answers()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.data IS DISTINCT FROM OLD.data
     OR NEW.field_snapshot IS DISTINCT FROM OLD.field_snapshot THEN
    RAISE EXCEPTION 'Submitted answers cannot be modified'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_submission_answers ON public.submissions;
CREATE TRIGGER protect_submission_answers
  BEFORE UPDATE ON public.submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_submission_answers();

-- ---------------------------------------------------------------------------
-- 2. submit_form
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.submit_form(
  p_form_id UUID,
  p_data JSONB,
  p_files JSONB DEFAULT '[]'::jsonb
)
RETURNS TABLE(submission_id UUID, receipt_ticket_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_submission_id UUID;
  v_file JSONB;
  v_organization_id UUID;
  v_fields JSONB;
  v_snapshot JSONB;
  v_answers JSONB;
  v_file_field_ids TEXT[];
  v_field_id TEXT;
  v_ticket_id UUID;
  v_path TEXT;
  v_mime TEXT;
  v_size BIGINT;
  v_receipt_ticket_id UUID;
BEGIN
  IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object' THEN
    RAISE EXCEPTION 'Invalid submission data';
  END IF;
  IF p_files IS NULL OR jsonb_typeof(p_files) <> 'array' THEN
    RAISE EXCEPTION 'Invalid attachment list';
  END IF;
  -- Abuse bound on the stored payload; generous for text forms.
  IF octet_length(p_data::text) > 200000 THEN
    RAISE EXCEPTION 'Submission is too large';
  END IF;

  SELECT organization_id,
         CASE WHEN jsonb_typeof(settings->'fields') = 'array'
              THEN settings->'fields' ELSE '[]'::jsonb END
  INTO v_organization_id, v_fields
  FROM forms
  WHERE id = p_form_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Form not found or no longer accepting submissions';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'id', f->>'id',
           'label', f->>'label',
           'type', f->>'type',
           'order', f->'order',
           'options', f->'options'
         )) ORDER BY ord), '[]'::jsonb)
  INTO v_snapshot
  FROM jsonb_array_elements(v_fields) WITH ORDINALITY AS t(f, ord)
  WHERE jsonb_typeof(f) = 'object' AND f->>'id' IS NOT NULL;

  -- Keep only answers for non-file fields of this form. File values are the
  -- storage path in the client payload; attachments are recorded in files.
  SELECT COALESCE(jsonb_object_agg(d.key, d.value), '{}'::jsonb)
  INTO v_answers
  FROM jsonb_each(p_data) AS d(key, value)
  WHERE EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_snapshot) s
    WHERE s->>'id' = d.key AND COALESCE(s->>'type', '') <> 'file'
  );

  SELECT COALESCE(array_agg(s->>'id'), ARRAY[]::text[])
  INTO v_file_field_ids
  FROM jsonb_array_elements(v_snapshot) s
  WHERE s->>'type' = 'file';

  INSERT INTO submissions (
    form_id, organization_id, name, email, contact_number, date, amount,
    description, status, data, field_snapshot
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
    'new',
    v_answers,
    v_snapshot
  )
  RETURNING id INTO v_submission_id;

  IF jsonb_array_length(p_files) > 0 THEN
    FOR v_file IN SELECT * FROM jsonb_array_elements(p_files)
    LOOP
      v_ticket_id := NULLIF(v_file->>'ticket_id', '')::uuid;

      IF v_ticket_id IS NULL THEN
        RAISE EXCEPTION 'Missing upload ticket';
      END IF;

      v_path := NULL;
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

      v_field_id := v_file->>'field_id';
      IF v_field_id IS NOT NULL AND NOT (v_field_id = ANY (v_file_field_ids)) THEN
        v_field_id := NULL;
      END IF;

      INSERT INTO files (
        submission_id, filename, path, mime, size, bucket, field_id
      )
      VALUES (
        v_submission_id,
        left(COALESCE(NULLIF(v_file->>'filename', ''), 'attachment'), 255),
        v_path,
        v_mime,
        COALESCE(v_size, 0),
        'submissions',
        v_field_id
      );
    END LOOP;
  END IF;

  v_receipt_ticket_id := gen_random_uuid();
  INSERT INTO receipt_tickets (id, submission_id, expires_at)
  VALUES (v_receipt_ticket_id, v_submission_id, now() + interval '24 hours');

  RETURN QUERY SELECT v_submission_id, v_receipt_ticket_id;
END;
$$;

-- Unchanged from 035: only the public-anon-gate (service role) may call it.
REVOKE EXECUTE ON FUNCTION public.submit_form(UUID, JSONB, JSONB) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_form(UUID, JSONB, JSONB) TO service_role;

REVOKE EXECUTE ON FUNCTION public.protect_submission_answers() FROM anon, authenticated, PUBLIC;
