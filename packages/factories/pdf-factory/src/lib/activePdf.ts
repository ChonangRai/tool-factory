/**
 * Carries one PDF from the tool that produced it to the tool the user picks
 * next, so a workflow like Image to PDF -> Compress -> Protect never involves
 * a download and a re-upload.
 *
 * The value is a plain in-memory `File`. Blob storage is managed by the
 * browser rather than the JS heap, so a 50MB result costs one reference no
 * matter how many hops it makes, and nothing is copied on the way through.
 *
 * Deliberately not persisted. IndexedDB or session storage would leave the
 * user's document on disk after the tab is gone, which is exactly what a
 * client-only tool must not do; a refresh simply loses the handoff and the
 * destination falls back to its normal upload zone. Bytes are never put in
 * route state either -- history entries are serialised and cloned.
 */

export interface ActivePdfMeta {
  fileName: string;
  /** Catalog id of the tool that produced it, e.g. 'compress'. */
  sourceToolId: string;
  /** Display name, so a destination can say "From Compress" without a lookup. */
  sourceToolName: string;
  producedAt: number;
  /** Only set where the producing tool already knew it. */
  pageCount?: number;
}

export interface ActivePdfHandoff {
  file: File;
  meta: ActivePdfMeta;
}

/**
 * One slot. A second handoff replaces the first, dropping the reference to the
 * previous file so it can be collected.
 */
let handoff: ActivePdfHandoff | null = null;

export const setActivePdf = (file: File, meta: ActivePdfMeta): void => {
  handoff = { file, meta };
};

/**
 * The canonical way to receive a carried PDF: reads and clears in one step.
 *
 * Read-once is what keeps navigation honest. Once a destination has taken the
 * file, going back and forward again -- or opening the same tool later -- gets
 * nothing, instead of silently resurrecting a document the user has moved on
 * from.
 */
export const claimActivePdf = (): ActivePdfHandoff | null => {
  const claimed = handoff;
  handoff = null;
  return claimed;
};

/** Inspection only (tests, diagnostics). Never load a document through this. */
export const peekActivePdf = (): ActivePdfHandoff | null => handoff;

export const clearActivePdf = (): void => {
  handoff = null;
};
