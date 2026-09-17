-- Submission purge hardening.
--
-- Diagnosis: the only permanent-delete path (ArchivedSubmissions.tsx) removed
-- attachments from a bucket named 'form-submissions', which does not exist.
-- The Storage call no-op'd, the submission and its files rows were deleted,
-- and the objects in 'submissions' were left behind with nothing pointing at
-- them. The client now removes from the real bucket before deleting rows
-- (src/lib/submissionPurge.ts). Storage removal must go through the Storage
-- API; storage.objects is never deleted directly.
--
-- Changes (forward-only):
--   * Storage DELETE on 'submissions' now requires the same roles as deleting
--     the submission itself (super_manager/manager). Previously any org member
--     could remove an attachment while being unable to delete its submission.
--     The policy still requires a files row joining the object to a submission
--     in the caller's organization, so foreign-org objects stay undeletable.
--   * Submission deletes are audited. They were not, so an unexpected hard
--     delete could not be attributed to anyone.

-- ---------------------------------------------------------------------------
-- 1. Storage DELETE: align with submissions DELETE
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "storage_delete_org_scoped" ON storage.objects;
CREATE POLICY "storage_delete_org_scoped" ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'submissions'
  AND EXISTS (
    SELECT 1
    FROM public.files fl
    JOIN public.submissions s ON s.id = fl.submission_id
    WHERE fl.path = storage.objects.name
      AND fl.bucket = 'submissions'
      AND s.organization_id IS NOT NULL
      AND public.has_manager(s.organization_id)
  )
);

-- ---------------------------------------------------------------------------
-- 2. Audit submission deletes
-- ---------------------------------------------------------------------------

-- BEFORE DELETE so the attachment count is still visible (files cascade).
-- submission_id is left NULL: that FK is ON DELETE SET NULL and the row is
-- about to disappear; resource_id carries the id. Organization deletes are
-- already collapsed into one event by log_audit_event (037).
CREATE OR REPLACE FUNCTION public.audit_submission_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.organization_id IS NOT NULL THEN
    PERFORM log_audit_event(
      OLD.organization_id, 'submission.deleted', 'submission', OLD.id,
      jsonb_build_object(
        'form_id', OLD.form_id,
        'created_at', OLD.created_at,
        'archived_at', OLD.deleted_at,
        'file_count', (SELECT count(*) FROM files f WHERE f.submission_id = OLD.id)
      )
    );
  END IF;
  RETURN OLD;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.audit_submission_delete() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS trg_audit_submission_delete ON public.submissions;
CREATE TRIGGER trg_audit_submission_delete
  BEFORE DELETE ON public.submissions
  FOR EACH ROW EXECUTE FUNCTION public.audit_submission_delete();
