import {
  beginText,
  endText,
  popGraphicsState,
  pushGraphicsState,
  setFontAndSize,
  setTextMatrix,
  setTextRenderingMode,
  showText,
  TextRenderingMode,
  type PDFFont,
  type PDFName,
  type PDFOperator,
  type PDFPage,
} from 'pdf-lib';

/**
 * Writes recognised words onto a page as invisible text (rendering mode 3).
 *
 * The page's own content stream is never touched: pdf-lib appends a second
 * content stream, so the scan keeps rendering exactly as it did, and the only
 * thing that changes is that a viewer can now find and select the words.
 *
 * Everything here works in "image pixels" -- the coordinate space of the
 * canvas the page was rendered to for OCR -- and converts to PDF user space
 * through `toPdfPoint`, which is the inverse of the exact pdf.js viewport
 * transform that produced that canvas. That is what makes /Rotate 90/180/270
 * and landscape pages come out right without any special-casing: the text is
 * placed along the same axes the reader sees, because it is placed by
 * inverting the transform that drew what the reader sees.
 */

/** One recognised word, in the pixel space of the rendered page image. */
export interface RecognizedWord {
  text: string;
  /** Word box, top-left origin, y growing downwards. */
  bbox: { x0: number; y0: number; x1: number; y1: number };
  /** Text baseline at the word's left edge. */
  baselineY: number;
  /** Height of the line the word belongs to, used to size the glyphs. */
  lineHeight: number;
  confidence: number;
}

/** Converts a point in rendered-image pixels to PDF user space. */
export type ToPdfPoint = (x: number, y: number) => [number, number];

/**
 * Words below this are usually noise in the margins rather than text. Keeping
 * them would pollute copy/paste and the TXT export for no search benefit.
 */
export const MIN_WORD_CONFIDENCE = 30;

/** Guards against a degenerate box producing an absurd text matrix. */
const MIN_FONT_SIZE = 0.5;
const MAX_FONT_SIZE = 400;
const MIN_H_SCALE = 0.01;
const MAX_H_SCALE = 100;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Standard-font text is WinAnsi encoded, so anything outside it cannot be
 * written with Helvetica. OCR of English pages produces such characters only
 * rarely -- typographic punctuation, or noise misread as an exotic glyph --
 * so the common ones are folded to their ASCII equivalent and the rest are
 * dropped rather than failing the page.
 */
const FOLDED: Record<string, string> = {
  '‘': "'",
  '’': "'",
  '‚': "'",
  '‛': "'",
  '′': "'",
  '“': '"',
  '”': '"',
  '„': '"',
  '″': '"',
  '‐': '-',
  '‑': '-',
  '‒': '-',
  '–': '-',
  '—': '-',
  '―': '-',
  '−': '-',
  '…': '...',
  '•': '*',
  ' ': ' ',
  '​': '',
  'ﬁ': 'fi',
  'ﬂ': 'fl',
};

const isWinAnsi = (code: number) =>
  (code >= 0x20 && code <= 0x7e) || code === 0xa0 || (code >= 0xa1 && code <= 0xff);

export const toWinAnsi = (text: string): string => {
  let out = '';
  for (const char of text) {
    const folded = FOLDED[char];
    if (folded !== undefined) {
      out += folded;
      continue;
    }
    const code = char.codePointAt(0) ?? 0;
    if (isWinAnsi(code)) out += char;
  }
  return out.trim();
};

/**
 * Appends the invisible text for one page. Returns how many words were placed.
 *
 * Sizing is deliberately geometric rather than typographic: the glyph run is
 * horizontally scaled so it spans exactly the width Tesseract measured, and
 * sized from the line height. Since nothing is painted, matching the box is
 * what matters -- it is what makes a selection drag over the scan highlight
 * the words underneath it.
 */
export const drawInvisibleText = (
  page: PDFPage,
  font: PDFFont,
  fontKey: PDFName,
  words: RecognizedWord[],
  toPdfPoint: ToPdfPoint,
): number => {
  const operators: PDFOperator[] = [];
  let placed = 0;

  for (const word of words) {
    if (word.confidence < MIN_WORD_CONFIDENCE) continue;

    const text = toWinAnsi(word.text);
    if (!text) continue;

    const widthPx = word.bbox.x1 - word.bbox.x0;
    if (widthPx <= 0) continue;

    // The direction one pixel to the right of the word's start, in user space.
    // Its length is the size of one image pixel in PDF points, and its angle is
    // the direction the text runs after the page's /Rotate is applied.
    const [originX, originY] = toPdfPoint(word.bbox.x0, word.baselineY);
    const [aheadX, aheadY] = toPdfPoint(word.bbox.x0 + 1, word.baselineY);
    const dx = aheadX - originX;
    const dy = aheadY - originY;
    const pointsPerPixel = Math.hypot(dx, dy);
    if (!Number.isFinite(pointsPerPixel) || pointsPerPixel <= 0) continue;

    const cos = dx / pointsPerPixel;
    const sin = dy / pointsPerPixel;

    const size = clamp(word.lineHeight * pointsPerPixel, MIN_FONT_SIZE, MAX_FONT_SIZE);
    const naturalWidth = font.widthOfTextAtSize(text, size);
    if (!(naturalWidth > 0)) continue;
    const hScale = clamp((widthPx * pointsPerPixel) / naturalWidth, MIN_H_SCALE, MAX_H_SCALE);

    let encoded;
    try {
      encoded = font.encodeText(text);
    } catch {
      // A character the sanitiser let through that the font still cannot map.
      continue;
    }

    // Row-vector convention: horizontal squeeze first, then the page rotation.
    operators.push(
      beginText(),
      setTextRenderingMode(TextRenderingMode.Invisible),
      setFontAndSize(fontKey, size),
      setTextMatrix(hScale * cos, hScale * sin, -sin, cos, originX, originY),
      showText(encoded),
      endText(),
    );
    placed += 1;
  }

  if (operators.length === 0) return 0;

  // The graphics state is saved and restored around the whole block so the
  // page's existing content cannot be affected by it in either direction.
  page.pushOperators(pushGraphicsState(), ...operators, popGraphicsState());
  return placed;
};
