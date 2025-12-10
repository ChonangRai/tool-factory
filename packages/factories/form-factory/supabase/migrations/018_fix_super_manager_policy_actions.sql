-- Migration to restrict super_manager_manage_roles policy to non-SELECT actions
-- This drops the previous policy that applied to ALL actions and creates three separate policies
-- for UPDATE, DELETE, and INSERT, allowing regular users to read their own roles via the
-- existing view_own_org_roles policy.

DROP POLICY IF EXISTS "super_manager_manage_roles" ON public.user_organization_roles;

-- UPDATE policy
CREATE POLICY "super_manager_manage_roles_update"
ON public.user_organization_roles
FOR UPDATE
TO authenticated
USING (has_super_manager(organization_id))
WITH CHECK (has_super_manager(organization_id));

-- DELETE policy
CREATE POLICY "super_manager_manage_roles_delete"
ON public.user_organization_roles
FOR DELETE
TO authenticated
USING (has_super_manager(organization_id));

-- INSERT policy
CREATE POLICY "super_manager_manage_roles_insert"
ON public.user_organization_roles
FOR INSERT
TO authenticated
WITH CHECK (has_super_manager(organization_id));
