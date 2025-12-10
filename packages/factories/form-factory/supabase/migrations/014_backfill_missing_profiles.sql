-- Backfill missing profiles from auth.users
-- Some users may not have profiles if they were created before the trigger was set up

-- Insert missing profiles for users that exist in auth.users but not in profiles
INSERT INTO profiles (id, email, name, created_at, updated_at)
SELECT 
  au.id,
  au.email,
  COALESCE(
    au.raw_user_meta_data->>'name',
    au.raw_user_meta_data->>'full_name', 
    SPLIT_PART(au.email, '@', 1)
  ) as name,
  au.created_at,
  NOW()
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM profiles p WHERE p.id = au.id
);

-- Log how many were added
DO $$
DECLARE
  inserted_count INTEGER;
BEGIN
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RAISE NOTICE 'Backfilled % missing profiles', inserted_count;
END $$;
