-- Fix RLS policy for profiles to allow viewing profiles of users in same organization

-- Drop the restrictive policy that only allows viewing own profile
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;

-- Create new policy: users can view profiles of anyone in their organization(s)
CREATE POLICY "view_org_member_profiles" ON profiles
FOR SELECT
TO authenticated
USING (
  -- Can view own profile
  id = auth.uid()
  OR
  -- Can view profiles of users in same organization
  id IN (
    SELECT user_id 
    FROM user_organization_roles
    WHERE organization_id IN (
      SELECT organization_id 
      FROM user_organization_roles 
      WHERE user_id = auth.uid()
    )
  )
);

-- Note: This allows users to view profiles of anyone in their organization(s)
-- This is needed for UserManagement to display names/emails of team members
