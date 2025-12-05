-- Repair corrupted file paths
-- This script fixes entries in the 'files' table where the 'path' column contains a JSON string
-- instead of a clean file path. This happened due to a bug in the frontend code.

DO $$
DECLARE
  r RECORD;
  clean_path TEXT;
BEGIN
  FOR r IN SELECT id, path FROM files WHERE path LIKE '{%' LOOP
    BEGIN
      -- Extract the 'path' field from the JSON string
      clean_path := (r.path::jsonb)->>'path';
      
      IF clean_path IS NOT NULL THEN
        UPDATE files
        SET path = clean_path
        WHERE id = r.id;
        
        RAISE NOTICE 'Fixed file id %: % -> %', r.id, r.path, clean_path;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not fix file id %: %', r.id, r.path;
    END;
  END LOOP;
END $$;
