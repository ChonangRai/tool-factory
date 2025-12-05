-- Add foreign key to profiles to allow joining in API
-- This is necessary because the existing FK points to auth.users which is not exposed to PostgREST
ALTER TABLE user_organization_roles
ADD CONSTRAINT user_organization_roles_user_id_fkey_profiles
FOREIGN KEY (user_id)
REFERENCES profiles(id)
ON DELETE CASCADE;
