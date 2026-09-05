import { PDFDocument, PDFDict, PDFName } from 'pdf-lib';
import pdfjsLib from '@/lib/pdfWorker';
import type { PDFDocumentProxy } from 'pdfjs-dist';

/**
 * Read-only inspection of a PDF, used to decide what kind of compression is
 * safe to offer. Every threshold here is deliberately conservative: when a
 * page is ambiguous we classify it as "keep as-is", because rasterising an
 * ordinary text page makes it both bigger and worse.
 */

/** Non-whitespace characters above which a page counts as having real text. */
const MEANINGFUL_TEXT_CHARS = 20;
/** A scan is one image covering essentially the whole page. */
const FULL_PAGE_IMAGE_COVERAGE = 0.8;
/** More drawn images than this looks like a designed page, not a scan. */
const MAX_IMAGE_DRAWS = 3;
/** Vector artwork on the page means rasterising would lose crisp edges. */
const MAX_VECTOR_PATHS = 12;

export type UnsupportedReason = 'encrypted' | 'xfa' | 'unreadable';

export interface PageAnalysis {
  pageNumber: number;
  /** Point dimensions with page rotation already applied. */
  widthPt: number;
  heightPt: number;
  textChars: number;
  imageDraws: number;
  vectorPaths: number;
  /** Largest single image's area as a fraction of the page. */
  imageCoverage: number;
  hasMeaningfulText: boolean;
  isScanLike: boolean;
}

export interface DocumentAnalysis {
  pageCount: number;
  originalBytes: number;
  avgKbPerPage: number;
  pages: PageAnalysis[];
  scanLikePageNumbers: number[];
  /** True when any page carries selectable text. */
  hasMeaningfulText: boolean;
  hasAcroFormFields: boolean;
  hasXfa: boolean;
  isEncrypted: boolean;
  /** Set when the document must not be processed at all. */
  unsupported: { reason: UnsupportedReason; message: string } | null;
  /** Structural optimisation rewrites the file, which drops XFA form data. */
  structureIsSafe: boolean;
  canCompressScans: boolean;
}

type Matrix = [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

/**
 * pdf.js draws every image into the unit square, so the determinant of the
 * transform in effect at that moment is the area the image covers in page
 * units. Tracking save/restore/transform is enough to recover it.
 */
const analyzePage = async (pdf: PDFDocumentProxy, pageNumber: number): Promise<PageAnalysis> => {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const pageArea = viewport.width * viewport.height;

  const textContent = await page.getTextContent();
  const textChars = textContent.items
    .map((item) => ('str' in item ? item.str : ''))
    .join('')
    .replace(/\s/g, '').length;

  // A page with real text is never a scan, so skip the operator-list walk --
  // it is by far the expensive half, and on a long text document it would
  // otherwise dominate the whole analysis.
  if (textChars >= MEANINGFUL_TEXT_CHARS) {
    page.cleanup();
    return {
      pageNumber,
      widthPt: viewport.width,
      heightPt: viewport.height,
      textChars,
      imageDraws: 0,
      vectorPaths: 0,
      imageCoverage: 0,
      hasMeaningfulText: true,
      isScanLike: false,
    };
  }

  const { OPS } = pdfjsLib;
  const operators = await page.getOperatorList();
  const stack: Matrix[] = [];
  let ctm: Matrix = [...IDENTITY];
  let imageDraws = 0;
  let vectorPaths = 0;
  let imageCoverage = 0;

  for (let i = 0; i < operators.fnArray.length; i++) {
    const fn = operators.fnArray[i];
    if (fn === OPS.save) {
      stack.push([...ctm]);
    } else if (fn === OPS.restore) {
      ctm = stack.pop() ?? [...IDENTITY];
    } else if (fn === OPS.transform) {
      ctm = multiply(ctm, operators.argsArray[i] as Matrix);
    } else if (fn === OPS.constructPath) {
      vectorPaths += 1;
    } else if (
      fn === OPS.paintImageXObject ||
      fn === OPS.paintInlineImageXObject ||
      fn === OPS.paintImageXObjectRepeat
    ) {
      imageDraws += 1;
      const area = Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2]);
      if (pageArea > 0) imageCoverage = Math.max(imageCoverage, area / pageArea);
    }
  }

  // Release the parsed page; a long document should not hold every page's
  // operator list in memory at once.
  page.cleanup();

  const hasMeaningfulText = textChars >= MEANINGFUL_TEXT_CHARS;
  const isScanLike =
    !hasMeaningfulText &&
    imageDraws >= 1 &&
    imageDraws <= MAX_IMAGE_DRAWS &&
    vectorPaths <= MAX_VECTOR_PATHS &&
    imageCoverage >= FULL_PAGE_IMAGE_COVERAGE;

  return {
    pageNumber,
    widthPt: viewport.width,
    heightPt: viewport.height,
    textChars,
    imageDraws,
    vectorPaths,
    imageCoverage,
    hasMeaningfulText,
    isScanLike,
  };
};

/** Reads AcroForm/XFA straight off the catalog; absent keys are not an error. */
const readFormInfo = (doc: PDFDocument) => {
  try {
    const acroForm = doc.catalog.lookup(PDFName.of('AcroForm'));
    if (!(acroForm instanceof PDFDict)) return { hasAcroFormFields: false, hasXfa: false };

    // Order matters: getForm() makes pdf-lib drop the XFA entry, so read it
    // first or a dynamic form would look like an ordinary AcroForm.
    const hasXfa = acroForm.lookup(PDFName.of('XFA')) !== undefined;
    const hasAcroFormFields = doc.getForm().getFields().length > 0;
    return { hasAcroFormFields, hasXfa };
  } catch {
    // A form we cannot read is a form we must not rewrite.
    return { hasAcroFormFields: true, hasXfa: false };
  }
};

export const analyzePDF = async (file: File): Promise<DocumentAnalysis> => {
  const originalBytes = file.size;
  const bytes = await file.arrayBuffer();

  // A damaged file can survive load() and then throw on the first real read,
  // so the whole header inspection sits inside one guard.
  let doc: PDFDocument;
  let pageCount: number;
  let isEncrypted: boolean;
  let formInfo: { hasAcroFormFields: boolean; hasXfa: boolean };
  try {
    doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    pageCount = doc.getPageCount();
    isEncrypted = doc.isEncrypted;
    formInfo = readFormInfo(doc);
  } catch {
    return {
      pageCount: 0,
      originalBytes,
      avgKbPerPage: 0,
      pages: [],
      scanLikePageNumbers: [],
      hasMeaningfulText: false,
      hasAcroFormFields: false,
      hasXfa: false,
      isEncrypted: false,
      unsupported: { reason: 'unreadable', message: 'This PDF could not be read.' },
      structureIsSafe: false,
      canCompressScans: false,
    };
  }

  const { hasAcroFormFields, hasXfa } = formInfo;

  const base = {
    pageCount,
    originalBytes,
    avgKbPerPage: pageCount > 0 ? originalBytes / 1024 / pageCount : 0,
    hasAcroFormFields,
    hasXfa,
    isEncrypted,
  };

  if (isEncrypted) {
    return {
      ...base,
      pages: [],
      scanLikePageNumbers: [],
      hasMeaningfulText: false,
      unsupported: {
        reason: 'encrypted',
        message: 'This PDF is password protected, so it cannot be compressed here.',
      },
      structureIsSafe: false,
      canCompressScans: false,
    };
  }

  if (hasXfa) {
    return {
      ...base,
      pages: [],
      scanLikePageNumbers: [],
      hasMeaningfulText: false,
      unsupported: {
        reason: 'xfa',
        message: 'This is an interactive form. Rewriting it would break the form, so it is left untouched.',
      },
      structureIsSafe: false,
      canCompressScans: false,
    };
  }

  // pdf.js gets its own copy of the bytes: it transfers the buffer it is given.
  const pages: PageAnalysis[] = [];
  try {
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
    try {
      for (let i = 1; i <= pdf.numPages; i++) {
        pages.push(await analyzePage(pdf, i));
      }
    } finally {
      await pdf.destroy();
    }
  } catch {
    return {
      ...base,
      pages: [],
      scanLikePageNumbers: [],
      hasMeaningfulText: false,
      unsupported: { reason: 'unreadable', message: 'This PDF could not be read.' },
      structureIsSafe: false,
      canCompressScans: false,
    };
  }

  const scanLikePageNumbers = pages.filter((p) => p.isScanLike).map((p) => p.pageNumber);

  return {
    ...base,
    pages,
    scanLikePageNumbers,
    hasMeaningfulText: pages.some((p) => p.hasMeaningfulText),
    unsupported: null,
    // AcroForm field values survive a pdf-lib resave, but we still keep the
    // original whenever the rewrite does not actually pay for itself.
    structureIsSafe: true,
    canCompressScans: scanLikePageNumbers.length > 0,
  };
};
