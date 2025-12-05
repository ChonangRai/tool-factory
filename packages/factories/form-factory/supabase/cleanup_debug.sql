-- CLEANUP SCRIPT
-- Run this to remove debug artifacts and restore production performance

-- 1. Drop the debug_logs table
DROP TABLE IF EXISTS debug_logs;

-- 2. Restore the clean, production-ready trigger (no logging overhead)
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
  
  -- 7. Also give them admin role for backward compatibility
  INSERT INTO user_roles (user_id, role)
  VALUES (NEW.id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
