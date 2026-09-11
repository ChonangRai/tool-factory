import type { PDFDocumentProxy } from 'pdfjs-dist';
import pdfjsLib from '@/lib/pdfWorker';

/**
 * One pdf.js document per source file, shared by every thumbnail and by the
 * editor.
 *
 * A 300-page organiser used to mean 300 separate `getDocument` calls over the
 * same bytes -- each one parsing the whole file and holding its own copy. The
 * cache is keyed by the workspace's source id (not the File, which can be
 * replaced) and the entry is the in-flight promise, so simultaneous mounts
 * share one parse.
 *
 * Nothing here touches the network: pdf.js is handed an ArrayBuffer read from
 * the local File, and the worker is bundled.
 */
const docs = new Map<string, Promise<PDFDocumentProxy>>();

export const getRenderDoc = (sourceId: string, file: File): Promise<PDFDocumentProxy> => {
  const existing = docs.get(sourceId);
  if (existing) return existing;

  const loading = (async () => {
    const arrayBuffer = await file.arrayBuffer();
    return pdfjsLib.getDocument(arrayBuffer).promise;
  })();

  // A failed load must not poison the key for the rest of the session.
  loading.catch(() => docs.delete(sourceId));
  docs.set(sourceId, loading);
  return loading;
};

export const releaseRenderDoc = (sourceId: string): void => {
  const entry = docs.get(sourceId);
  if (!entry) return;
  docs.delete(sourceId);
  void entry.then(doc => doc.destroy()).catch(() => undefined);
};

/** Drops every cached document, e.g. when the workspace is emptied. */
export const releaseAllRenderDocs = (): void => {
  for (const sourceId of [...docs.keys()]) releaseRenderDoc(sourceId);
};
