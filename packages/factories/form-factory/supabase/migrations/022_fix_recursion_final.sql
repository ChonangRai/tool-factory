-- Fix persistent recursion by dropping the specific status update policy from a previous migration
-- and implementing a safe version for managers.

-- 1. Drop the recursive policy from 016_add_user_status.sql
DROP POLICY IF EXISTS "managers_update_user_status" ON public.user_organization_roles;


-- 2. Create helper for checking manager role (Non-recursive)
CREATE OR REPLACE FUNCTION has_manager(org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  SET local row_security = off;
  RETURN EXISTS (
    SELECT 1 
    FROM public.user_organization_roles uor
    WHERE uor.user_id = auth.uid()
      AND uor.organization_id = org_id
      AND uor.role IN ('super_manager', 'manager')
  );
END;
$$;


-- 3. Create safe policy for Managers to update Staff status
-- This allows managers (and super managers) to update status, but restricted to target role = 'staff'
-- (Super managers are already covered by super_manager_manage_roles_update for all roles)
CREATE POLICY "managers_update_staff_status"
ON public.user_organization_roles
FOR UPDATE
TO authenticated
USING (
  has_manager(organization_id) 
  AND role = 'staff'
)
WITH CHECK (
  has_manager(organization_id)
  AND role = 'staff'
);
