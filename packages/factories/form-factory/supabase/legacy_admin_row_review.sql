-- READ-ONLY diagnostic script -- NOT a migration, do not add to migrations/.
-- Run manually against production (e.g. via the Supabase SQL editor) before
-- and after deploying 027/028 to decide what to do with existing
-- user_roles(role='admin') rows. Makes no changes.
--
-- Background: every INSERT into user_roles found anywhere in this project's
-- history (000, 001, 008, 026, and every loose debug script) is the exact
-- same statement: `INSERT INTO user_roles (user_id, role) VALUES (NEW.id,
-- 'admin')` inside the ordinary self-signup trigger. No code path, current
-- or historical, has ever inserted role='platform_admin'. That means:
--   - any existing role='platform_admin' row was created manually/outside
--     the application and should be left alone -- these are the real
--     platform operators.
--   - existing role='admin' rows are consistent with being an artifact of
--     the ordinary-signup bug, but this script cannot prove a given row
--     wasn't instead a deliberate manual grant that happened to reuse the
--     'admin' label instead of 'platform_admin'. Do not bulk-delete based on
--     this script alone -- use it to produce a reviewable candidate list.
--
-- After 027+028 are deployed, is_admin() is no longer referenced by any
-- active RLS policy in this schema, so leftover role='admin' rows grant zero
-- privilege today. The risk they represent is latent: if any future policy
-- change reintroduces an is_admin() check (as has happened repeatedly in
-- this project's migration history), these rows would silently regain broad
-- access. Cleaning them up removes that latent risk; leaving them in place
-- in the meantime is not an active vulnerability by itself post-deployment.

-- 1. Inventory: every user_roles row, split by role, with the invariant
--    check (should the row also exist as an org membership?).
SELECT
  ur.id            AS user_roles_row_id,
  ur.user_id,
  ur.role,
  ur.created_at    AS granted_at,
  p.email,
  p.name,
  (SELECT count(*) FROM user_organization_roles uor WHERE uor.user_id = ur.user_id) AS org_membership_count,
  (SELECT array_agg(DISTINCT uor.role) FROM user_organization_roles uor WHERE uor.user_id = ur.user_id) AS org_roles
FROM user_roles ur
LEFT JOIN profiles p ON p.id = ur.user_id
ORDER BY ur.role, ur.created_at;

-- 2. Candidates matching the ordinary-signup-bug pattern exactly: role =
--    'admin' AND the user is also (as the bug always produces) a
--    super_manager of at least one org. These are the rows that are safe to
--    treat as the legacy artifact and are the recommended cleanup target.
--    Nothing here deletes anything -- review the output first.
SELECT ur.id AS user_roles_row_id, ur.user_id, p.email, ur.created_at
FROM user_roles ur
LEFT JOIN profiles p ON p.id = ur.user_id
WHERE ur.role = 'admin'
  AND EXISTS (
    SELECT 1 FROM user_organization_roles uor
    WHERE uor.user_id = ur.user_id AND uor.role = 'super_manager'
  );

-- 3. Anomalies requiring manual review before any deletion: role='admin'
--    with NO org membership at all (doesn't match the known bug pattern --
--    could be a manually provisioned account, an orphaned row from a
--    deleted org, or something else). Escalate these individually.
SELECT ur.id AS user_roles_row_id, ur.user_id, p.email, ur.created_at
FROM user_roles ur
LEFT JOIN profiles p ON p.id = ur.user_id
WHERE ur.role = 'admin'
  AND NOT EXISTS (
    SELECT 1 FROM user_organization_roles uor WHERE uor.user_id = ur.user_id
  );

-- 4. platform_admin rows -- for visibility only. Never delete these based on
--    this script; no code path has ever created one, so every row here was
--    provisioned intentionally.
SELECT ur.id AS user_roles_row_id, ur.user_id, p.email, ur.created_at
FROM user_roles ur
LEFT JOIN profiles p ON p.id = ur.user_id
WHERE ur.role = 'platform_admin';

-- Suggested cleanup (run only after manually confirming query #2's output
-- with the team -- intentionally not auto-executed by this script):
--
-- DELETE FROM user_roles
-- WHERE role = 'admin'
--   AND EXISTS (
--     SELECT 1 FROM user_organization_roles uor
--     WHERE uor.user_id = user_roles.user_id AND uor.role = 'super_manager'
--   );
