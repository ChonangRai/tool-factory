-- Deprecated migration: old signup trigger (017) – no longer applied

-- This file is kept for history but no longer applied.

CREATE OR REPLACE FUNCTION handle_new_user_signup()
RETURNS TRIGGER AS $$
DECLARE
  new_org_id UUID;
  org_name TEXT;
  org_slug TEXT;
  column_exists BOOLEAN;
  invite_org_id UUID;
BEGIN
  -- 1. Create Profile
  INSERT INTO public.profiles (id, email, name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'name');

  -- 2. Check if this is an invite (joining existing org)
  -- Cast to UUID safely
  BEGIN
    invite_org_id := (NEW.raw_user_meta_data->>'organization_id')::UUID;
  EXCEPTION WHEN OTHERS THEN
    invite_org_id := NULL;
  END;

  IF invite_org_id IS NOT NULL THEN
    -- JOINING EXISTING ORGANIZATION
    
    -- Verify organization exists
    IF EXISTS (SELECT 1 FROM organizations WHERE id = invite_org_id) THEN
      new_org_id := invite_org_id;
      
      -- Assign 'staff' role for invited users
      INSERT INTO user_organization_roles (user_id, organization_id, role)
      VALUES (NEW.id, new_org_id, 'staff');
      
    ELSE
      -- Fallback if org doesn't exist: Create new one (Standard Flow)
      invite_org_id := NULL; 
    END IF;
  END IF;

  -- 3. Standard Signup (Create New Org) if not an invite
  IF invite_org_id IS NULL THEN
    -- Extract organization name
    org_name := NEW.raw_user_meta_data->>'organization_name';
    
    -- If no organization name provided, use email domain
    IF org_name IS NULL OR org_name = '' THEN
      org_name := split_part(NEW.email, '@', 1) || '''s Organization';
    END IF;
    
    -- Create slug
    org_slug := lower(regexp_replace(org_name, '[^a-zA-Z0-9]+', '-', 'g'));
    org_slug := trim(both '-' from org_slug);
    org_slug := org_slug || '-' || extract(epoch from now())::bigint;
    
    -- Create organization
    INSERT INTO organizations (name, slug)
    VALUES (org_name, org_slug)
    RETURNING id INTO new_org_id;
    
    -- Assign 'super_manager' role for creator
    INSERT INTO user_organization_roles (user_id, organization_id, role)
    VALUES (NEW.id, new_org_id, 'super_manager');
    
    -- Also give admin role for backward compatibility
    INSERT INTO user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  
  -- 4. Update user's profile with current organization
  UPDATE profiles
  SET current_organization_id = new_org_id
  WHERE id = NEW.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
