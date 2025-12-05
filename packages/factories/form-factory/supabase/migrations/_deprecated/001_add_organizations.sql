-- Creates the base profiles table that other migrations rely on.
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT,
  -- Note: current_organization_id added later to avoid circular dependency
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Basic RLS policy: allow a user to read their own profile.
CREATE POLICY "allow_self_read"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "allow_self_update"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id);

-- Migration 001: Add Multi-Tenancy Tables
-- This migration adds organizations and user role management
-- NOTE: Run 000_add_platform_admin_enum.sql FIRST!

-- Create organizations table
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create user_organization_roles table
CREATE TABLE IF NOT EXISTS user_organization_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('super_manager', 'manager', 'staff')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, organization_id)
);

-- Create user_roles table (Global Roles)
CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL, 
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, role)
);
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Update profiles table to track current organization
-- This adds the column AND the foreign key constraint
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS current_organization_id UUID REFERENCES organizations(id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_org_roles_user ON user_organization_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_org_roles_org ON user_organization_roles(organization_id);
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger for organizations
DROP TRIGGER IF EXISTS update_organizations_updated_at ON organizations;
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS on new tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_organization_roles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for organizations
-- Users can view organizations they belong to
CREATE POLICY "users_view_own_organizations"
ON organizations FOR SELECT
USING (
  id IN (
    SELECT organization_id FROM user_organization_roles
    WHERE user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role = 'platform_admin'
  )
);

-- Super managers can update their organization
CREATE POLICY "super_managers_update_organization"
ON organizations FOR UPDATE
USING (
  id IN (
    SELECT organization_id FROM user_organization_roles
    WHERE user_id = auth.uid() AND role = 'super_manager'
  )
  OR EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role = 'platform_admin'
  )
);

-- Platform admins can insert organizations
CREATE POLICY "platform_admins_insert_organizations"
ON organizations FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role = 'platform_admin'
  )
);

-- RLS Policies for user_organization_roles
-- Users can view their own organization memberships
CREATE POLICY "users_view_own_roles"
ON user_organization_roles FOR SELECT
USING (
  user_id = auth.uid()
  OR organization_id IN (
    SELECT organization_id FROM user_organization_roles
    WHERE user_id = auth.uid() AND role IN ('super_manager', 'manager')
  )
  OR EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role = 'platform_admin'
  )
);

-- Super managers can manage all users in their organization
CREATE POLICY "super_managers_manage_users"
ON user_organization_roles FOR ALL
USING (
  organization_id IN (
    SELECT organization_id FROM user_organization_roles
    WHERE user_id = auth.uid() AND role = 'super_manager'
  )
  OR EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role = 'platform_admin'
  )
);

-- Managers can manage staff only (not other managers or super_managers)
CREATE POLICY "managers_manage_staff"
ON user_organization_roles FOR INSERT
WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM user_organization_roles
    WHERE user_id = auth.uid() AND role = 'manager'
  )
  AND role = 'staff'
);

CREATE POLICY "managers_delete_staff"
ON user_organization_roles FOR DELETE
USING (
  organization_id IN (
    SELECT organization_id FROM user_organization_roles
    WHERE user_id = auth.uid() AND role = 'manager'
  )
  AND role = 'staff'
);
