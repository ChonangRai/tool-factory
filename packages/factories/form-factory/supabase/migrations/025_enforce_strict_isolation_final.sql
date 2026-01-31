-- 025_enforce_strict_isolation_final.sql
-- FINAL FIX for Cross-Organization Data Leak
-- Context: Previous migrations may have left 'view_forms' or 'is_admin' holes open.
-- This migration acts as a "hard reset" for privacy policies on key tables.

-- ============================================================
-- 1. FORMS Isolation
-- ============================================================
-- Drop potential legacy policy names
DROP POLICY IF EXISTS "view_forms" ON forms;
DROP POLICY IF EXISTS "view_archived_forms" ON forms;
DROP POLICY IF EXISTS "create_forms" ON forms;
DROP POLICY IF EXISTS "update_forms" ON forms;
DROP POLICY IF EXISTS "delete_forms" ON forms;
DROP POLICY IF EXISTS "strict_org_isolation_forms_select" ON forms;
DROP POLICY IF EXISTS "strict_org_isolation_forms_insert" ON forms;
DROP POLICY IF EXISTS "strict_org_isolation_forms_update" ON forms;
DROP POLICY IF EXISTS "strict_org_isolation_forms_delete" ON forms;

-- RE-APPLY STRICT POLICIES
-- NOTE: Absolutely NO `is_admin()` checks are allowed here. 
-- Admins must legitimately belong to the organization (user_organization_roles) to see its data.

CREATE POLICY "strict_forms_select_final" ON forms
FOR SELECT
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id 
    FROM user_organization_roles 
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "strict_forms_insert_final" ON forms
FOR INSERT
TO authenticated
WITH CHECK (
  organization_id IN (
    SELECT organization_id 
    FROM user_organization_roles 
    WHERE user_id = auth.uid()
    AND role IN ('super_manager', 'manager')
  )
);

CREATE POLICY "strict_forms_update_final" ON forms
FOR UPDATE
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id 
    FROM user_organization_roles 
    WHERE user_id = auth.uid()
    AND role IN ('super_manager', 'manager')
  )
);

CREATE POLICY "strict_forms_delete_final" ON forms
FOR DELETE
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id 
    FROM user_organization_roles 
    WHERE user_id = auth.uid()
    AND role IN ('super_manager', 'manager')
  )
);

-- ============================================================
-- 2. SUBMISSIONS Isolation
-- ============================================================
DROP POLICY IF EXISTS "view_submissions" ON submissions;
DROP POLICY IF EXISTS "create_submissions" ON submissions;
DROP POLICY IF EXISTS "update_submissions" ON submissions;
DROP POLICY IF EXISTS "delete_submissions" ON submissions;
DROP POLICY IF EXISTS "strict_org_isolation_submissions_select" ON submissions;
DROP POLICY IF EXISTS "strict_org_isolation_submissions_update" ON submissions;
DROP POLICY IF EXISTS "strict_org_isolation_submissions_delete" ON submissions;

CREATE POLICY "strict_submissions_select_final" ON submissions
FOR SELECT
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id 
    FROM user_organization_roles 
    WHERE user_id = auth.uid()
  )
);

-- Note: Insert policy handled by existing migrations or open for public/auth submission logic.
-- We are focusing on preventing LEAKS (Select).

CREATE POLICY "strict_submissions_update_final" ON submissions
FOR UPDATE
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id 
    FROM user_organization_roles 
    WHERE user_id = auth.uid()
    AND role IN ('super_manager', 'manager')
  )
);

CREATE POLICY "strict_submissions_delete_final" ON submissions
FOR DELETE
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id 
    FROM user_organization_roles 
    WHERE user_id = auth.uid()
    AND role IN ('super_manager', 'manager')
  )
);
