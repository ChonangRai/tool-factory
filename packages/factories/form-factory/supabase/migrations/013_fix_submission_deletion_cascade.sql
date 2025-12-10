-- Fix permanent deletion of submissions by adding CASCADE to FK constraint
-- and ensuring proper RLS policies for file deletion

-- 1. Update the foreign key constraint to CASCADE on delete
ALTER TABLE files 
DROP CONSTRAINT IF EXISTS files_submission_id_fkey;

ALTER TABLE files
ADD CONSTRAINT files_submission_id_fkey
FOREIGN KEY (submission_id) REFERENCES submissions(id)
ON DELETE CASCADE;

-- 2. Ensure RLS policy allows deleting files when deleting submissions
DROP POLICY IF EXISTS "delete_files" ON files;

CREATE POLICY "delete_files" ON files
FOR DELETE
TO authenticated
USING (
  -- Allow deletion if user is in the same organization as the submission
  submission_id IN (
    SELECT s.id 
    FROM submissions s
    WHERE s.organization_id IN (
      SELECT organization_id 
      FROM user_organization_roles 
      WHERE user_id = auth.uid()
    )
  )
);

-- Note: With CASCADE, when a submission is deleted, all associated files will be automatically deleted
-- The RLS policy ensures users can only delete files from their own organization
