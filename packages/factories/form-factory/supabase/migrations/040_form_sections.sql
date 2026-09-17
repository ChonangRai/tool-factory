-- Form sections, phase 1.
--
-- Sections live inside forms.settings (settings.sections plus sectionId on
-- each field); there is no sections table and no change to how answers are
-- stored. Two server-side changes are needed:
--
--   1. submit_form snapshots the section a field belonged to at submit time,
--      so renaming a section, moving a field between sections or deleting a
--      section later cannot make an old submission unreadable. The snapshot
--      keeps its existing per-field shape and simply carries three more keys.
--   2. get_public_form stops returning the whole forms row.

-- ---------------------------------------------------------------------------
-- 1. submit_form: section-aware field snapshot
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
  v_settings JSONB;
  v_fields JSONB;
  v_sections JSONB;
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
  IF octet_length(p_data::text) > 200000 THEN
    RAISE EXCEPTION 'Submission is too large';
  END IF;

  SELECT organization_id, COALESCE(settings, '{}'::jsonb)
  INTO v_organization_id, v_settings
  FROM forms
  WHERE id = p_form_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Form not found or no longer accepting submissions';
  END IF;

  v_fields := CASE WHEN jsonb_typeof(v_settings->'fields') = 'array'
                   THEN v_settings->'fields' ELSE '[]'::jsonb END;
  v_sections := CASE WHEN jsonb_typeof(v_settings->'sections') = 'array'
                     THEN v_settings->'sections' ELSE '[]'::jsonb END;

  -- Per-field snapshot, now carrying the owning section. A field whose
  -- sectionId is missing or unknown (every pre-sections form) snapshots with
  -- null section keys and reads back as "no section", which is exactly how
  -- such a form is rendered.
  SELECT COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'id', f->>'id',
           'label', f->>'label',
           'type', f->>'type',
           'order', f->'order',
           'options', f->'options',
           'sectionId', s->>'id',
           'sectionTitle', NULLIF(btrim(COALESCE(s->>'title', '')), ''),
           'sectionOrder', s->'order'
         )) ORDER BY ord), '[]'::jsonb)
  INTO v_snapshot
  FROM jsonb_array_elements(v_fields) WITH ORDINALITY AS t(f, ord)
  LEFT JOIN LATERAL (
    SELECT sec FROM jsonb_array_elements(v_sections) AS x(sec)
    WHERE sec->>'id' = f->>'sectionId'
    LIMIT 1
  ) AS matched(s) ON TRUE
  WHERE jsonb_typeof(f) = 'object' AND f->>'id' IS NOT NULL;

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

REVOKE EXECUTE ON FUNCTION public.submit_form(UUID, JSONB, JSONB) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_form(UUID, JSONB, JSONB) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. get_public_form: only what rendering a form needs
-- ---------------------------------------------------------------------------

-- Previously to_jsonb(f) over the whole row, so an anonymous caller who knew a
-- form id also learned organization_id, created_by, folder_id, deleted_at and
-- both timestamps. A submitter needs the id, the name and the definition.
-- Archived forms (deleted_at) are no longer returned either, matching
-- submit_form, which already refuses them.
CREATE OR REPLACE FUNCTION public.get_public_form(form_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
           'id', f.id,
           'name', f.name,
           'slug', f.slug,
           'settings', COALESCE(f.settings, '{}'::jsonb)
         )
  FROM forms f
  WHERE f.id = form_id AND f.deleted_at IS NULL;
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_form(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_form(UUID) TO anon, authenticated, service_role;
