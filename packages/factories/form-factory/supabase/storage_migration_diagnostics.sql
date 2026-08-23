-- READ-ONLY diagnostic script -- NOT a migration, do not add to migrations/.
-- Run manually against production (Supabase SQL editor, service role) before
-- and after deploying 029 to assess existing-object compatibility. Makes no
-- changes and deletes nothing.
--
-- Migration 029 relies on files.path = storage.objects.name for
-- authorization. That relationship is only as good as existing data: this
-- finds every way it could already be broken so nothing is silently
-- inaccessible or misattributed after the bucket goes private.

-- 1. files rows with no matching object in storage.objects (would become
--    permanently undownloadable -- likely already broken today, since a
--    public bucket doesn't require the row and object to ever have agreed).
SELECT f.id AS file_id, f.submission_id, f.path, f.bucket
FROM files f
WHERE f.bucket = 'submissions'
  AND NOT EXISTS (
    SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'submissions' AND o.name = f.path
  );

-- 2. storage objects with no matching files row (orphans -- inaccessible
--    under the new SELECT policy by construction; harmless to leave, but
--    worth knowing the volume before assuming the bucket is "clean").
--    NOTE: known likely source -- ArchivedSubmissions.tsx's permanent-delete
--    flow calls supabase.storage.from('form-submissions').remove(...), a
--    bucket name that does not match the real bucket ('submissions'). That
--    call has always silently no-op'd, so every submission ever purged via
--    that path left its objects behind. Pre-existing app bug, not
--    introduced or fixed by this migration.
SELECT o.id AS object_id, o.name, o.created_at
FROM storage.objects o
WHERE o.bucket_id = 'submissions'
  AND NOT EXISTS (
    SELECT 1 FROM files f WHERE f.bucket = 'submissions' AND f.path = o.name
  );

-- 3. Duplicate files.path values (multiple files rows claiming the same
--    object -- no uniqueness constraint has ever existed on this column).
SELECT path, count(*), array_agg(id) AS file_ids, array_agg(submission_id) AS submission_ids
FROM files
WHERE bucket = 'submissions'
GROUP BY path
HAVING count(*) > 1;

-- 4. files rows whose submission_id does not resolve (should be impossible
--    given the ON DELETE CASCADE FK added in 013, but check anyway in case
--    any row predates that constraint or the FK was ever disabled).
SELECT f.id AS file_id, f.submission_id
FROM files f
WHERE NOT EXISTS (SELECT 1 FROM submissions s WHERE s.id = f.submission_id);

-- 5. Submissions with null organization_id -- their files are now
--    invisible to everyone under the fixed (fail-closed) policy, whereas
--    before they may have been visible to any authenticated user via the
--    removed null-org fallback. This is the one category where deploying
--    029 can make something LESS accessible than it was (by design -- see
--    the accompanying report) -- use this to find any real submissions that
--    need their organization_id repaired.
SELECT s.id AS submission_id, s.form_id, s.created_at,
       (SELECT count(*) FROM files f WHERE f.submission_id = s.id) AS file_count
FROM submissions s
WHERE s.organization_id IS NULL;

-- 6. (added with migration 030) Abandoned ticketed uploads -- an object
--    was written under a valid ticket but submit_form was never called to
--    consume it (browser closed, network failure, user gave up). Eligible
--    for cleanup only once conservatively past its own expiry, to avoid
--    racing a slow-but-legitimate in-flight submission:
--      object has no files row (nothing has claimed it)
--      AND its path matches an upload_tickets row with consumed_at IS NULL
--      AND that ticket's expires_at < now() - interval '24 hours'
--    Objects with no matching ticket row at all (pre-030 data, or the
--    ArchivedSubmissions.tsx bucket-name bug in note #2 above) are not
--    covered by this rule -- they fall under category 2 instead, which
--    intentionally has no age-based rule since there's no ticket to have
--    expired.
SELECT o.id AS object_id, o.name, t.expires_at, t.created_at AS ticket_created_at
FROM storage.objects o
JOIN upload_tickets t ON t.path = o.name
WHERE o.bucket_id = 'submissions'
  AND t.consumed_at IS NULL
  AND t.expires_at < now() - interval '24 hours'
  AND NOT EXISTS (SELECT 1 FROM files f WHERE f.bucket = 'submissions' AND f.path = o.name);

-- No suggested cleanup query is provided here: unlike the admin-role
-- cleanup in legacy_admin_row_review.sql, every category above needs a
-- human decision (repair vs. leave vs. investigate further), not a
-- mechanical delete. If a scheduled job is ever built for category 6, it
-- should delete the storage object first and only then the upload_tickets
-- row (or leave the ticket row as a permanent record) -- never the reverse,
-- since a ticket row is what lets this query find the object at all.
