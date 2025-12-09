-- Force fix for invitations email column to be nullable
-- This should have been fixed by 001 migration but may not have applied

-- Drop the NOT NULL constraint if it exists
ALTER TABLE invitations 
ALTER COLUMN email DROP NOT NULL;

-- Verify the change worked
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'invitations' 
    AND column_name = 'email' 
    AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'Email column is still NOT NULL - manual intervention needed';
  ELSE
    RAISE NOTICE 'Email column is now nullable';
  END IF;
END $$;
