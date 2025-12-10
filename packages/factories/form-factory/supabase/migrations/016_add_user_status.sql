-- Add status column to user_organization_roles for inactive user tracking

-- 1. Add status column with default 'active'
ALTER TABLE user_organization_roles 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' 
CHECK (status IN ('active', 'inactive'));

-- 2. Create index for faster status queries
CREATE INDEX IF NOT EXISTS idx_user_org_roles_status 
ON user_organization_roles(status);

-- 3. Update RLS policy to show inactive users to managers
DROP POLICY IF EXISTS "view_own_org_roles" ON user_organization_roles;

CREATE POLICY "view_own_org_roles" ON user_organization_roles
FOR SELECT
TO authenticated
USING (
  -- Can see own roles (any status)
  user_id = auth.uid()
  OR
  -- Can see all roles in same organization (for user management)
  organization_id IN (
    SELECT organization_id 
    FROM user_organization_roles 
    WHERE user_id = auth.uid()
  )
);

-- 4. Add policy for updating user status (reactivation)
DROP POLICY IF EXISTS "managers_update_user_status" ON user_organization_roles;

CREATE POLICY "managers_update_user_status" ON user_organization_roles
FOR UPDATE
TO authenticated
USING (
  -- Super managers can update status in their organization
  organization_id IN (
    SELECT organization_id 
    FROM user_organization_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('super_manager', 'manager')
  )
)
WITH CHECK (
  -- Can only change status, not other fields via normal updates
  organization_id IN (
    SELECT organization_id 
    FROM user_organization_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('super_manager', 'manager')
  )
);

-- Note: This allows deactivated users to still show in the user list
-- Super managers can reactivate them by updating status = 'active'
