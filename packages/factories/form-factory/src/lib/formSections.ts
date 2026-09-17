import type { FieldType, FormField } from '@/types/formFields';
import { normalizeOptions } from '@/lib/fieldOptions';

// The single reader for a form definition. Builder, public renderer, preview
// and review all go through normalizeFormSettings, so a form saved before
// sections existed (or with hand-edited settings) is understood the same way
// everywhere: as one unnamed section holding every field, in field order.
//
// Sections live in forms.settings alongside the flat fields array; fields
// point at their section with sectionId. Field ids are never rewritten.

export const SETTINGS_VERSION = 2;
export const DEFAULT_SECTION_ID = 'section_default';

export interface FormSection {
  id: string;
  title: string;
  description?: string;
  order: number;
}

export interface NormalizedSettings {
  version: number;
  sections: FormSection[];
  fields: FormField[];
  /**
   * Whether submitters may keep unfinished answers in their own browser.
   * On unless the collector turns it off for a sensitive form.
   */
  saveProgress: boolean;
}

export interface SectionWithFields {
  section: FormSection;
  fields: FormField[];
}

export const generateSectionId = (): string =>
  `section_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

const FIELD_TYPES: FieldType[] = [
  'text', 'number', 'email', 'phone', 'textarea', 'date', 'select', 'checkbox', 'file',
];

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const text = (v: unknown): string => (typeof v === 'string' ? v : '');

function normalizeSection(raw: unknown, index: number): FormSection | null {
  if (!isObject(raw)) return null;
  const id = text(raw.id).trim();
  if (!id) return null;
  const description = text(raw.description).trim();
  return {
    id,
    title: text(raw.title).trim(),
    // The key is kept whenever it exists, empty included: that is how the
    // builder shows an empty description box once "Add description" is used.
    // toStoredSettings drops it again when it is still empty at save time.
    ...(raw.description !== undefined ? { description } : {}),
    order: typeof raw.order === 'number' && Number.isFinite(raw.order) ? raw.order : index,
  };
}

function normalizeField(raw: unknown, index: number): FormField | null {
  if (!isObject(raw)) return null;
  const id = text(raw.id).trim();
  if (!id) return null;
  const type = FIELD_TYPES.includes(raw.type as FieldType) ? (raw.type as FieldType) : 'text';
  const field: FormField = {
    ...(raw as unknown as FormField),
    id,
    type,
    label: text(raw.label).trim() || 'Untitled field',
    required: raw.required === true,
    order: typeof raw.order === 'number' && Number.isFinite(raw.order) ? raw.order : index,
  };
  if (type === 'select') field.options = normalizeOptions(raw.options);
  else delete field.options;
  return field;
}

/** Reads any historical settings shape into the current model. */
export function normalizeFormSettings(raw: unknown): NormalizedSettings {
  const settings = isObject(raw) ? raw : {};

  const fields = (Array.isArray(settings.fields) ? settings.fields : [])
    .map(normalizeField)
    .filter((f): f is FormField => f !== null)
    .map((f, i) => ({ f, i }))
    .sort((a, b) => a.f.order - b.f.order || a.i - b.i)
    .map(({ f }) => f);

  const sections = (Array.isArray(settings.sections) ? settings.sections : [])
    .map(normalizeSection)
    .filter((s): s is FormSection => s !== null)
    .filter((s, i, all) => all.findIndex((o) => o.id === s.id) === i)
    .map((s, i) => ({ s, i }))
    .sort((a, b) => a.s.order - b.s.order || a.i - b.i)
    .map(({ s }) => s);

  // No usable sections: one unnamed section holding everything. It is not
  // written back here -- only a later save persists it.
  if (sections.length === 0) {
    sections.push({ id: DEFAULT_SECTION_ID, title: '', order: 0 });
  }

  const known = new Set(sections.map((s) => s.id));
  const ordered: FormField[] = [];
  for (const section of sections) {
    for (const field of fields) {
      const sectionId = text((field as { sectionId?: unknown }).sectionId);
      const belongs = known.has(sectionId) ? sectionId : sections[0].id;
      if (belongs === section.id) ordered.push({ ...field, sectionId: section.id });
    }
  }

  return {
    version: SETTINGS_VERSION,
    sections: sections.map((s, i) => ({ ...s, order: i })),
    fields: ordered.map((f, i) => ({ ...f, order: i })),
    saveProgress: settings.saveProgress !== false,
  };
}

/** Sections with their fields, in display order. */
export function groupFieldsBySection(settings: NormalizedSettings): SectionWithFields[] {
  return settings.sections.map((section) => ({
    section,
    fields: settings.fields.filter((f) => f.sectionId === section.id),
  }));
}

/** What gets written to forms.settings. */
export function toStoredSettings(settings: NormalizedSettings) {
  return {
    version: SETTINGS_VERSION,
    saveProgress: settings.saveProgress !== false,
    sections: settings.sections.map((s, i) => ({
      id: s.id,
      title: s.title,
      ...(s.description ? { description: s.description } : {}),
      order: i,
    })),
    fields: settings.fields.map((f, i) => ({ ...f, order: i })),
  };
}

/** A heading is only worth showing when the collector gave the section one. */
export const sectionHeading = (section: FormSection): string => section.title.trim();
