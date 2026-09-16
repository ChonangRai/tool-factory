// Canonical choice-option model: a string[] of distinct, trimmed, non-empty
// labels. Options are always stored as an array; the string branch only
// tolerates hand-edited or legacy settings holding newline-delimited text.
export function normalizeOptions(raw: unknown): string[] {
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(/\r?\n/)
      : [];
  return list
    .filter((o) => o !== null && o !== undefined)
    .map((o) => String(o).trim())
    .filter(Boolean);
}

const optionKey = (o: string) => o.trim().toLocaleLowerCase();

/** Indexes of rows that repeat an earlier option (case-insensitive). */
export function duplicateOptionIndexes(options: string[]): Set<number> {
  const seen = new Set<string>();
  const dupes = new Set<number>();
  options.forEach((o, i) => {
    const key = optionKey(o);
    if (!key) return;
    if (seen.has(key)) dupes.add(i);
    seen.add(key);
  });
  return dupes;
}
