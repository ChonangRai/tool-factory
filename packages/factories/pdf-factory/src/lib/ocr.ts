import { PDFDocument, StandardFonts } from 'pdf-lib';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { createWorker } from 'tesseract.js';
import pdfjsLib from '@/lib/pdfWorker';
import type { DocumentAnalysis } from '@/lib/pdfAnalysis';
import { pdfBlob } from '@/lib/pdfBytes';
import { yieldToBrowser } from '@/lib/scheduling';
import { drawInvisibleText, MIN_WORD_CONFIDENCE, type RecognizedWord } from '@/lib/ocrTextLayer';

/**
 * English OCR for scanned PDFs, entirely in the browser.
 *
 * The engine (Tesseract compiled to WebAssembly) and its English model are
 * served from this site, never a CDN, and the pages themselves never leave the
 * tab: each page is rendered to a canvas, handed to a worker as an image, and
 * the recognised words are written back into the PDF as an invisible text
 * layer. Nothing about the document is sent anywhere.
 *
 * The whole module is only reachable from the lazily-loaded OCR route, so none
 * of this -- nor the ~3MB of runtime assets it fetches on first use -- is part
 * of the initial download.
 */

/** PDF user space is 72 units per inch. */
const POINTS_PER_INCH = 72;

/**
 * Tesseract's LSTM models are trained around 300dpi and degrade noticeably
 * below ~200dpi, so pages are rendered at 300dpi regardless of the resolution
 * of the scan inside them.
 */
const OCR_DPI = 300;

/**
 * Ceiling on canvas pixels per page, matching the compressor: an oversized
 * page loses resolution rather than allocating a canvas the tab cannot hold.
 * A 300dpi A4 page is ~8.7M pixels, so ordinary documents never hit this.
 */
const MAX_PAGE_PIXELS = 16_000_000;

/**
 * Runtime assets are emitted to a stable path by the `ocrRuntimeAssets` plugin
 * in vite.config.ts. A directory is used rather than per-file imports because
 * Tesseract picks the core build itself (SIMD or not) by appending a filename,
 * and resolves the model the same way -- which hashed asset names cannot
 * express. Everything under it is same-origin.
 */
const OCR_ASSET_BASE = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/ocr`;

export class OcrCancelledError extends Error {
  constructor() {
    super('OCR cancelled');
    this.name = 'OcrCancelledError';
  }
}

export interface OcrProgress {
  /** 'engine' covers the one-time runtime/model load, which has no page count. */
  stage: 'engine' | 'page' | 'saving';
  current: number;
  total: number;
  /** 0-1 while the engine is loading. */
  engineProgress: number;
}

export interface OcrPageText {
  pageNumber: number;
  text: string;
  words: number;
  /** Mean word confidence, 0-100. */
  confidence: number;
}

export interface OcrResult {
  blob: Blob;
  pages: OcrPageText[];
  pageCount: number;
  ocrPageNumbers: number[];
  wordCount: number;
  /** Mean confidence across every recognised word, 0-100. */
  confidence: number;
}

export interface OcrOptions {
  pageNumbers: number[];
  signal?: AbortSignal;
  onProgress?: (progress: OcrProgress) => void;
}

/**
 * Pages worth running OCR on: no selectable text of their own, and something
 * raster on them to read. Pages that already carry text are left alone -- they
 * are searchable already -- and vector-only pages are skipped because there is
 * nothing there OCR could read that the PDF does not already say.
 */
export const ocrEligiblePages = (analysis: DocumentAnalysis): number[] =>
  analysis.pages.filter((page) => !page.hasMeaningfulText && page.imageDraws >= 1).map((page) => page.pageNumber);

/** Parses "1-3, 7" into page numbers, clamped to the document and de-duplicated. */
export const parsePageRange = (input: string, pageCount: number): number[] => {
  const selected = new Set<number>();

  for (const part of input.split(',')) {
    const chunk = part.trim();
    if (!chunk) continue;

    const range = chunk.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      if (!from || !to) return [];
      for (let page = Math.min(from, to); page <= Math.max(from, to); page += 1) {
        if (page >= 1 && page <= pageCount) selected.add(page);
      }
      continue;
    }

    if (!/^\d+$/.test(chunk)) return [];
    const page = Number(chunk);
    if (page >= 1 && page <= pageCount) selected.add(page);
  }

  return [...selected].sort((a, b) => a - b);
};

interface RenderedPage {
  blob: Blob;
  /** Converts rendered-image pixels to PDF user space. */
  toPdfPoint: (x: number, y: number) => [number, number];
}

/**
 * Renders one page for OCR and frees the canvas immediately afterwards, so a
 * long document never holds more than one page bitmap at a time.
 */
const renderPageForOcr = async (pdf: PDFDocumentProxy, pageNumber: number): Promise<RenderedPage | null> => {
  const page = await pdf.getPage(pageNumber);
  const basis = page.getViewport({ scale: 1 });
  let scale = OCR_DPI / POINTS_PER_INCH;

  const pixels = basis.width * scale * basis.height * scale;
  if (pixels > MAX_PAGE_PIXELS) scale *= Math.sqrt(MAX_PAGE_PIXELS / pixels);

  // The viewport already applies the page's /Rotate, so the canvas holds the
  // page the way a reader sees it -- which is the orientation OCR needs.
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

  // Transparent regions would otherwise reach the engine as black.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);

  try {
    // 'print' intent keeps rendering off requestAnimationFrame, which a
    // background tab throttles to a standstill.
    await page.render({ canvasContext: context, viewport, canvas, intent: 'print' }).promise;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return null;

    return {
      blob,
      toPdfPoint: (x, y) => {
        const [px, py] = viewport.convertToPdfPoint(x, y);
        return [px, py];
      },
    };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
    page.cleanup();
  }
};

type TesseractWorker = Awaited<ReturnType<typeof createWorker>>;

const createOcrWorker = (onEngineProgress: (progress: number) => void): Promise<TesseractWorker> =>
  // The default OEM is LSTM-only, which is what the shipped model supports.
  createWorker('eng', undefined, {
    workerPath: `${OCR_ASSET_BASE}/worker.min.js`,
    corePath: OCR_ASSET_BASE,
    langPath: OCR_ASSET_BASE,
    logger: (message) => {
      if (typeof message.progress === 'number') onEngineProgress(message.progress);
    },
  });

/** Flattens Tesseract's block/paragraph/line/word tree into placeable words. */
const collectWords = (blocks: NonNullable<Awaited<ReturnType<TesseractWorker['recognize']>>['data']['blocks']>) => {
  const words: RecognizedWord[] = [];

  for (const block of blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        const lineHeight = Math.max(1, line.bbox.y1 - line.bbox.y0);
        const baseline = line.baseline;
        const span = baseline ? baseline.x1 - baseline.x0 : 0;

        // Tesseract reports the baseline as a segment across the line. Where it
        // is missing or implausible, sit the text just above the box's bottom
        // edge instead -- descenders make that a close enough approximation.
        const baselineAt = (x: number): number => {
          const fallback = line.bbox.y1 - lineHeight * 0.15;
          if (!baseline?.has_baseline || span === 0) return fallback;
          const y = baseline.y0 + ((x - baseline.x0) / span) * (baseline.y1 - baseline.y0);
          if (!Number.isFinite(y)) return fallback;
          if (y < line.bbox.y0 - lineHeight || y > line.bbox.y1 + lineHeight) return fallback;
          return y;
        };

        for (const word of line.words ?? []) {
          if (!word.text?.trim()) continue;
          words.push({
            text: word.text,
            bbox: word.bbox,
            baselineY: baselineAt(word.bbox.x0),
            lineHeight,
            confidence: word.confidence,
          });
        }
      }
    }
  }

  return words;
};

/**
 * Runs OCR over the chosen pages and returns both a searchable copy of the PDF
 * and the recognised text, from a single pass. Pages are processed one at a
 * time; every page not in `pageNumbers` is left byte-for-byte alone.
 */
export const ocrPdf = async (file: File, { pageNumbers, signal, onProgress }: OcrOptions): Promise<OcrResult> => {
  const targets = [...new Set(pageNumbers)].sort((a, b) => a - b);
  if (targets.length === 0) throw new Error('No pages selected for OCR');

  const bytes = await file.arrayBuffer();
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const pageCount = doc.getPageCount();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const throwIfCancelled = () => {
    if (signal?.aborted) throw new OcrCancelledError();
  };
  throwIfCancelled();

  let engineProgress = 0;
  const report = (stage: OcrProgress['stage'], current: number) =>
    onProgress?.({ stage, current, total: targets.length, engineProgress });

  report('engine', 0);
  let worker: TesseractWorker | null = null;

  // Terminating the worker is the only way to interrupt a recognition already
  // running inside it, and a terminated worker never settles the job it was
  // running -- so cancellation is raced against the job rather than waited for
  // through it, or a cancel mid-page would hang forever.
  let cancel: () => void = () => undefined;
  const cancelled = new Promise<never>((_, reject) => {
    cancel = () => {
      worker?.terminate().catch(() => undefined);
      reject(new OcrCancelledError());
    };
  });
  cancelled.catch(() => undefined);
  if (signal?.aborted) cancel();
  signal?.addEventListener('abort', cancel, { once: true });

  // pdf.js transfers the buffer it is handed, so it gets its own copy.
  let pdf: PDFDocumentProxy | null = null;
  const pages: OcrPageText[] = [];
  let wordCount = 0;
  let confidenceTotal = 0;

  try {
    // The logger keeps reporting throughout recognition, but only the load
    // phase is worth showing: after this it is per-page progress that matters.
    let loadingEngine = true;
    worker = await Promise.race([
      createOcrWorker((progress) => {
        if (!loadingEngine) return;
        engineProgress = progress;
        report('engine', 0);
      }),
      cancelled,
    ]);
    loadingEngine = false;
    throwIfCancelled();

    // The render DPI is known, so telling the engine removes its guess.
    await worker.setParameters({ user_defined_dpi: String(OCR_DPI) });

    pdf = await pdfjsLib.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;

    for (let index = 0; index < targets.length; index += 1) {
      throwIfCancelled();
      const pageNumber = targets[index];
      report('page', index + 1);

      const rendered = await Promise.race([renderPageForOcr(pdf, pageNumber), cancelled]);
      throwIfCancelled();
      if (!rendered) continue;

      const recognized = await Promise.race([
        worker.recognize(rendered.blob, {}, { text: true, blocks: true }),
        cancelled,
      ]);
      throwIfCancelled();

      const words = collectWords(recognized.data.blocks);
      const page = doc.getPage(pageNumber - 1);
      const fontKey = page.node.newFontDictionary(font.name, font.ref);
      const placed = drawInvisibleText(page, font, fontKey, words, rendered.toPdfPoint);

      const kept = words.filter((word) => word.confidence >= MIN_WORD_CONFIDENCE);
      const pageConfidence = kept.reduce((total, word) => total + word.confidence, 0);
      wordCount += kept.length;
      confidenceTotal += pageConfidence;

      pages.push({
        pageNumber,
        text: (recognized.data.text ?? '').replace(/\s+$/, ''),
        words: placed,
        confidence: kept.length > 0 ? pageConfidence / kept.length : 0,
      });

      await yieldToBrowser();
    }

    throwIfCancelled();
    report('saving', targets.length);
    const saved = await doc.save({ useObjectStreams: true });

    if (doc.getPageCount() !== pageCount) throw new Error('Page count changed during OCR');

    return {
      blob: pdfBlob(saved),
      pages,
      pageCount,
      ocrPageNumbers: pages.map((page) => page.pageNumber),
      wordCount,
      confidence: wordCount > 0 ? confidenceTotal / wordCount : 0,
    };
  } finally {
    signal?.removeEventListener('abort', cancel);
    await worker?.terminate().catch(() => undefined);
    await pdf?.destroy().catch(() => undefined);
  }
};

/** The recognised text of every OCR'd page, in page order. */
export const ocrTextFile = (pages: OcrPageText[]): Blob => {
  const body = pages
    .map((page) => `--- Page ${page.pageNumber} ---\n${page.text.trim()}`)
    .join('\n\n');
  return new Blob([`${body}\n`], { type: 'text/plain;charset=utf-8' });
};
