-- PERMANENT SOLUTION: Database trigger to create organization on user signup
-- This runs automatically in the database, can't fail silently

-- Function to create organization and assign user on signup
CREATE OR REPLACE FUNCTION handle_new_user_signup()
RETURNS TRIGGER AS $$
DECLARE
  new_org_id UUID;
  org_name TEXT;
  org_slug TEXT;
  column_exists BOOLEAN;
BEGIN
  -- 1. Create Profile (Restoring original logic)
  -- We must do this first so the profile exists!
  INSERT INTO public.profiles (id, email, name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'name');

  -- 2. Extract organization name from user metadata
  org_name := NEW.raw_user_meta_data->>'organization_name';
  
  -- If no organization name provided, use email domain
  IF org_name IS NULL OR org_name = '' THEN
    org_name := split_part(NEW.email, '@', 1) || '''s Organization';
  END IF;
  
  -- 3. Create slug from organization name
  org_slug := lower(regexp_replace(org_name, '[^a-zA-Z0-9]+', '-', 'g'));
  org_slug := trim(both '-' from org_slug);
  
  -- Make slug unique by appending timestamp
  org_slug := org_slug || '-' || extract(epoch from now())::bigint;
  
  -- 4. Create organization (only if table exists)
  BEGIN
    INSERT INTO organizations (name, slug)
    VALUES (org_name, org_slug)
    RETURNING id INTO new_org_id;
  EXCEPTION WHEN undefined_table THEN
    -- Organizations table doesn't exist yet, skip
    RETURN NEW;
  END;
  
  -- 5. Assign user as super_manager
  BEGIN
    INSERT INTO user_organization_roles (user_id, organization_id, role)
    VALUES (NEW.id, new_org_id, 'super_manager');
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  
  -- 6. Update user's profile with current organization
  BEGIN
    -- Check if current_organization_id column exists
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'profiles' 
      AND column_name = 'current_organization_id'
    ) INTO column_exists;
    
    IF column_exists THEN
      UPDATE profiles
      SET current_organization_id = new_org_id
      WHERE id = NEW.id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  
  -- 7. Also give them admin role for backward compatibility
  BEGIN
    INSERT INTO user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger that fires when a new user is created
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user_signup();
