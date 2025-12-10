-- Migration to fix infinite recursion in user_organization_roles policies
-- Create security definer function to check if current user is super manager of an organization
CREATE OR REPLACE FUNCTION has_super_manager(org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_organization_roles
    WHERE user_id = auth.uid()
      AND organization_id = org_id
      AND role = 'super_manager'
  );
$$;

-- Drop existing super_manager_manage_roles policy
DROP POLICY IF EXISTS "super_manager_manage_roles" ON user_organization_roles;

-- Recreate policy using the new helper function (applies to all actions)
CREATE POLICY "super_manager_manage_roles"
ON user_organization_roles
FOR ALL
TO authenticated
USING (has_super_manager(organization_id))
WITH CHECK (has_super_manager(organization_id));
