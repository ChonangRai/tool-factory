-- CLEANUP MIGRATION: Drop Legacy Public Policies
-- RLS policies are additive. If "Public can read forms" still exists from an old schema version,
-- it will override the strict "view_forms" policy and allow everyone to see everything.

-- 1. Drop the legacy public read policy on forms
DROP POLICY IF EXISTS "Public can read forms" ON forms;

-- 2. Drop any other potential legacy names just in case
DROP POLICY IF EXISTS "public_read_forms" ON forms;
DROP POLICY IF EXISTS "anon_read_forms" ON forms;

-- 3. Ensure strict view policy exists (Re-apply just to be safe)
DROP POLICY IF EXISTS "view_forms" ON forms;
CREATE POLICY "view_forms" ON forms FOR SELECT USING (
  is_admin() OR 
  organization_id IN (SELECT organization_id FROM user_organization_roles WHERE user_id = auth.uid())
);
