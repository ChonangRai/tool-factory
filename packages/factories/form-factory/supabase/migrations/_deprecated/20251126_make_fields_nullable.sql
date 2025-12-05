-- Make optional fields nullable in the submissions table
ALTER TABLE submissions
  ALTER COLUMN email DROP NOT NULL,
  ALTER COLUMN date DROP NOT NULL,
  ALTER COLUMN description DROP NOT NULL,
  ALTER COLUMN amount DROP NOT NULL;
  ALTER COLUMN contact_number DROP NOT NULL;
  ALTER COLUMN name DROP NOT NULL;
