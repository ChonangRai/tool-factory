-- Fix RLS policies to work with new organization structure
-- Run this after the main migrations

-- Drop and recreate forms policies to include organization-based access
DROP POLICY IF EXISTS "Users can view all forms" ON forms;
DROP POLICY IF EXISTS "Users can create forms" ON forms;
DROP POLICY IF EXISTS "Users can update forms" ON forms;
DROP POLICY IF EXISTS "Users can delete forms" ON forms;

-- Allow admins (backward compatibility) OR organization members to view forms
CREATE POLICY "admins_and_org_members_view_forms"
ON forms FOR SELECT
USING (
  -- Platform admins can see everything
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role IN ('admin', 'platform_admin')
  )
  OR
  -- Organization members can see their org's forms
  (
    organization_id IS NULL -- Backward compatibility for forms without org
    OR
    organization_id IN (
      SELECT organization_id FROM user_organization_roles
      WHERE user_id = auth.uid()
    )
  )
);

-- Allow admins OR organization members to create forms
CREATE POLICY "admins_and_org_members_create_forms"
ON forms FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role IN ('admin', 'platform_admin')
  )
  OR
  EXISTS (
    SELECT 1 FROM user_organization_roles
    WHERE user_id = auth.uid()
  )
);

-- Allow admins OR organization members to update forms
CREATE POLICY "admins_and_org_members_update_forms"
ON forms FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role IN ('admin', 'platform_admin')
  )
  OR
  (
    organization_id IS NULL
    OR
    organization_id IN (
      SELECT organization_id FROM user_organization_roles
      WHERE user_id = auth.uid()
    )
  )
);

-- Allow admins OR organization members to delete forms
CREATE POLICY "admins_and_org_members_delete_forms"
ON forms FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role IN ('admin', 'platform_admin')
  )
  OR
  (
    organization_id IS NULL
    OR
    organization_id IN (
      SELECT organization_id FROM user_organization_roles
      WHERE user_id = auth.uid()
    )
  )
);

-- Fix submissions policies
DROP POLICY IF EXISTS "Users can view all submissions" ON submissions;
DROP POLICY IF EXISTS "Users can create submissions" ON submissions;
DROP POLICY IF EXISTS "Users can update submissions" ON submissions;

CREATE POLICY "admins_and_org_members_view_submissions"
ON submissions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role IN ('admin', 'platform_admin')
  )
  OR
  (
    organization_id IS NULL
    OR
    organization_id IN (
      SELECT organization_id FROM user_organization_roles
      WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "anyone_create_submissions"
ON submissions FOR INSERT
WITH CHECK (true);

CREATE POLICY "admins_and_org_members_update_submissions"
ON submissions FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role IN ('admin', 'platform_admin')
  )
  OR
  (
    organization_id IS NULL
    OR
    organization_id IN (
      SELECT organization_id FROM user_organization_roles
      WHERE user_id = auth.uid()
    )
  )
);

-- Fix folders policies
DROP POLICY IF EXISTS "Users can view folders" ON folders;
DROP POLICY IF EXISTS "Users can create folders" ON folders;
DROP POLICY IF EXISTS "Users can update folders" ON folders;
DROP POLICY IF EXISTS "Users can delete folders" ON folders;

CREATE POLICY "admins_and_org_members_view_folders"
ON folders FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role IN ('admin', 'platform_admin')
  )
  OR
  (
    organization_id IS NULL
    OR
    organization_id IN (
      SELECT organization_id FROM user_organization_roles
      WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "admins_and_org_members_manage_folders"
ON folders FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role IN ('admin', 'platform_admin')
  )
  OR
  (
    organization_id IS NULL
    OR
    organization_id IN (
      SELECT organization_id FROM user_organization_roles
      WHERE user_id = auth.uid()
    )
  )
);
