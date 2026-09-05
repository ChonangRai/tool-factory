import { PDFDocument } from 'pdf-lib';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import pdfjsLib from '@/lib/pdfWorker';
import type { DocumentAnalysis } from '@/lib/pdfAnalysis';
import { yieldToBrowser } from '@/lib/scheduling';

/**
 * Two compression strategies, both entirely in-browser:
 *
 *  - structure: re-serialise with object streams. Lossless, keeps text and
 *    vectors byte-for-byte, and typically saves 0-18% depending on how the
 *    file was written in the first place.
 *  - scans: re-encode confidently-detected scanned pages as JPEG at a lower
 *    resolution. Only those pages are touched; every other page is copied
 *    across untouched.
 *
 * Both return the original file whenever the "compressed" result is not
 * actually smaller.
 */

export type ScanPresetKey = 'balanced' | 'smallest';

export const SCAN_PRESETS: Record<ScanPresetKey, { label: string; hint: string; dpi: number; quality: number }> = {
  balanced: { label: 'Balanced', hint: 'Good quality, much smaller', dpi: 150, quality: 0.72 },
  smallest: { label: 'Smallest', hint: 'Lowest quality, smallest file', dpi: 110, quality: 0.6 },
};

/** PDF user space is 72 units per inch. */
const POINTS_PER_INCH = 72;
/** Ceiling on canvas pixels per page, so one huge page cannot exhaust memory. */
const MAX_PAGE_PIXELS = 16_000_000;

export interface CompressionResult {
  blob: Blob;
  mode: 'structure' | 'scans';
  originalBytes: number;
  resultBytes: number;
  savedBytes: number;
  savedPercent: number;
  /** True when the result was not smaller and the original was returned. */
  keptOriginal: boolean;
  pageCount: number;
  rasterizedPages: number[];
}

export interface CompressProgress {
  current: number;
  total: number;
}

const buildResult = (
  original: File,
  compressed: Uint8Array | null,
  mode: CompressionResult['mode'],
  pageCount: number,
  rasterizedPages: number[]
): CompressionResult => {
  const originalBytes = original.size;
  const keptOriginal = !compressed || compressed.byteLength >= originalBytes;
  const blob = keptOriginal
    ? original.slice(0, original.size, 'application/pdf')
    : new Blob([compressed as BlobPart], { type: 'application/pdf' });
  const resultBytes = keptOriginal ? originalBytes : (compressed as Uint8Array).byteLength;

  return {
    blob,
    mode,
    originalBytes,
    resultBytes,
    savedBytes: originalBytes - resultBytes,
    savedPercent: originalBytes > 0 ? ((originalBytes - resultBytes) / originalBytes) * 100 : 0,
    keptOriginal,
    pageCount,
    rasterizedPages: keptOriginal ? [] : rasterizedPages,
  };
};

/** Lossless: rewrite the file's object structure, changing no page content. */
export const optimizeStructure = async (file: File): Promise<CompressionResult> => {
  const bytes = await file.arrayBuffer();
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const pageCount = doc.getPageCount();
  const saved = await doc.save({ useObjectStreams: true });

  if (doc.getPageCount() !== pageCount) {
    throw new Error('Page count changed during optimisation');
  }

  return buildResult(file, saved, 'structure', pageCount, []);
};

/** Renders one page to a JPEG at the requested DPI, then frees the canvas. */
const renderPageToJpeg = async (
  pdf: PDFDocumentProxy,
  pageNumber: number,
  dpi: number,
  quality: number
): Promise<{ bytes: Uint8Array; widthPt: number; heightPt: number } | null> => {
  const page = await pdf.getPage(pageNumber);
  const basis = page.getViewport({ scale: 1 });
  let scale = dpi / POINTS_PER_INCH;

  // Cap the pixel budget rather than the DPI, so an oversized page degrades
  // gracefully instead of allocating a canvas the tab cannot hold.
  const pixels = basis.width * scale * basis.height * scale;
  if (pixels > MAX_PAGE_PIXELS) {
    scale *= Math.sqrt(MAX_PAGE_PIXELS / pixels);
  }

  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const context = canvas.getContext('2d');
  if (!context) {
    canvas.width = 0;
    canvas.height = 0;
    return null;
  }

  // Scanned pages have no transparency; a white ground keeps JPEG honest.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);

  try {
    // 'print' intent renders the same flattened page but schedules its
    // continuations on microtasks instead of requestAnimationFrame, which a
    // background tab throttles to a standstill -- so a long compression keeps
    // running when the user switches away. The per-page yield below is what
    // keeps the visible UI responsive.
    await page.render({ canvasContext: context, viewport, canvas, intent: 'print' }).promise;
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality)
    );
    if (!blob) return null;
    return {
      bytes: new Uint8Array(await blob.arrayBuffer()),
      // basis is already rotation-adjusted, so the rebuilt page keeps the
      // original's dimensions and orientation.
      widthPt: basis.width,
      heightPt: basis.height,
    };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
    page.cleanup();
  }
};

/**
 * Rebuilds the document, re-encoding only the pages the analyser flagged as
 * scans. Pages are processed one at a time and every other page is copied
 * from the source, so text and vector pages are never touched.
 */
export const compressScannedPages = async (
  file: File,
  analysis: DocumentAnalysis,
  preset: ScanPresetKey,
  onProgress?: (progress: CompressProgress) => void
): Promise<CompressionResult> => {
  const { dpi, quality } = SCAN_PRESETS[preset];
  const targets = new Set(analysis.scanLikePageNumbers);
  if (targets.size === 0) return optimizeStructure(file);

  const bytes = await file.arrayBuffer();
  const source = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const pageCount = source.getPageCount();
  const output = await PDFDocument.create();

  // Copy every page we are keeping in one call, then interleave in order.
  const copyIndices: number[] = [];
  for (let i = 0; i < pageCount; i++) {
    if (!targets.has(i + 1)) copyIndices.push(i);
  }
  const copied = await output.copyPages(source, copyIndices);
  const copiedByIndex = new Map(copyIndices.map((sourceIndex, position) => [sourceIndex, copied[position]]));

  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
  const rasterizedPages: number[] = [];

  try {
    for (let i = 0; i < pageCount; i++) {
      const pageNumber = i + 1;
      onProgress?.({ current: pageNumber, total: pageCount });

      if (targets.has(pageNumber)) {
        const rendered = await renderPageToJpeg(pdf, pageNumber, dpi, quality);
        if (rendered) {
          const image = await output.embedJpg(rendered.bytes);
          const page = output.addPage([rendered.widthPt, rendered.heightPt]);
          page.drawImage(image, { x: 0, y: 0, width: rendered.widthPt, height: rendered.heightPt });
          rasterizedPages.push(pageNumber);
        } else {
          // Rendering failed: fall back to the untouched original page.
          const [fallback] = await output.copyPages(source, [i]);
          output.addPage(fallback);
        }
      } else {
        const page = copiedByIndex.get(i);
        if (page) output.addPage(page);
      }

      await yieldToBrowser();
    }
  } finally {
    await pdf.destroy();
  }

  if (output.getPageCount() !== pageCount) {
    throw new Error('Page count changed during compression');
  }

  const saved = await output.save({ useObjectStreams: true });
  const result = buildResult(file, saved, 'scans', pageCount, rasterizedPages);

  // If re-encoding did not pay off, structural optimisation still might.
  if (result.keptOriginal) {
    const structural = await optimizeStructure(file);
    if (!structural.keptOriginal) return structural;
  }

  return result;
};

export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};
