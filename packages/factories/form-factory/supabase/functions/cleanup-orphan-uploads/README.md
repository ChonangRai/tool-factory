# cleanup-orphan-uploads

Daily sweep that deletes upload objects which were never attached to a
submission, then forgets their ticket rows.

Eligibility (enforced in SQL by `list_orphan_upload_paths`, migration 035):

- an `upload_tickets` row exists for the path
- `consumed_at IS NULL`
- `expires_at < now() - interval '24 hours'`
- no `files.path` references the object

The blob is removed with the Storage API (`storage.from('submissions').remove()`)
so the backing object is actually deleted. `storage.objects` is never touched
directly. The ticket row is dropped only after Storage confirms removal, and
`forget_orphan_ticket` re-checks eligibility at that moment, so repeat runs are
harmless.

## Required one-time configuration

Scheduling cannot be expressed in this repo: Supabase schedules Edge Functions
from the dashboard, and wiring `pg_cron` to call it would mean storing the
service-role key inside the database. Configure it once:

**Dashboard → Edge Functions → `cleanup-orphan-uploads` → Schedules → Add schedule**

- Cron expression: `17 3 * * *` (daily, 03:17 UTC — off the hour to avoid
  platform-wide cron spikes)
- Method: `POST`
- Header: `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`

The function refuses any request whose `Authorization` header does not carry
the service-role key, so it is not reachable anonymously.

Verify a run with:

```
supabase functions invoke cleanup-orphan-uploads --no-verify-jwt \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

It returns `{ examined, removed, forgotten }`.
