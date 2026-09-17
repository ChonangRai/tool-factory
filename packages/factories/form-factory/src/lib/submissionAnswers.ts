import type { FormField } from '@/types/formFields';
import type { NormalizedSettings } from '@/lib/formSections';

// Resolves a submission's stored answers into labelled rows. Field
// definitions come from the snapshot taken at submit time (038, extended with
// section identity in 040), falling back to the form's current definition for
// anything the snapshot lacks, so renamed/moved/deleted fields and sections
// stay readable on historical submissions.

export interface SnapshotField {
  id: string;
  label?: string;
  type?: string;
  order?: number;
  options?: string[];
  sectionId?: string;
  sectionTitle?: string;
  sectionOrder?: number;
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
  /** Section title as it was when the submission was made; '' when none. */
  sectionTitle: string;
}

export interface ResolvedAnswer extends ResolvedColumn {
  value: unknown;
  files: SubmissionFile[];
}

export interface AnswerSection {
  title: string;
  answers: ResolvedAnswer[];
}

const UNASSIGNED_FILES = '__attachments__';

/**
 * Columns for one or more submissions of the same form: current form fields
 * first (in form order), then fields that exist only in older snapshots.
 */
export function resolveColumns(
  current: NormalizedSettings | FormField[],
  submissions: SubmissionRecord[]
): ResolvedColumn[] {
  const currentFields = Array.isArray(current) ? current : current.fields;
  const sectionTitles = new Map<string, string>(
    Array.isArray(current) ? [] : current.sections.map((s) => [s.id, s.title.trim()])
  );

  // Section titles come from the snapshot when the submission has one: the
  // grouping must describe the form as it was submitted, even if the section
  // has since been renamed, or the field moved to another section.
  const snapshotSections = new Map<string, string>();
  for (const s of submissions) {
    for (const f of Array.isArray(s.field_snapshot) ? s.field_snapshot : []) {
      if (f?.id && !snapshotSections.has(f.id)) snapshotSections.set(f.id, (f.sectionTitle ?? '').trim());
    }
  }

  const columns = new Map<string, ResolvedColumn>();
  const add = (f: { id: string; label?: string; type?: string; sectionTitle?: string }) => {
    if (!f?.id || columns.has(f.id)) return;
    columns.set(f.id, {
      id: f.id,
      label: f.label?.trim() || 'Untitled field',
      type: f.type || 'text',
      sectionTitle: f.sectionTitle?.trim() ?? '',
    });
  };

  [...currentFields]
    .sort((a, b) => a.order - b.order)
    .forEach((f) =>
      add({
        ...f,
        sectionTitle: snapshotSections.get(f.id) ?? sectionTitles.get(f.sectionId ?? '') ?? '',
      })
    );

  for (const s of submissions) {
    const snapshot = Array.isArray(s.field_snapshot) ? s.field_snapshot : [];
    [...snapshot].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).forEach(add);
  }

  // Attachments whose field is unknown (pre-038 uploads) still need a home.
  if (submissions.some((s) => (s.files ?? []).some((f) => !f.field_id || !columns.has(f.field_id)))) {
    columns.set(UNASSIGNED_FILES, { id: UNASSIGNED_FILES, label: 'Attachments', type: 'file', sectionTitle: '' });
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

/**
 * Answers grouped by their snapshotted section, in column order. A submission
 * from a form without sections yields one untitled group.
 */
export function groupAnswersBySection(answers: ResolvedAnswer[]): AnswerSection[] {
  // Answers of the same section are merged even when they are not adjacent
  // (a field moved between sections keeps its original section here), so a
  // heading never appears twice.
  const groups = new Map<string, AnswerSection>();
  for (const answer of answers) {
    const title = answer.sectionTitle ?? '';
    const group = groups.get(title) ?? { title, answers: [] };
    group.answers.push(answer);
    groups.set(title, group);
  }
  return [...groups.values()];
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
