-- Drop the FK constraint to profiles
ALTER TABLE user_organization_roles
DROP CONSTRAINT IF EXISTS user_organization_roles_user_id_fkey_profiles;
