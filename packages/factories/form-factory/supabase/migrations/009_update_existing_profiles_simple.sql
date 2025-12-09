-- Simple fix to update existing profiles with names from auth.users
-- This directly updates the profiles table

-- Update profiles that have NULL, empty, or 'Unknown' names
UPDATE profiles p
SET 
  name = COALESCE(
    -- Try to get name from auth.users metadata
    (SELECT TRIM(u.raw_user_meta_data->>'name') 
     FROM auth.users u 
     WHERE u.id = p.id 
     AND TRIM(u.raw_user_meta_data->>'name') IS NOT NULL 
     AND TRIM(u.raw_user_meta_data->>'name') != ''),
    -- Fallback to full_name
    (SELECT TRIM(u.raw_user_meta_data->>'full_name') 
     FROM auth.users u 
     WHERE u.id = p.id 
     AND TRIM(u.raw_user_meta_data->>'full_name') IS NOT NULL 
     AND TRIM(u.raw_user_meta_data->>'full_name') != ''),
    -- Fallback to display_name
    (SELECT TRIM(u.raw_user_meta_data->>'display_name') 
     FROM auth.users u 
     WHERE u.id = p.id 
     AND TRIM(u.raw_user_meta_data->>'display_name') IS NOT NULL 
     AND TRIM(u.raw_user_meta_data->>'display_name') != ''),
    -- Last resort: use part before @ in email
    split_part(p.email, '@', 1)
  )
WHERE 
  name IS NULL 
  OR TRIM(name) = '' 
  OR name = 'Unknown';

-- Also ensure emails are correct
UPDATE profiles p
SET email = (SELECT email FROM auth.users WHERE id = p.id)
WHERE 
  email IS NULL 
  OR TRIM(email) = '' 
  OR email = 'Unknown'
  OR email != (SELECT email FROM auth.users WHERE id = p.id);

-- Show results
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO updated_count
  FROM profiles
  WHERE name IS NOT NULL AND TRIM(name) != '' AND name != 'Unknown';
  
  RAISE NOTICE 'Successfully updated profiles. Total profiles with valid names: %', updated_count;
END $$;
