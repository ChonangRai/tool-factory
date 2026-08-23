-- Secure the `submissions` Storage bucket. Forward-only; does not edit
-- 004_storage_bucket_setup.sql or 005_submit_form_function.sql.
--
-- Confirmed before writing this (see accompanying report): the object
-- lifecycle is upload-to-Storage FIRST (client-chosen path, no submission
-- exists yet), THEN a single submit_form() RPC call creates the submission
-- row and, in the same SECURITY DEFINER transaction, the files row(s) from
-- a client-supplied JSON array -- including a client-supplied `path`. That
-- means `files.path = storage.objects.name` was NOT an authoritative,
-- unforgeable relationship: a client could call submit_form with a `path`
-- pointing at an object it never uploaded (e.g. one it merely knows the
-- name of), creating a `files` row under its own org that would then pass
-- any org-membership join check on that path. Fixed below in submit_form
-- itself, not just at the RLS layer.

-- ============================================================
-- 1. BUCKET: make private
-- ============================================================

UPDATE storage.buckets SET public = false WHERE id = 'submissions';

-- ============================================================
-- 2. STORAGE.OBJECTS -- replace all three legacy permissive policies
-- (Anyone can upload / Workspace members can view / Workspace members can
-- delete). None of the new policies coexist with the old ones -- all three
-- original policies are dropped by name first.
-- ============================================================

DROP POLICY IF EXISTS "Anyone can upload submission files" ON storage.objects;
DROP POLICY IF EXISTS "Workspace members can view files" ON storage.objects;
DROP POLICY IF EXISTS "Workspace members can delete files" ON storage.objects;

-- Helper, SECURITY DEFINER like has_org_role/has_manager/etc elsewhere in
-- this project: a raw `EXISTS (SELECT ... FROM forms ...)` inside a
-- storage.objects policy would itself be subject to forms' own RLS
-- (strict_forms_select_final, `TO authenticated` only), which returns zero
-- rows for anon -- silently breaking every anonymous upload. Confirmed by
-- reproducing exactly that failure against the real local Storage API
-- before adding this. row_security is turned off only for this lookup.
CREATE OR REPLACE FUNCTION form_accepts_uploads(p_form_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  SET LOCAL row_security = off;
  RETURN EXISTS (
    SELECT 1 FROM forms WHERE id::text = p_form_id AND deleted_at IS NULL
  );
END;
$$;

-- INSERT: anonymous public-form submitters must still be able to upload.
-- The object path's first segment must be a real, non-deleted form id --
-- the same information already required to submit to that form at all, so
-- this changes no legitimate behavior. It stops an arbitrary bucket-wide
-- path from being used and, combined with the submit_form hardening below,
-- means an uploaded object can only ever be legitimately claimed by a
-- submission to the same form.
CREATE POLICY "storage_insert_valid_form_path" ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'submissions'
  AND form_accepts_uploads(split_part(storage.objects.name, '/', 1))
);

-- SELECT: authenticated org members only, and only for objects a `files`
-- row genuinely ties to a submission in one of their orgs. No anon branch
-- (anon never needs to read after uploading -- see storage.ts change).
-- Fails closed: a submission with a null organization_id matches no one.
CREATE POLICY "storage_select_org_scoped" ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'submissions'
  AND EXISTS (
    SELECT 1 FROM files fl
    JOIN submissions s ON s.id = fl.submission_id
    WHERE fl.path = storage.objects.name
      AND s.organization_id IS NOT NULL
      AND s.organization_id IN (SELECT organization_id FROM user_organization_roles WHERE user_id = auth.uid())
  )
);

-- DELETE: same org-membership scope as the existing `delete_files` policy
-- on the files table (any org member, not just manager+ -- matches current
-- DB-level authorization for this same logical operation; the app's own UI
-- additionally restricts the delete button to super_manager, which this
-- does not change).
CREATE POLICY "storage_delete_org_scoped" ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'submissions'
  AND EXISTS (
    SELECT 1 FROM files fl
    JOIN submissions s ON s.id = fl.submission_id
    WHERE fl.path = storage.objects.name
      AND s.organization_id IS NOT NULL
      AND s.organization_id IN (SELECT organization_id FROM user_organization_roles WHERE user_id = auth.uid())
  )
);

-- No UPDATE policy: no application flow updates an object's content or
-- metadata in place. Denied by default.

-- ============================================================
-- 3. FILES table -- close the remaining gaps that undermine the join above
-- ============================================================

-- 3a. Remove the fail-open null-organization fallback from view_files (the
-- is_admin() bypass on this policy was already removed in 028). A file
-- whose submission has no resolvable organization is now invisible to
-- everyone (fails closed) instead of visible to any authenticated user.
DROP POLICY IF EXISTS "view_files" ON files;

CREATE POLICY "view_files" ON files
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM submissions s
    WHERE s.id = files.submission_id
      AND s.organization_id IS NOT NULL
      AND s.organization_id IN (SELECT organization_id FROM user_organization_roles WHERE user_id = auth.uid())
  )
);

-- 3b. Close direct client INSERT on files. This table has never had a
-- legitimate direct-insert caller in the frontend (grepped: none) --
-- anonymous attachment records are created exclusively inside submit_form,
-- which is SECURITY DEFINER and therefore unaffected by this policy. What
-- this closes is a client calling `.from('files').insert(...)` directly
-- with an attacker-chosen submission_id/path/bucket, which the previous
-- `WITH CHECK (true)` (role: public) allowed outright.
DROP POLICY IF EXISTS "upload_files" ON files;

CREATE POLICY "files_insert_org_scoped" ON files
FOR INSERT
TO authenticated
WITH CHECK (
  submission_id IN (
    SELECT s.id FROM submissions s
    WHERE s.organization_id IN (SELECT organization_id FROM user_organization_roles WHERE user_id = auth.uid())
  )
);

-- ============================================================
-- 4. submit_form -- make the files.path it writes authoritative
-- Every p_files[].path is now required to (a) be under the form actually
-- being submitted to, and (b) already exist as a real object in the
-- submissions bucket -- both checked with a SECURITY DEFINER read of
-- storage.objects, which this function's owner can see regardless of the
-- SELECT policy above. Everything else in this function is unchanged from
-- 005_submit_form_function.sql.
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
  v_path TEXT;
  v_prefix TEXT;
BEGIN
  SELECT organization_id INTO v_organization_id
  FROM forms
  WHERE id = p_form_id;

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
    v_prefix := p_form_id::text || '/';

    FOR v_file IN SELECT * FROM jsonb_array_elements(p_files)
    LOOP
      v_path := v_file->>'path';

      IF v_path IS NULL OR left(v_path, length(v_prefix)) <> v_prefix THEN
        RAISE EXCEPTION 'Invalid attachment path';
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM storage.objects
        WHERE bucket_id = 'submissions' AND name = v_path
      ) THEN
        RAISE EXCEPTION 'Attachment object not found';
      END IF;

      INSERT INTO files (
        submission_id, filename, path, mime, size, bucket
      )
      VALUES (
        v_submission_id,
        v_file->>'filename',
        v_path,
        v_file->>'mime',
        COALESCE((v_file->>'size')::integer, 0),
        'submissions'
      );
    END LOOP;
  END IF;

  RETURN v_submission_id;
END;
$$;
