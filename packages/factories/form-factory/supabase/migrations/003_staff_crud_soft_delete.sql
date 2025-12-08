-- Update RLS policies to allow staff CRUD access to forms
-- Staff can now create, read, update forms (but not permanently delete)

-- Drop old restrictive policies
DROP POLICY IF EXISTS "create_forms" ON forms;
DROP POLICY IF EXISTS "update_forms" ON forms;
DROP POLICY IF EXISTS "delete_forms" ON forms;

-- Allow all workspace members to create forms
CREATE POLICY "workspace_create_forms" ON forms
  FOR INSERT 
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM user_organization_roles 
      WHERE user_id = auth.uid()
    )
  );

-- Allow all workspace members to update forms (including soft delete via updated_at)
CREATE POLICY "workspace_update_forms" ON forms
  FOR UPDATE 
  USING (
    organization_id IN (
      SELECT organization_id FROM user_organization_roles 
      WHERE user_id = auth.uid()
    )
  );

-- Only super_managers can permanently delete (hard delete from database)
CREATE POLICY "super_manager_delete_forms" ON forms
  FOR DELETE 
  USING (
    is_admin() OR 
    has_org_role(organization_id, 'super_manager')
  );

-- Update view policy to exclude soft-deleted forms by default
DROP POLICY IF EXISTS "view_forms" ON forms;
CREATE POLICY "view_forms" ON forms 
  FOR SELECT 
  USING (
    (is_admin() OR 
    organization_id IN (
      SELECT organization_id FROM user_organization_roles 
      WHERE user_id = auth.uid()
    ))
    AND deleted_at IS NULL  -- Don't show archived forms in main view
  );

-- New policy: View archived forms
CREATE POLICY "view_archived_forms" ON forms
  FOR SELECT
  USING (
    (is_admin() OR 
    organization_id IN (
      SELECT organization_id FROM user_organization_roles 
      WHERE user_id = auth.uid()
    ))
    AND deleted_at IS NOT NULL  -- Only show archived forms
  );
