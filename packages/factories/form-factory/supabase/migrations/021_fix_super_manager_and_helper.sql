-- Comprehensive RLS Fix Migration
-- 1. Fixes "already exists" errors by dropping policies first
-- 2. Fixes infinite recursion in 'view_own_org_roles' by using a SECURITY DEFINER helper
-- 3. Fixes infinite recursion in 'super_manager_manage_roles' by using non-recursive helper AND separate policies

-- =========================================================================
-- HELPER FUNCTIONS (Non-Recursive)
-- =========================================================================

-- Helper to get current user's org IDs without recursion
CREATE OR REPLACE FUNCTION get_user_org_ids()
RETURNS TABLE (organization_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Disable RLS to avoid recursion when querying the table itself
  SET local row_security = off;
  RETURN QUERY
  SELECT uor.organization_id 
  FROM public.user_organization_roles uor
  WHERE uor.user_id = auth.uid();
END;
$$;

-- Helper to check if current user is super_manager for an org (Non-recursive)
CREATE OR REPLACE FUNCTION has_super_manager(org_id UUID)
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
      AND uor.role = 'super_manager'
  );
END;
$$;


-- =========================================================================
-- CLEANUP (Drop existing/potentially conflicting policies)
-- =========================================================================

DROP POLICY IF EXISTS "view_own_org_roles" ON public.user_organization_roles;
DROP POLICY IF EXISTS "super_manager_manage_roles" ON public.user_organization_roles;
-- Also drop the split policies if they were partially created
DROP POLICY IF EXISTS "super_manager_manage_roles_update" ON public.user_organization_roles;
DROP POLICY IF EXISTS "super_manager_manage_roles_delete" ON public.user_organization_roles;
DROP POLICY IF EXISTS "super_manager_manage_roles_insert" ON public.user_organization_roles;


-- =========================================================================
-- RECREATE POLICIES (Safe Versions)
-- =========================================================================

-- 1. SELECT Policy (View): Users can see roles in their orgs
-- Uses get_user_org_ids() to avoid querying table directly in the check
CREATE POLICY "view_own_org_roles" ON public.user_organization_roles
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid() -- Can always see self
  OR
  organization_id IN ( SELECT organization_id FROM get_user_org_ids() ) -- Can see others in my orgs
);


-- 2. MANAGEMENT Policies: Super Managers can Update/Delete/Insert in their orgs
-- Uses has_super_manager() helper

-- UPDATE
CREATE POLICY "super_manager_manage_roles_update"
ON public.user_organization_roles
FOR UPDATE
TO authenticated
USING (has_super_manager(organization_id))
WITH CHECK (has_super_manager(organization_id));

-- DELETE
CREATE POLICY "super_manager_manage_roles_delete"
ON public.user_organization_roles
FOR DELETE
TO authenticated
USING (has_super_manager(organization_id));

-- INSERT
CREATE POLICY "super_manager_manage_roles_insert"
ON public.user_organization_roles
FOR INSERT
TO authenticated
WITH CHECK (has_super_manager(organization_id));