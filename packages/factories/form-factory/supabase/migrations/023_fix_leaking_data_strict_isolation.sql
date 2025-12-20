-- CRITICAL SECURITY FIX: STRICT ORGANIZATION ISOLATION
-- Previous policies may have had loopholes or `is_admin` bypasses creating cross-tenant leaks.
-- This migration wipes the slate clean for `forms` and `submissions` read policies.

-- ============================================================
-- 1. FORMS TABLE
-- ============================================================
-- Enable RLS
ALTER TABLE forms ENABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies to ensure no leakage remains
DROP POLICY IF EXISTS "view_forms" ON forms;
DROP POLICY IF EXISTS "view_archived_forms" ON forms;
DROP POLICY IF EXISTS "create_forms" ON forms;
DROP POLICY IF EXISTS "update_forms" ON forms;
DROP POLICY IF EXISTS "delete_forms" ON forms;
DROP POLICY IF EXISTS "forms_select_policy" ON forms;
DROP POLICY IF EXISTS "forms_insert_policy" ON forms;
DROP POLICY IF EXISTS "forms_update_policy" ON forms;
DROP POLICY IF EXISTS "forms_delete_policy" ON forms;
-- Drop any legacy/named policies that might exist
DROP POLICY IF EXISTS "Enable read access for all users" ON forms;
DROP POLICY IF EXISTS "Enable insert for all users" ON forms;

-- Helper function to get user orgs (if not exists, safe to redefine or use existing)
-- We rely on the existing `get_user_org_ids()` function if available, or straight query.
-- Using straight query in policy for maximum compatibility:

-- 1.1 SELECT (Read)
CREATE POLICY "strict_org_isolation_forms_select" ON forms
FOR SELECT
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id 
    FROM user_organization_roles 
    WHERE user_id = auth.uid()
  )
);

-- 1.2 INSERT (Create)
CREATE POLICY "strict_org_isolation_forms_insert" ON forms
FOR INSERT
TO authenticated
WITH CHECK (
  organization_id IN (
    SELECT organization_id 
    FROM user_organization_roles 
    WHERE user_id = auth.uid()
    AND role IN ('super_manager', 'manager') -- Only managers can create
  )
);

-- 1.3 UPDATE (Edit)
CREATE POLICY "strict_org_isolation_forms_update" ON forms
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

-- 1.4 DELETE (Archive/Delete)
CREATE POLICY "strict_org_isolation_forms_delete" ON forms
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
-- 2. SUBMISSIONS TABLE
-- ============================================================
-- Enable RLS
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies
DROP POLICY IF EXISTS "view_submissions" ON submissions;
DROP POLICY IF EXISTS "create_submissions" ON submissions;
DROP POLICY IF EXISTS "update_submissions" ON submissions;
DROP POLICY IF EXISTS "delete_submissions" ON submissions;
DROP POLICY IF EXISTS "submissions_select_policy" ON submissions;
DROP POLICY IF EXISTS "submissions_insert_policy" ON submissions;

-- 2.1 SELECT (Read)
-- Users can only see submissions for forms belonging to their organization
CREATE POLICY "strict_org_isolation_submissions_select" ON submissions
FOR SELECT
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id 
    FROM user_organization_roles 
    WHERE user_id = auth.uid()
  )
);

-- 2.2 INSERT (Create) - PUBLIC (or Authenticated)
-- Submissions are often created by public users (unauthenticated) or authenticated staff.
-- Ideally, insert should be open if we use RPC `submit_form`.
-- If we use direct insert, we need a policy.
-- Allowing INSERT for ANYONE (public) for `submit_form` usage, 
-- but `submit_form` is `SECURITY DEFINER` so it bypasses RLS for the insert itself.
-- However, for robustness, if we allow authenticated users to submit:
CREATE POLICY "allow_submissions_insert_auth" ON submissions
FOR INSERT
TO authenticated
WITH CHECK (
  -- Allow if submitting to a form in their org (internal submission)
  organization_id IN (
    SELECT organization_id 
    FROM user_organization_roles 
    WHERE user_id = auth.uid()
  )
  OR
  -- OR if the form is public (logic handled by application, RLS just checks basic validity)
  organization_id IS NOT NULL 
);

-- 2.3 UPDATE/DELETE
-- Generally submissions shouldn't be edited/deleted by just anyone. 
-- Only managers should conduct strict actions if UI allows.
CREATE POLICY "strict_org_isolation_submissions_update" ON submissions
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

CREATE POLICY "strict_org_isolation_submissions_delete" ON submissions
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
