-- Debug script to check what's in profiles and auth.users for invited users

-- 1. Check all profiles with Unknown or empty names
SELECT 
  p.id,
  p.email,
  p.name as profile_name,
  u.email as auth_email,
  u.raw_user_meta_data->>'name' as metadata_name,
  u.raw_user_meta_data->>'full_name' as metadata_full_name,
  u.raw_user_meta_data->>'display_name' as metadata_display_name,
  u.raw_user_meta_data as full_metadata,
  p.created_at
FROM profiles p
LEFT JOIN auth.users u ON p.id = u.id
WHERE p.name IS NULL 
   OR TRIM(p.name) = '' 
   OR p.name = 'Unknown'
ORDER BY p.created_at DESC;

-- 2. Check user_organization_roles to see which users are invited (not super_manager)
SELECT 
  uor.user_id,
  p.name,
  p.email,
  uor.role,
  uor.created_at
FROM user_organization_roles uor
JOIN profiles p ON uor.user_id = p.id
WHERE uor.role IN ('staff', 'manager')
ORDER BY uor.created_at DESC
LIMIT 10;
