-- Read-only enumeration of artifacts created during the mistaken
-- "staging" validation session against what is actually production
-- (msusfhcupmkxzpgzddtc). SELECT-only; makes no changes.
--
-- Markers used: test emails/org names created during that session, plus a
-- creation-time window bounding the session itself. Adjust the window if
-- the session ran outside these bounds -- cross-check row IDs against your
-- own memory of the session before treating anything as "certain."

-- 1. Test auth users (created via Admin API with email_confirm=true)
SELECT id, email, created_at, confirmed_at, raw_user_meta_data->>'organization_name' AS org_name_meta
FROM auth.users
WHERE email ILIKE '%@example.com'
   OR email ILIKE '%staging%'
   OR email ILIKE '%audit%'
   OR email ILIKE '%test%'
ORDER BY created_at DESC;

-- 2. Test organizations
SELECT id, name, slug, created_at
FROM public.organizations
WHERE name ILIKE '%staging%' OR name ILIKE '%audit%' OR name ILIKE '%test%'
   OR slug ILIKE '%staging%' OR slug ILIKE '%audit%' OR slug ILIKE '%test%'
ORDER BY created_at DESC;

-- 3. Memberships tied to those orgs/users (fill in IDs from 1 & 2, or join)
SELECT uor.*
FROM public.user_organization_roles uor
JOIN public.organizations o ON o.id = uor.organization_id
WHERE o.name ILIKE '%staging%' OR o.name ILIKE '%audit%' OR o.name ILIKE '%test%';

-- 4. Test forms
SELECT f.id, f.name, f.organization_id, f.created_at
FROM public.forms f
JOIN public.organizations o ON o.id = f.organization_id
WHERE o.name ILIKE '%staging%' OR o.name ILIKE '%audit%' OR o.name ILIKE '%test%';

-- 5. Test invitations (including already-consumed/deleted ones won't show --
-- consumed invitations are deleted by design, see migration 031)
SELECT i.id, i.email, i.organization_id, i.role, i.created_at, i.expires_at
FROM public.invitations i
JOIN public.organizations o ON o.id = i.organization_id
WHERE o.name ILIKE '%staging%' OR o.name ILIKE '%audit%' OR o.name ILIKE '%test%'
   OR i.email ILIKE '%@example.com' OR i.email ILIKE '%test%';

-- 6. Test submissions
SELECT s.id, s.form_id, s.email, s.created_at
FROM public.submissions s
JOIN public.forms f ON f.id = s.form_id
JOIN public.organizations o ON o.id = f.organization_id
WHERE o.name ILIKE '%staging%' OR o.name ILIKE '%audit%' OR o.name ILIKE '%test%'
   OR s.email ILIKE '%@example.com' OR s.email ILIKE '%test%';

-- 7. Test files / storage object metadata rows
SELECT fl.id, fl.path, fl.submission_id, fl.created_at
FROM public.files fl
WHERE fl.submission_id IN (
  SELECT s.id FROM public.submissions s
  JOIN public.forms f ON f.id = s.form_id
  JOIN public.organizations o ON o.id = f.organization_id
  WHERE o.name ILIKE '%staging%' OR o.name ILIKE '%audit%' OR o.name ILIKE '%test%'
);

-- 8. Upload/receipt tickets left behind (consumed or not)
SELECT id, form_id, path, consumed_at, expires_at FROM public.upload_tickets
WHERE form_id IN (
  SELECT f.id FROM public.forms f JOIN public.organizations o ON o.id = f.organization_id
  WHERE o.name ILIKE '%staging%' OR o.name ILIKE '%audit%' OR o.name ILIKE '%test%'
);

SELECT id, submission_id, status, attempts, created_at FROM public.receipt_tickets
WHERE submission_id IN (
  SELECT s.id FROM public.submissions s
  JOIN public.forms f ON f.id = s.form_id
  JOIN public.organizations o ON o.id = f.organization_id
  WHERE o.name ILIKE '%staging%' OR o.name ILIKE '%audit%' OR o.name ILIKE '%test%'
);

-- 9. Side-effect log rows (debug_logs has no user/org FK -- correlate by
-- timestamp window instead; narrow the window to your actual session times)
SELECT id, step, created_at
FROM public.debug_logs
ORDER BY created_at DESC
LIMIT 200;
