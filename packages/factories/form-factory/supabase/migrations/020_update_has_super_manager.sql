-- Migration: Update has_super_manager to disable RLS during its check
-- This prevents the infinite‑recursion error when the policy calls the function.

CREATE OR REPLACE FUNCTION has_super_manager(org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Turn off row‑level security for this internal query
  SET local row_security = off;

  RETURN EXISTS (
    SELECT 1
    FROM public.user_organization_roles
    WHERE user_id = auth.uid()
      AND organization_id = org_id
      AND role = 'super_manager'
  );
END;
$$;