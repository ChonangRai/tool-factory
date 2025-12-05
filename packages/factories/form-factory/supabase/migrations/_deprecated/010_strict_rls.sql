-- Migration: Enforce Strict Organization Isolation
-- Removes the "OR organization_id IS NULL" loophole from RLS policies.

-- 1. Forms
DROP POLICY IF EXISTS "view_forms" ON forms;
CREATE POLICY "view_forms" ON forms FOR SELECT USING (
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

-- 2. Folders
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

-- 3. Submissions
DROP POLICY IF EXISTS "view_submissions" ON submissions;
CREATE POLICY "view_submissions" ON submissions FOR SELECT USING (
  is_admin() OR 
  organization_id IN (SELECT organization_id FROM user_organization_roles WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "update_submissions" ON submissions;
CREATE POLICY "update_submissions" ON submissions FOR UPDATE USING (
  is_admin() OR 
  organization_id IN (SELECT organization_id FROM user_organization_roles WHERE user_id = auth.uid())
);

-- 4. Files
DROP POLICY IF EXISTS "view_files" ON files;
CREATE POLICY "view_files" ON files FOR SELECT USING (
  is_admin() OR 
  EXISTS (
    SELECT 1 FROM submissions s
    WHERE s.id = files.submission_id
    AND (
      s.organization_id IN (SELECT organization_id FROM user_organization_roles WHERE user_id = auth.uid())
    )
  )
);
