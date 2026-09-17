import { supabase } from '@/integrations/supabase/client';

const BUCKET = 'submissions';

export type PurgeResult = 'deleted' | 'already-gone';

// list() rather than exists(): Storage answers a HEAD for a missing object
// with a bodiless 400 that storage-js reports as an unknown error, which is
// indistinguishable from a real failure. Unknown means "still there".
async function objectExists(path: string): Promise<boolean> {
  const slash = path.lastIndexOf('/');
  const folder = slash >= 0 ? path.slice(0, slash) : '';
  const name = path.slice(slash + 1);
  const { data, error } = await supabase.storage.from(BUCKET).list(folder, { search: name, limit: 100 });
  if (error) throw new Error(`Could not verify attachment removal: ${error.message}`);
  return (data ?? []).some((o) => o.name === name);
}

// Permanently deletes one submission and its attachments.
//
// Order matters: the Storage DELETE policy authorizes an object through its
// files row, so objects are removed while those rows still exist. Rows are
// deleted only once every attachment is confirmed gone; any failure leaves the
// submission intact so the purge can simply be retried. files and
// receipt_tickets rows go with the submission via ON DELETE CASCADE.
export async function purgeSubmission(submissionId: string): Promise<PurgeResult> {
  const { data: files, error: filesError } = await supabase
    .from('files')
    .select('path, bucket')
    .eq('submission_id', submissionId);
  if (filesError) throw filesError;

  const paths = (files ?? []).map((f) => f.path);
  if ((files ?? []).some((f) => (f.bucket ?? BUCKET) !== BUCKET)) {
    throw new Error('Attachment is stored in an unexpected bucket; nothing was deleted.');
  }

  if (paths.length > 0) {
    const { data: removed, error: storageError } = await supabase.storage.from(BUCKET).remove(paths);
    if (storageError) throw new Error(`Could not delete attachments: ${storageError.message}`);

    // Storage silently skips objects the caller may not delete, so confirm
    // anything not reported as removed is really absent (e.g. a retry after a
    // partial failure) before touching the rows.
    const removedNames = new Set((removed ?? []).map((o) => o.name));
    for (const path of paths.filter((p) => !removedNames.has(p))) {
      if (await objectExists(path)) {
        throw new Error('You do not have permission to delete this submission’s attachments.');
      }
    }
  }

  const { data: deleted, error: deleteError } = await supabase
    .from('submissions')
    .delete()
    .eq('id', submissionId)
    .select('id');
  if (deleteError) throw deleteError;
  if (deleted && deleted.length > 0) return 'deleted';

  // Nothing deleted: either already purged, or not visible/permitted.
  const { data: visible, error: visibleError } = await supabase
    .from('submissions')
    .select('id')
    .eq('id', submissionId)
    .maybeSingle();
  if (visibleError) throw visibleError;
  if (visible) throw new Error('You do not have permission to delete this submission.');
  return 'already-gone';
}
