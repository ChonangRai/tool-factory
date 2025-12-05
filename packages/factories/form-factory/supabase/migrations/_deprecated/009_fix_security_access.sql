-- Fix Security Issue: Stop assigning global admin role to new users
-- This migration updates the signup trigger and cleans up existing roles

-- 1. Update the trigger function to REMOVE the step that assigns 'admin' role
CREATE OR REPLACE FUNCTION handle_new_user_signup()
RETURNS TRIGGER AS $$
DECLARE
  new_org_id UUID;
  org_name TEXT;
  org_slug TEXT;
  column_exists BOOLEAN;
BEGIN
  -- 1. Create Profile
  INSERT INTO public.profiles (id, email, name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'name');

  -- 2. Extract organization name
  org_name := NEW.raw_user_meta_data->>'organization_name';
  
  -- If no organization name provided, use email domain
  IF org_name IS NULL OR org_name = '' THEN
    org_name := split_part(NEW.email, '@', 1) || '''s Organization';
  END IF;
  
  -- 3. Create slug
  org_slug := lower(regexp_replace(org_name, '[^a-zA-Z0-9]+', '-', 'g'));
  org_slug := trim(both '-' from org_slug);
  org_slug := org_slug || '-' || extract(epoch from now())::bigint;
  
  -- 4. Create organization
  INSERT INTO organizations (name, slug)
  VALUES (org_name, org_slug)
  RETURNING id INTO new_org_id;
  
  -- 5. Assign user as super_manager
  INSERT INTO user_organization_roles (user_id, organization_id, role)
  VALUES (NEW.id, new_org_id, 'super_manager');
  
  -- 6. Update user's profile with current organization
  UPDATE profiles
  SET current_organization_id = new_org_id
  WHERE id = NEW.id;
  
  -- REMOVED: 7. Also give them admin role for backward compatibility
  -- This was causing the security issue where everyone could see everything.
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Revoke 'admin' role from existing users who are NOT platform admins
-- CAUTION: This assumes you (the owner) will manually add yourself as 'platform_admin' if needed.
-- Or we can leave it to you to clean up manually.
-- For safety, let's just delete ALL 'admin' roles from user_roles table, 
-- because in the new system, 'admin' in user_roles implies GLOBAL access.
-- Real users should only have roles in user_organization_roles.

DELETE FROM user_roles WHERE role = 'admin';

-- 3. Ensure 'platform_admin' exists in enum (it should, but just in case)
-- (Already done in schema_v2, but good to be safe)

-- NOTE: After running this, YOU (the owner) might lose access to "See Everything" mode 
-- until you give yourself the 'platform_admin' role.
-- You can do this in the SQL Editor:
-- INSERT INTO user_roles (user_id, role) VALUES ('your-user-id-here', 'platform_admin');
