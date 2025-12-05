-- Add soft delete functionality to submissions
-- Add deleted_at and archived_at timestamps for soft delete with restore capability

ALTER TABLE submissions 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES auth.users(id);

-- Create index for faster queries on non-deleted submissions
CREATE INDEX IF NOT EXISTS idx_submissions_deleted_at ON submissions(deleted_at) WHERE deleted_at IS NULL;

-- Add comment
COMMENT ON COLUMN submissions.deleted_at IS 'Soft delete timestamp. Submissions can be restored within 7 days.';
COMMENT ON COLUMN submissions.archived_by IS 'User who archived/deleted this submission';
