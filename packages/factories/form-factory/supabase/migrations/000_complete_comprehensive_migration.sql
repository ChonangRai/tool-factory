-- ============================================================
-- COMPREHENSIVE MIGRATION FOR FORM FACTORY
-- ============================================================
-- This is a complete, all-in-one migration that includes:
-- 1. All database schema (tables, indexes, constraints)
-- 2. Row Level Security (RLS) policies
-- 3. Triggers and functions for user signup
-- 4. Bug fixes and security enhancements
--
-- Run this migration ONCE on a fresh Supabase database
-- ============================================================

-- ============================================================
-- 1. ENUMS
-- ============================================================

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
        CREATE TYPE app_role AS ENUM ('admin', 'platform_admin', 'super_manager', 'manager', 'staff', 'guest');
    END IF;
END $$;

-- ============================================================
-- 2. CORE TABLES
-- ============================================================

-- Organizations Table
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Profiles Table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  current_organization_id UUID REFERENCES organizations(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User Roles Table (Global/Platform roles)
CREATE TABLE IF NOT EXISTS user_roles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, role)
);

-- User Organization Roles Table (Multi-tenancy roles)
CREATE TABLE IF NOT EXISTS user_organization_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('super_manager', 'manager', 'staff')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, organization_id)
);

-- Invitations Table (for secure invite-token flow)
CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT,  -- Made nullable to allow generic invite links
  role TEXT NOT NULL CHECK (role IN ('super_manager', 'manager', 'staff')),
  token TEXT UNIQUE NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Debug Logs Table (for trigger debugging)
CREATE TABLE IF NOT EXISTS debug_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step TEXT NOT NULL,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. APPLICATION TABLES
-- ============================================================

-- Folders Table
CREATE TABLE IF NOT EXISTS folders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Forms Table
CREATE TABLE IF NOT EXISTS forms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  settings JSONB,
  folder_id UUID REFERENCES folders(id),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id),
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Submissions Table
CREATE TABLE IF NOT EXISTS submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  form_id UUID REFERENCES forms(id) NOT NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  data JSONB DEFAULT '{}'::jsonb,
  name TEXT,
  email TEXT,
  contact_number TEXT,
  description TEXT,
  amount DECIMAL(10, 2),
  date DATE,
  status TEXT NOT NULL DEFAULT 'new',
  submitter_ip TEXT,
  captcha_score NUMERIC,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Files Table
CREATE TABLE IF NOT EXISTS files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID REFERENCES submissions(id) NOT NULL,
  filename TEXT NOT NULL,
  path TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  bucket TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID REFERENCES submissions(id),
  admin_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 4. INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_user_org_roles_user ON user_organization_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_org_roles_org ON user_organization_roles(organization_id);
CREATE INDEX IF NOT EXISTS idx_forms_org ON forms(organization_id);
CREATE INDEX IF NOT EXISTS idx_submissions_org ON submissions(organization_id);
CREATE INDEX IF NOT EXISTS idx_submissions_form ON submissions(form_id);

-- ============================================================
-- 5. ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_organization_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE debug_logs ENABLE ROW LEVEL SECURITY;

-- Helper Function: is_admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'platform_admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper Function: has_org_role
CREATE OR REPLACE FUNCTION has_org_role(org_id UUID, required_role TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_organization_roles
    WHERE user_id = auth.uid()
    AND organization_id = org_id
    AND role = required_role
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- user_roles
DROP POLICY IF EXISTS "Users can read own role" ON user_roles;
CREATE POLICY "Users can read own role" ON user_roles FOR SELECT USING (auth.uid() = user_id);

-- user_organization_roles
DROP POLICY IF EXISTS "view_own_org_roles" ON user_organization_roles;
CREATE POLICY "view_own_org_roles" ON user_organization_roles 
FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "super_manager_manage_roles" ON user_organization_roles;
CREATE POLICY "super_manager_manage_roles" ON user_organization_roles
FOR ALL USING (
  has_org_role(organization_id, 'super_manager')
);

-- profiles
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
CREATE POLICY "Users can read own profile" ON profiles FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- organizations
DROP POLICY IF EXISTS "authenticated_users_view_orgs" ON organizations;
CREATE POLICY "authenticated_users_view_orgs" ON organizations FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_users_create_orgs" ON organizations;
CREATE POLICY "authenticated_users_create_orgs" ON organizations FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "org_members_update_orgs" ON organizations;
CREATE POLICY "org_members_update_orgs" ON organizations FOR UPDATE TO authenticated USING (
  has_org_role(id, 'super_manager') OR has_org_role(id, 'manager')
);

-- forms
DROP POLICY IF EXISTS "view_forms" ON forms;
CREATE POLICY "view_forms" ON forms FOR SELECT USING (
  is_admin() OR 
  organization_id IN (SELECT organization_id FROM user_organization_roles WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "create_forms" ON forms;
CREATE POLICY "create_forms" ON forms FOR INSERT WITH CHECK (
  is_admin() OR 
  organization_id IN (SELECT organization_id FROM user_organization_roles WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "update_forms" ON forms;
CREATE POLICY "update_forms" ON forms FOR UPDATE USING (
  is_admin() OR 
  has_org_role(organization_id, 'super_manager') OR has_org_role(organization_id, 'manager')
);

DROP POLICY IF EXISTS "delete_forms" ON forms;
CREATE POLICY "delete_forms" ON forms FOR DELETE USING (
  is_admin() OR 
  has_org_role(organization_id, 'super_manager')
);

-- folders
DROP POLICY IF EXISTS "view_folders" ON folders;
CREATE POLICY "view_folders" ON folders FOR SELECT USING (
  is_admin() OR 
  organization_id IN (SELECT organization_id FROM user_organization_roles WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "manage_folders" ON folders;
CREATE POLICY "manage_folders" ON folders FOR ALL USING (
  is_admin() OR 
  organization_id IN (SELECT organization_id FROM user_organization_roles WHERE user_id = auth.uid())
);

-- submissions
DROP POLICY IF EXISTS "view_submissions" ON submissions;
CREATE POLICY "view_submissions" ON submissions FOR SELECT USING (
  is_admin() OR 
  organization_id IN (SELECT organization_id FROM user_organization_roles WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "create_submissions" ON submissions;
CREATE POLICY "create_submissions" ON submissions FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "update_submissions" ON submissions;
CREATE POLICY "update_submissions" ON submissions FOR UPDATE USING (
  is_admin() OR 
  organization_id IN (SELECT organization_id FROM user_organization_roles WHERE user_id = auth.uid())
);

-- files
DROP POLICY IF EXISTS "view_files" ON files;
CREATE POLICY "view_files" ON files FOR SELECT USING (
  is_admin() OR 
  EXISTS (
    SELECT 1 FROM submissions s
    WHERE s.id = files.submission_id
    AND (
      s.organization_id IN (SELECT organization_id FROM user_organization_roles WHERE user_id = auth.uid())
      OR s.organization_id IS NULL
    )
  )
);

DROP POLICY IF EXISTS "upload_files" ON files;
CREATE POLICY "upload_files" ON files FOR INSERT WITH CHECK (true);

-- invitations
DROP POLICY IF EXISTS "view_own_org_invitations" ON invitations;
CREATE POLICY "view_own_org_invitations" ON invitations FOR SELECT USING (
  is_admin() OR
  organization_id IN (
    SELECT organization_id FROM user_organization_roles 
    WHERE user_id = auth.uid() AND role IN ('super_manager', 'manager')
  )
);

DROP POLICY IF EXISTS "manage_invitations" ON invitations;
CREATE POLICY "manage_invitations" ON invitations FOR ALL USING (
  is_admin() OR
  organization_id IN (
    SELECT organization_id FROM user_organization_roles 
    WHERE user_id = auth.uid() AND role IN ('super_manager', 'manager')
  )
);

-- debug_logs (admin only & trigger bypass)
DROP POLICY IF EXISTS "admin_view_debug_logs" ON debug_logs;
CREATE POLICY "admin_view_debug_logs" ON debug_logs FOR SELECT USING (is_admin());

DROP POLICY IF EXISTS "allow_trigger_insert_debug_logs" ON debug_logs;
CREATE POLICY "allow_trigger_insert_debug_logs" 
ON debug_logs 
FOR INSERT 
WITH CHECK (true);

-- ============================================================
-- 6. FUNCTIONS & TRIGGERS
-- ============================================================

-- Secure RPC to get a public form by ID
CREATE OR REPLACE FUNCTION get_public_form(form_id UUID)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT to_jsonb(f) INTO result
  FROM forms f
  WHERE f.id = form_id;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to handle new user signup (with invite token support)
CREATE OR REPLACE FUNCTION handle_new_user_signup()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  new_org_id UUID;
  org_name TEXT;
  org_slug TEXT;
  invite_token TEXT;
  invite_record RECORD;
BEGIN
  INSERT INTO public.debug_logs(step, details) 
  VALUES ('trigger_start', jsonb_build_object('user_id', NEW.id)::text);

  -- 1. Create Profile
  INSERT INTO public.profiles (id, email, name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'name');
  
  INSERT INTO public.debug_logs(step, details) 
  VALUES ('profile_created', jsonb_build_object('user_id', NEW.id)::text);

  -- 2. Check for invitation token
  invite_token := NEW.raw_user_meta_data->>'invite_token';
  INSERT INTO public.debug_logs(step, details) 
  VALUES ('invite_token_checked', jsonb_build_object('token', invite_token)::text);

  IF invite_token IS NOT NULL THEN
    SELECT * INTO invite_record
    FROM public.invitations
    WHERE token = invite_token
      AND expires_at > NOW();
    
    INSERT INTO public.debug_logs(step, details) 
    VALUES ('invite_lookup', jsonb_build_object('found', FOUND)::text);

    IF FOUND THEN
      new_org_id := invite_record.organization_id;
      INSERT INTO public.debug_logs(step, details) 
      VALUES ('invite_valid', jsonb_build_object('org_id', new_org_id, 'role', invite_record.role)::text);

      INSERT INTO public.user_organization_roles (user_id, organization_id, role)
      VALUES (NEW.id, new_org_id, invite_record.role);
      
      INSERT INTO public.debug_logs(step, details) 
      VALUES ('role_assigned', jsonb_build_object('role', invite_record.role)::text);

      DELETE FROM public.invitations WHERE id = invite_record.id;
      INSERT INTO public.debug_logs(step, details) 
      VALUES ('invitation_deleted', jsonb_build_object('inv_id', invite_record.id)::text);
    ELSE
      invite_token := NULL;
      INSERT INTO public.debug_logs(step, details) 
      VALUES ('invite_invalid', '');
    END IF;
  END IF;

  -- 3. Standard Signup (Create New Org) if no valid invite found
  IF new_org_id IS NULL THEN
    -- Determine organization name and slug
    org_name := COALESCE(
      NEW.raw_user_meta_data->>'organization_name', 
      NEW.raw_user_meta_data->>'name' || '''s Workspace',
      'ToolFactory Workspace'
    );
    
    INSERT INTO public.debug_logs(step, details) 
    VALUES ('org_name_extracted', jsonb_build_object('org_name', org_name)::text);

    org_slug := lower(regexp_replace(org_name, '[^a-zA-Z0-9]+', '-', 'g'));
    org_slug := trim(both '-' FROM org_slug);
    org_slug := org_slug || '-' || extract(epoch FROM now())::bigint;

    INSERT INTO public.organizations (name, slug)
    VALUES (org_name, org_slug)
    RETURNING id INTO new_org_id;
    
    INSERT INTO public.debug_logs(step, details) 
    VALUES ('org_created', jsonb_build_object('org_id', new_org_id)::text);

    INSERT INTO public.user_organization_roles (user_id, organization_id, role)
    VALUES (NEW.id, new_org_id, 'super_manager');
    
    INSERT INTO public.debug_logs(step, details) 
    VALUES ('role_super_manager_assigned', jsonb_build_object('org_id', new_org_id)::text);

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  -- 4. Update user's profile with current organization
  UPDATE public.profiles
  SET current_organization_id = new_org_id
  WHERE id = NEW.id;
  
  INSERT INTO public.debug_logs(step, details) 
  VALUES ('profile_updated', jsonb_build_object('org_id', new_org_id)::text);

  INSERT INTO public.debug_logs(step, details) 
  VALUES ('trigger_end', jsonb_build_object('user_id', NEW.id)::text);
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    INSERT INTO public.debug_logs(step, details) 
    VALUES ('trigger_error', SQLERRM);
    RAISE;
END;
$func$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS on_user_created ON auth.users;
CREATE TRIGGER on_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user_signup();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at triggers
DROP TRIGGER IF EXISTS update_organizations_updated_at ON organizations;
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_forms_updated_at ON forms;
CREATE TRIGGER update_forms_updated_at BEFORE UPDATE ON forms FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_submissions_updated_at ON submissions;
CREATE TRIGGER update_submissions_updated_at BEFORE UPDATE ON submissions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- MIGRATION COMPLETE
-- ============================================================
