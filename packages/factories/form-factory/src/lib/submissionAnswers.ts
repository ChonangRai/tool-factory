import type { FormField } from '@/types/formFields';

// Resolves a submission's stored answers into labelled rows. Field
// definitions come from the snapshot taken at submit time (038), falling back
// to the form's current fields for anything the snapshot lacks, so renamed or
// deleted fields stay readable on historical submissions.

export interface SnapshotField {
  id: string;
  label?: string;
  type?: string;
  order?: number;
  options?: string[];
}

export interface SubmissionFile {
  id: string;
  filename: string;
  path: string;
  mime?: string | null;
  field_id?: string | null;
}

export interface SubmissionRecord {
  id: string;
  created_at: string;
  name?: string | null;
  email?: string | null;
  contact_number?: string | null;
  description?: string | null;
  data?: Record<string, unknown> | null;
  field_snapshot?: SnapshotField[] | null;
  files?: SubmissionFile[] | null;
}

export interface ResolvedColumn {
  id: string;
  label: string;
  type: string;
}

export interface ResolvedAnswer extends ResolvedColumn {
  value: unknown;
  files: SubmissionFile[];
}

const UNASSIGNED_FILES = '__attachments__';

/**
 * Columns for one or more submissions of the same form: current form fields
 * first (in form order), then fields that exist only in older snapshots.
 */
export function resolveColumns(
  formFields: FormField[],
  submissions: SubmissionRecord[]
): ResolvedColumn[] {
  const columns = new Map<string, ResolvedColumn>();
  const add = (f: { id: string; label?: string; type?: string }) => {
    if (!f?.id || columns.has(f.id)) return;
    columns.set(f.id, { id: f.id, label: f.label?.trim() || 'Untitled field', type: f.type || 'text' });
  };

  [...formFields].sort((a, b) => a.order - b.order).forEach(add);
  for (const s of submissions) {
    const snapshot = Array.isArray(s.field_snapshot) ? s.field_snapshot : [];
    [...snapshot].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).forEach(add);
  }

  // Attachments whose field is unknown (pre-038 uploads) still need a home.
  if (submissions.some((s) => (s.files ?? []).some((f) => !f.field_id || !columns.has(f.field_id)))) {
    columns.set(UNASSIGNED_FILES, { id: UNASSIGNED_FILES, label: 'Attachments', type: 'file' });
  }

  // Disambiguate duplicate labels so CSV headers stay distinct.
  const seen = new Map<string, number>();
  for (const col of columns.values()) {
    const n = (seen.get(col.label) ?? 0) + 1;
    seen.set(col.label, n);
    if (n > 1) col.label = `${col.label} (${n})`;
  }
  return [...columns.values()];
}

export function resolveAnswers(columns: ResolvedColumn[], submission: SubmissionRecord): ResolvedAnswer[] {
  const data = submission.data ?? {};
  const files = submission.files ?? [];
  const known = new Set(columns.map((c) => c.id));

  return columns.map((col) => ({
    ...col,
    value: col.type === 'file' ? undefined : data[col.id],
    files:
      col.id === UNASSIGNED_FILES
        ? files.filter((f) => !f.field_id || !known.has(f.field_id))
        : col.type === 'file'
          ? files.filter((f) => f.field_id === col.id)
          : [],
  }));
}

/** Plain-text rendering shared by the detail view and CSV export. */
export function formatAnswer(answer: Pick<ResolvedAnswer, 'type' | 'value' | 'files'>): string {
  if (answer.type === 'file') return answer.files.map((f) => f.filename).join('; ');
  const { value } = answer;
  if (value === undefined || value === null) return '';
  if (answer.type === 'checkbox' || typeof value === 'boolean') {
    if (value === true || value === 'true') return 'Yes';
    if (value === false || value === 'false') return 'No';
  }
  if (Array.isArray(value)) return value.map((v) => String(v ?? '')).filter(Boolean).join('; ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function isAnswered(answer: ResolvedAnswer): boolean {
  return formatAnswer(answer).trim() !== '';
}

/** Answers were not stored before migration 038; only summary columns exist. */
export function hasStoredAnswers(submission: SubmissionRecord): boolean {
  return Array.isArray(submission.field_snapshot);
}
