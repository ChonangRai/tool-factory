-- Migration 002: Update Existing Tables for Multi-Tenancy
-- Adds organization_id to forms, submissions, and folders

-- Add organization_id to forms table
ALTER TABLE forms 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id),
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- Add organization_id to submissions table
ALTER TABLE submissions
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- Add organization_id to folders table
ALTER TABLE folders
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_forms_organization ON forms(organization_id);
CREATE INDEX IF NOT EXISTS idx_forms_created_by ON forms(created_by);
CREATE INDEX IF NOT EXISTS idx_submissions_organization ON submissions(organization_id);
CREATE INDEX IF NOT EXISTS idx_folders_organization ON folders(organization_id);

-- Drop existing RLS policies (we'll recreate them)
DROP POLICY IF EXISTS "Users can view all forms" ON forms;
DROP POLICY IF EXISTS "Users can create forms" ON forms;
DROP POLICY IF EXISTS "Users can update forms" ON forms;
DROP POLICY IF EXISTS "Users can delete forms" ON forms;

DROP POLICY IF EXISTS "Users can view all submissions" ON submissions;
DROP POLICY IF EXISTS "Users can create submissions" ON submissions;
DROP POLICY IF EXISTS "Users can update submissions" ON submissions;

DROP POLICY IF EXISTS "Users can view folders" ON folders;
DROP POLICY IF EXISTS "Users can create folders" ON folders;
DROP POLICY IF EXISTS "Users can update folders" ON folders;
DROP POLICY IF EXISTS "Users can delete folders" ON folders;

-- New RLS Policies for forms
-- Platform admins can view all forms
CREATE POLICY "platform_admins_view_all_forms"
ON forms FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role = 'platform_admin'
  )
);

-- Organization members can view their org's forms
CREATE POLICY "org_members_view_forms"
ON forms FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM user_organization_roles
    WHERE user_id = auth.uid()
  )
);

-- All org members can create forms in their organization
CREATE POLICY "org_members_create_forms"
ON forms FOR INSERT
WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM user_organization_roles
    WHERE user_id = auth.uid()
  )
);

-- Staff can only update their own forms
CREATE POLICY "staff_update_own_forms"
ON forms FOR UPDATE
USING (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM user_organization_roles
    WHERE user_id = auth.uid() 
    AND organization_id = forms.organization_id
    AND role = 'staff'
  )
);

-- Managers and super_managers can update all org forms
CREATE POLICY "managers_update_org_forms"
ON forms FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM user_organization_roles
    WHERE user_id = auth.uid() 
    AND organization_id = forms.organization_id
    AND role IN ('manager', 'super_manager')
  )
  OR EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role = 'platform_admin'
  )
);

-- Similar policies for delete
CREATE POLICY "staff_delete_own_forms"
ON forms FOR DELETE
USING (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM user_organization_roles
    WHERE user_id = auth.uid() 
    AND organization_id = forms.organization_id
    AND role = 'staff'
  )
);

CREATE POLICY "managers_delete_org_forms"
ON forms FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM user_organization_roles
    WHERE user_id = auth.uid() 
    AND organization_id = forms.organization_id
    AND role IN ('manager', 'super_manager')
  )
  OR EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role = 'platform_admin'
  )
);

-- RLS Policies for submissions
CREATE POLICY "platform_admins_view_all_submissions"
ON submissions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role = 'platform_admin'
  )
);

CREATE POLICY "org_members_view_submissions"
ON submissions FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM user_organization_roles
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "anyone_create_submissions"
ON submissions FOR INSERT
WITH CHECK (true);  -- Public forms allow anonymous submissions

CREATE POLICY "org_members_update_submissions"
ON submissions FOR UPDATE
USING (
  organization_id IN (
    SELECT organization_id FROM user_organization_roles
    WHERE user_id = auth.uid()
  )
);

-- RLS Policies for folders
CREATE POLICY "platform_admins_view_all_folders"
ON folders FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role = 'platform_admin'
  )
);

CREATE POLICY "org_members_view_folders"
ON folders FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM user_organization_roles
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "org_members_manage_folders"
ON folders FOR ALL
USING (
  organization_id IN (
    SELECT organization_id FROM user_organization_roles
    WHERE user_id = auth.uid()
  )
);
