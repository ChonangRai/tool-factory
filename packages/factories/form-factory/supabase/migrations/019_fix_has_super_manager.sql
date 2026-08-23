-- Migration to fix infinite recursion by disabling RLS inside the helper function
-- This replaces the existing has_super_manager function with one that sets row_security = off
--
-- PRE-DEPLOYMENT REVIEW NOTE (added when auditing migration 027): the
-- unconditional DROP FUNCTION below made `supabase db reset` abort here with
-- "cannot drop function has_super_manager(uuid) because other objects depend
-- on it" (018_fix_super_manager_policy_actions.sql already created policies
-- depending on this function). The DROP was never necessary: CREATE OR
-- REPLACE FUNCTION below has the same signature and return type as the
-- version it replaces, which Postgres allows without dropping first. Removing
-- the DROP does not change this migration's resulting function definition at
-- all -- it only stops it from crashing the migration runner before any later
-- migration (020+) can ever be applied.

CREATE OR REPLACE FUNCTION has_super_manager(org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Disable row level security for this query to avoid recursion
  SET local row_security = off;
  RETURN EXISTS (
    SELECT 1 FROM public.user_organization_roles
    WHERE user_id = auth.uid()
      AND organization_id = org_id
      AND role = 'super_manager'
  );
END;
$$;
