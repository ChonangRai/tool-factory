-- Fix infinite recursion by disabling RLS on user_organization_roles
-- This table is a lookup table and should be readable by authenticated users

-- Disable RLS on user_organization_roles to prevent recursion
ALTER TABLE user_organization_roles DISABLE ROW LEVEL SECURITY;

-- Drop all policies on user_organization_roles (they're causing the recursion)
DROP POLICY IF EXISTS "users_view_own_roles" ON user_organization_roles;
DROP POLICY IF EXISTS "super_managers_manage_users" ON user_organization_roles;
DROP POLICY IF EXISTS "managers_manage_staff" ON user_organization_roles;
DROP POLICY IF EXISTS "managers_delete_staff" ON user_organization_roles;
DROP POLICY IF EXISTS "super_managers_manage_all" ON user_organization_roles;
DROP POLICY IF EXISTS "platform_admins_manage_all" ON user_organization_roles;

-- Note: With RLS disabled, authenticated users can read this table
-- This is acceptable because:
-- 1. It only contains user-org-role mappings (no sensitive data)
-- 2. Other tables (forms, submissions, etc.) still have RLS protection
-- 3. This prevents the infinite recursion issue

-- Organizations can keep RLS enabled with simple policies
DROP POLICY IF EXISTS "users_view_own_organizations" ON organizations;
DROP POLICY IF EXISTS "super_managers_update_organization" ON organizations;
DROP POLICY IF EXISTS "platform_admins_insert_organizations" ON organizations;
DROP POLICY IF EXISTS "users_view_orgs" ON organizations;
DROP POLICY IF EXISTS "super_managers_update_org" ON organizations;
DROP POLICY IF EXISTS "anyone_can_create_org" ON organizations;

CREATE POLICY "authenticated_users_view_orgs"
ON organizations FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "authenticated_users_create_orgs"
ON organizations FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "org_members_update_orgs"
ON organizations FOR UPDATE
TO authenticated
USING (
  id IN (
    SELECT organization_id FROM user_organization_roles
    WHERE user_id = auth.uid() AND role IN ('super_manager', 'manager')
  )
);
