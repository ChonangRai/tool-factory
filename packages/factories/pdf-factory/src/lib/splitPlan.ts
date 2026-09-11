import JSZip from 'jszip';
import { downloadBlob } from '@/lib/download';
import {
  baseName,
  buildPdfBytes,
  pageRuns,
  type PageGroup,
  type WorkspacePage,
  type WorkspaceSource,
} from '@/lib/workspaceDoc';
import { pdfBlob, pdfFile } from '@/lib/pdfBytes';

/**
 * Split produces several documents; Extract produces one. They are different
 * actions here on purpose -- the old "Split into pages" exploded a PDF into
 * loose single-page thumbnails whose only remaining action was to merge them
 * back together, which is not a split at all.
 */
export type SplitMode = 'ranges' | 'groups' | 'every';

export interface SplitPart {
  /** Filename stem, without the `.pdf`. */
  label: string;
  /** 0-based page positions in the current document order. */
  positions: number[];
}

export interface ParsedRanges {
  parts: SplitPart[];
  error: string | null;
}

/**
 * Parses `1-5, 6-10, 11-22` (or newline separated) into one part per range.
 *
 * Each range is its own output file, which is what distinguishes Split from
 * Extract: `1-5, 9` yields two PDFs, not one PDF of six pages.
 */
export const parseRanges = (input: string, pageCount: number): ParsedRanges => {
  const parts: SplitPart[] = [];
  const tokens = input
    .split(/[\n,]/)
    .map(token => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) return { parts, error: 'Enter at least one page range.' };

  for (const token of tokens) {
    const match = /^(\d+)\s*(?:[-–—]\s*(\d+))?$/.exec(token);
    if (!match) return { parts: [], error: `"${token}" is not a page or range like 1-5.` };

    const from = Number(match[1]);
    const to = match[2] === undefined ? from : Number(match[2]);
    if (from < 1 || to < 1 || from > pageCount || to > pageCount) {
      return { parts: [], error: `"${token}" is outside this document's ${pageCount} pages.` };
    }
    if (to < from) return { parts: [], error: `"${token}" ends before it starts.` };

    const positions = Array.from({ length: to - from + 1 }, (_, i) => from - 1 + i);
    parts.push({ label: from === to ? `page-${from}` : `pages-${from}-${to}`, positions });
  }

  return { parts, error: null };
};

/** One part per group, plus one per run of ungrouped pages between them. */
export const groupParts = (pages: WorkspacePage[], groups: PageGroup[]): SplitPart[] => {
  const parts: SplitPart[] = [];

  for (const run of pageRuns(pages, groups)) {
    const positions = run.pages.map((_, i) => run.start + i);
    if (run.group) {
      parts.push({ label: slug(run.group.name), positions });
      continue;
    }
    // Ungrouped pages between groups are kept together as one part rather than
    // silently dropped, so every page of the document ends up in some output.
    const previous = parts[parts.length - 1];
    if (previous?.label === 'ungrouped-pending') {
      previous.positions.push(...positions);
    } else {
      parts.push({ label: 'ungrouped-pending', positions: [...positions] });
    }
  }

  return parts.map(part =>
    part.label === 'ungrouped-pending'
      ? { ...part, label: rangeLabel(part.positions) }
      : part,
  );
};

export const everyPageParts = (pages: WorkspacePage[]): SplitPart[] =>
  pages.map((_, index) => ({ label: `page-${index + 1}`, positions: [index] }));

const rangeLabel = (positions: number[]): string => {
  const first = positions[0] + 1;
  const last = positions[positions.length - 1] + 1;
  return first === last ? `page-${first}` : `pages-${first}-${last}`;
};

const slug = (name: string): string =>
  name
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase() || 'group';

export interface SplitResult {
  /** Set only when a single part was produced, so it can be carried onward. */
  file: File | null;
  fileName: string;
  partCount: number;
}

/**
 * Builds each part and hands the user the result: one part downloads as a PDF
 * (and stays available as a handoff for the next tool), several download as a
 * ZIP, which is how PDF to Image already delivers multiple outputs.
 */
export const runSplit = async (
  parts: SplitPart[],
  pages: WorkspacePage[],
  sources: WorkspaceSource[],
  documentName: string,
  onProgress?: (done: number, total: number) => void,
): Promise<SplitResult> => {
  const stem = baseName(documentName);

  if (parts.length === 1) {
    const name = `${stem}-${parts[0].label}.pdf`;
    const selected = parts[0].positions.map(position => pages[position]).filter(Boolean);
    const file = pdfFile(await buildPdfBytes(selected, sources), name);
    onProgress?.(1, 1);
    downloadBlob(file, name);
    return { file, fileName: name, partCount: 1 };
  }

  const zip = new JSZip();
  let done = 0;
  for (const part of parts) {
    const selected = part.positions.map(position => pages[position]).filter(Boolean);
    if (selected.length === 0) continue;
    zip.file(`${stem}-${part.label}.pdf`, pdfBlob(await buildPdfBytes(selected, sources)));
    done += 1;
    onProgress?.(done, parts.length);
    // Yield so the progress UI can repaint between parts of a large split.
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  const zipName = `${stem}-split.zip`;
  downloadBlob(await zip.generateAsync({ type: 'blob' }), zipName);
  return { file: null, fileName: zipName, partCount: done };
};
