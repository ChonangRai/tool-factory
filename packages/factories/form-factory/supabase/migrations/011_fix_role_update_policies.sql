-- Alternative approach: Use SECURITY DEFINER function to update roles
-- This bypasses RLS and handles the trigger properly

DROP FUNCTION IF EXISTS update_user_role(UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION update_user_role(
  p_user_id UUID,
  p_organization_id UUID,
  p_new_role TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Permission check: only super_managers can update roles
  -- or managers can update staff roles
  IF NOT EXISTS (
    SELECT 1 
    FROM user_organization_roles
    WHERE user_id = auth.uid()
      AND organization_id = p_organization_id
      AND (
        role = 'super_manager'  -- Super managers can update any role
        OR (role = 'manager' AND (  -- Managers can only update staff
          SELECT role FROM user_organization_roles 
          WHERE user_id = p_user_id AND organization_id = p_organization_id
        ) = 'staff' AND p_new_role = 'staff')
      )
  ) THEN
    RAISE EXCEPTION 'Permission denied: insufficient privileges to update this role';
  END IF;

  -- Validate the new role
  IF p_new_role NOT IN ('super_manager', 'manager', 'staff') THEN
    RAISE EXCEPTION 'Invalid role: must be super_manager, manager, or staff';
  END IF;

  -- Update the role (trigger will handle auto-demotion)
  UPDATE user_organization_roles
  SET role = p_new_role
  WHERE user_id = p_user_id
    AND organization_id = p_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User role not found in organization';
  END IF;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION update_user_role(UUID, UUID, TEXT) TO authenticated;

-- Drop the problematic RLS policies
DROP POLICY IF EXISTS "super_managers_can_update_roles" ON user_organization_roles;
DROP POLICY IF EXISTS "managers_can_update_staff_roles" ON user_organization_roles;

-- Add a simpler policy: users can only update their own roles via the RPC
-- (This prevents direct table updates, forcing use of the RPC)
CREATE POLICY "role_updates_via_rpc_only"
ON user_organization_roles
FOR UPDATE
TO authenticated
USING (false)  -- Block all direct updates
WITH CHECK (false);  -- Block all direct updates
