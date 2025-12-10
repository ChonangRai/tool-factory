-- CRITICAL SECURITY FIX: Ensure forms are isolated by organization
-- The previous policies had is_admin() checks that allowed viewing ALL forms across organizations

-- Drop all existing view_forms policies
DROP POLICY IF EXISTS "view_forms" ON forms;
DROP POLICY IF EXISTS "view_archived_forms" ON forms;

-- Create strict organization-scoped policy for viewing forms
-- REMOVED is_admin() check to prevent cross-organization access
CREATE POLICY "view_forms" ON forms 
FOR SELECT 
TO authenticated
USING (
  -- User must be in the same organization as the form
  -- AND form must not be soft-deleted
  organization_id IN (
    SELECT organization_id 
    FROM user_organization_roles 
    WHERE user_id = auth.uid()
  )
  AND deleted_at IS NULL
);

-- Policy for viewing archived forms (soft-deleted)
CREATE POLICY "view_archived_forms" ON forms
FOR SELECT
TO authenticated
USING (
  -- User must be in the same organization as the form
  -- AND form must be soft-deleted
  organization_id IN (
    SELECT organization_id 
    FROM user_organization_roles 
    WHERE user_id = auth.uid()
  )
  AND deleted_at IS NOT NULL
);

-- Note: Removed `is_admin()` check from both policies
-- This was causing forms to be visible across organizations for admin users
-- Now ALL users can only see forms from their own organization(s)
