-- Add soft delete functionality to forms
-- Add deleted_at timestamp for soft delete with restore capability

ALTER TABLE forms 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Create index for faster queries on non-deleted forms
CREATE INDEX IF NOT EXISTS idx_forms_deleted_at ON forms(deleted_at) WHERE deleted_at IS NULL;

-- Add comment
COMMENT ON COLUMN forms.deleted_at IS 'Soft delete timestamp. Forms can be restored.';
