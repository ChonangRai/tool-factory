import { PDFDocument, degrees } from 'pdf-lib';
import { pdfFile } from '@/lib/pdfBytes';
import { createAnnotationPainter, type Annotation } from '@/lib/annotations';

/**
 * The workspace is a *page* organiser.
 *
 * A source is an uploaded file, kept only so its bytes can be read again at
 * export time. The ordered `WorkspacePage[]` is the document: reordering,
 * rotating, deleting, extracting and splitting all happen there, and nothing
 * is rewritten until the user exports. That is what lets a 22-page upload be
 * 22 editable pages rather than one opaque item, and what keeps an annotation
 * attached to its page when the page moves.
 */
export interface WorkspaceSource {
  id: string;
  file: File;
  /** Display name, stable even if the file is later replaced. */
  name: string;
  pageCount: number;
}

export interface WorkspacePage {
  id: string;
  sourceId: string;
  /** 0-based index of this page inside its source file. */
  sourceIndex: number;
  /** Quarter turns the user has asked for, applied at export. */
  rotation: number;
  annotations: Annotation[];
  /** Organisational only -- never affects the bytes of a normal export. */
  groupId: string | null;
}

export interface PageGroup {
  id: string;
  name: string;
  collapsed: boolean;
}

let idCounter = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

export const newSourceId = () => nextId('src');
export const newGroupId = () => nextId('grp');

export const pagesForSource = (source: WorkspaceSource): WorkspacePage[] =>
  Array.from({ length: source.pageCount }, (_, index) => ({
    id: nextId('pg'),
    sourceId: source.id,
    sourceIndex: index,
    rotation: 0,
    annotations: [],
    groupId: null,
  }));

/** A default group name reflecting where the pages currently sit. */
export const defaultGroupName = (positions: number[]): string => {
  if (positions.length === 0) return 'Pages';
  const first = Math.min(...positions) + 1;
  const last = Math.max(...positions) + 1;
  return first === last ? `Page ${first}` : `Pages ${first}–${last}`;
};

/**
 * Gathers the selected pages into one contiguous run at the position of the
 * earliest of them, keeping their relative order.
 *
 * Groups are contiguous by construction so that a collapsed group is a single
 * row the user can move, and so that "export each group" has an unambiguous
 * meaning. A contiguous selection -- the normal case -- does not move at all.
 */
export const groupPages = (
  pages: WorkspacePage[],
  selectedIds: Set<string>,
  groupId: string,
): { pages: WorkspacePage[]; moved: boolean } => {
  const anchor = pages.findIndex(page => selectedIds.has(page.id));
  if (anchor === -1) return { pages, moved: false };

  const taken = pages.filter(page => selectedIds.has(page.id)).map(page => ({ ...page, groupId }));
  const next: WorkspacePage[] = [];

  pages.forEach((page, index) => {
    if (index === anchor) {
      next.push(...taken);
      return;
    }
    if (!selectedIds.has(page.id)) next.push(page);
  });

  const lastSelected = pages.map(page => selectedIds.has(page.id)).lastIndexOf(true);
  const moved = lastSelected - anchor + 1 !== taken.length;

  return { pages: next, moved };
};

/** Drops every group that no longer has any pages in it. */
export const pruneGroups = (groups: PageGroup[], pages: WorkspacePage[]): PageGroup[] => {
  const live = new Set(pages.map(page => page.groupId).filter((id): id is string => id !== null));
  return groups.filter(group => live.has(group.id));
};

/**
 * A page dropped strictly inside a group's run joins it; dropped at a boundary
 * or anywhere else, it is ungrouped. Because a move only ever lifts one page
 * out and puts it back, the run it left closes up and groups stay contiguous.
 */
export const regroupMovedPage = (pages: WorkspacePage[], index: number): WorkspacePage[] => {
  const prev = pages[index - 1];
  const next = pages[index + 1];
  const groupId = prev?.groupId && prev.groupId === next?.groupId ? prev.groupId : null;
  if (pages[index].groupId === groupId) return pages;
  return pages.map((page, i) => (i === index ? { ...page, groupId } : page));
};

/** Contiguous runs of pages that share a group, in document order. */
export interface PageRun {
  group: PageGroup | null;
  pages: WorkspacePage[];
  /** Index of the run's first page in the document. */
  start: number;
}

export const pageRuns = (pages: WorkspacePage[], groups: PageGroup[]): PageRun[] => {
  const byId = new Map(groups.map(group => [group.id, group]));
  const runs: PageRun[] = [];

  pages.forEach((page, index) => {
    const last = runs[runs.length - 1];
    // Ungrouped pages run together too (group id null), so a plain document is
    // one run and lays out as one grid rather than one grid per page.
    if (last && (last.group?.id ?? null) === page.groupId) {
      last.pages.push(page);
      return;
    }
    runs.push({
      group: page.groupId ? byId.get(page.groupId) ?? null : null,
      pages: [page],
      start: index,
    });
  });

  return runs;
};

/**
 * Renders an ordered list of workspace pages into one PDF.
 *
 * Pages are copied per source in a single `copyPages` call so shared fonts and
 * images are carried over once rather than per page, then placed in the order
 * the user arranged. Annotations are painted before the requested rotation is
 * applied, which is the order the old save-then-export path produced, so
 * existing documents export identically.
 */
export const buildPdfBytes = async (
  pages: WorkspacePage[],
  sources: WorkspaceSource[],
): Promise<Uint8Array> => {
  const out = await PDFDocument.create();
  const sourceById = new Map(sources.map(source => [source.id, source]));

  const indicesBySource = new Map<string, number[]>();
  for (const page of pages) {
    const indices = indicesBySource.get(page.sourceId) ?? [];
    indices.push(page.sourceIndex);
    indicesBySource.set(page.sourceId, indices);
  }

  const copiedBySource = new Map<string, Awaited<ReturnType<PDFDocument['copyPages']>>>();
  for (const [sourceId, indices] of indicesBySource) {
    const source = sourceById.get(sourceId);
    if (!source) continue;
    const doc = await PDFDocument.load(await source.file.arrayBuffer());
    copiedBySource.set(sourceId, await out.copyPages(doc, indices));
  }

  const paint = createAnnotationPainter(out);
  const cursors = new Map<string, number>();

  for (const page of pages) {
    const copied = copiedBySource.get(page.sourceId);
    if (!copied) continue;
    const cursor = cursors.get(page.sourceId) ?? 0;
    cursors.set(page.sourceId, cursor + 1);

    const target = copied[cursor];
    if (!target) continue;

    out.addPage(target);
    await paint(target, page.annotations);
    if (page.rotation) {
      target.setRotation(degrees(target.getRotation().angle + page.rotation));
    }
  }

  return out.save();
};

export const buildPdfFile = async (
  pages: WorkspacePage[],
  sources: WorkspaceSource[],
  name: string,
): Promise<File> => pdfFile(await buildPdfBytes(pages, sources), name);

/** `report.pdf` -> `report`, so derived names stay readable. */
export const baseName = (name: string): string => name.replace(/\.pdf$/i, '');
