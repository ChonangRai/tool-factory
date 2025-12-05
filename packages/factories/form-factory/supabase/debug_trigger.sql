-- DEBUG SCRIPT
-- Run this in Supabase SQL Editor to test the trigger logic manually

-- 1. Create a debug_logs table to capture errors
CREATE TABLE IF NOT EXISTS debug_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Update the trigger function to log progress and errors
CREATE OR REPLACE FUNCTION handle_new_user_signup()
RETURNS TRIGGER AS $$
DECLARE
  new_org_id UUID;
  org_name TEXT;
  org_slug TEXT;
BEGIN
  -- Log start
  INSERT INTO debug_logs (message, details) VALUES ('Trigger started', to_jsonb(NEW));

  -- 1. Create Profile
  BEGIN
    INSERT INTO public.profiles (id, email, name)
    VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'name');
    INSERT INTO debug_logs (message) VALUES ('Profile created');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO debug_logs (message, details) VALUES ('Error creating profile', jsonb_build_object('error', SQLERRM));
    RAISE; -- Re-raise error to stop process
  END;

  -- 2. Extract organization name
  org_name := NEW.raw_user_meta_data->>'organization_name';
  IF org_name IS NULL OR org_name = '' THEN
    org_name := split_part(NEW.email, '@', 1) || '''s Organization';
  END IF;
  
  -- 3. Create slug
  org_slug := lower(regexp_replace(org_name, '[^a-zA-Z0-9]+', '-', 'g'));
  org_slug := trim(both '-' from org_slug);
  org_slug := org_slug || '-' || extract(epoch from now())::bigint;
  
  -- 4. Create organization
  BEGIN
    INSERT INTO organizations (name, slug)
    VALUES (org_name, org_slug)
    RETURNING id INTO new_org_id;
    INSERT INTO debug_logs (message, details) VALUES ('Organization created', jsonb_build_object('id', new_org_id));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO debug_logs (message, details) VALUES ('Error creating organization', jsonb_build_object('error', SQLERRM));
    RAISE;
  END;
  
  -- 5. Assign user as super_manager
  BEGIN
    INSERT INTO user_organization_roles (user_id, organization_id, role)
    VALUES (NEW.id, new_org_id, 'super_manager');
    INSERT INTO debug_logs (message) VALUES ('Role assigned');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO debug_logs (message, details) VALUES ('Error assigning role', jsonb_build_object('error', SQLERRM));
    RAISE;
  END;
  
  -- 6. Update user's profile with current organization
  BEGIN
    UPDATE profiles
    SET current_organization_id = new_org_id
    WHERE id = NEW.id;
    INSERT INTO debug_logs (message) VALUES ('Profile updated');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO debug_logs (message, details) VALUES ('Error updating profile', jsonb_build_object('error', SQLERRM));
    RAISE;
  END;
  
  -- 7. Also give them admin role for backward compatibility
  BEGIN
    INSERT INTO user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
    INSERT INTO debug_logs (message) VALUES ('Admin role assigned');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO debug_logs (message, details) VALUES ('Error assigning admin role', jsonb_build_object('error', SQLERRM));
    -- Don't raise here, strictly optional
  END;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
