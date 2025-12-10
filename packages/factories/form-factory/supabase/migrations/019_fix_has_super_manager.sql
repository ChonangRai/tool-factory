-- Migration to fix infinite recursion by disabling RLS inside the helper function
-- This replaces the existing has_super_manager function with one that sets row_security = off

DROP FUNCTION IF EXISTS has_super_manager(UUID);

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
