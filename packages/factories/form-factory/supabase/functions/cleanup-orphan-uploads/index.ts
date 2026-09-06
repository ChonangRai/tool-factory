// Daily sweep of upload objects that were never attached to a submission.
//
// Eligibility comes from list_orphan_upload_paths (migration 035): the ticket
// was never consumed, expired more than 24 hours ago, and no `files` row
// references the path. Committed attachments are therefore never candidates.
//
// The blob is removed through the Storage API so the backing object is really
// deleted -- deleting from storage.objects would orphan the blob instead. The
// ticket row is dropped only after Storage confirms removal, and the DB-side
// guard re-checks eligibility at that moment, so a re-run is harmless.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const BUCKET = 'submissions';
const BATCH = 200;

Deno.serve(async (req) => {
  // Scheduled invocations authenticate with the service role; nothing here is
  // reachable anonymously.
  const auth = req.headers.get('Authorization') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  if (!auth.includes(serviceKey)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey, { auth: { persistSession: false } });

  const { data: candidates, error } = await admin.rpc('list_orphan_upload_paths', { p_limit: BATCH });
  if (error) {
    console.error('could not list orphans', error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const rows: { ticket_id: string; path: string }[] = candidates ?? [];
  if (rows.length === 0) {
    return new Response(JSON.stringify({ examined: 0, removed: 0, forgotten: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // One Storage call for the batch. remove() is idempotent: paths that are
  // already gone (a previous partial run) come back without error.
  const { data: removed, error: removeError } = await admin.storage.from(BUCKET).remove(rows.map((r) => r.path));
  if (removeError) {
    console.error('storage remove failed', removeError.message);
    return new Response(JSON.stringify({ error: removeError.message }), { status: 500 });
  }

  const goneNames = new Set((removed ?? []).map((o: { name: string }) => o.name));
  let forgotten = 0;
  for (const row of rows) {
    // Objects that were already absent are still eligible to forget; the RPC
    // re-checks the ticket is unconsumed and uncommitted before deleting.
    if (goneNames.size > 0 && !goneNames.has(row.path)) continue;
    const { data: didForget } = await admin.rpc('forget_orphan_ticket', { p_ticket_id: row.ticket_id });
    if (didForget) forgotten++;
  }

  const summary = { examined: rows.length, removed: removed?.length ?? 0, forgotten };
  console.log('orphan sweep', JSON.stringify(summary));
  return new Response(JSON.stringify(summary), { headers: { 'Content-Type': 'application/json' } });
});
