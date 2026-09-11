import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';

/** A rectangle in ratio coordinates (0-1) relative to the page. */
export interface RatioRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The editor draws two kinds of annotation. Both carry a position in ratio
 * coordinates; only boxes carry a size, which is why the size and style fields
 * are optional rather than split across two interfaces -- the drawing and
 * export code reads them uniformly.
 */
export interface Annotation extends Partial<RatioRect> {
  type: 'text' | 'rect';
  x: number;
  y: number;
  color: string;
  opacity?: number;
  borderColor?: string;
  borderWidth?: number;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
}

export const hexToRgbTuple = (hex: string): [number, number, number] => {
  // Basic hex parsing, supporting #RGB and #RRGGBB
  let h = hex.replace('#', '');
  if (h.length === 3) h = [...h].map(x => x + x).join('');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return [r, g, b];
};

export const getCssFontFamily = (family: string) => {
  if (family === 'Times-Roman') return '"Times New Roman", Times, serif';
  if (family === 'Courier') return '"Courier New", Courier, monospace';
  return 'Helvetica, Arial, sans-serif';
};

/**
 * Paints annotations onto pages of one output document.
 *
 * The fonts are embedded on first use rather than up front, so an export with
 * no annotations produces the same bytes it did before annotations existed --
 * nothing is added to the document just because the painter was created.
 */
export const createAnnotationPainter = (doc: PDFDocument) => {
  let fonts: Record<string, PDFFont> | null = null;

  const ensureFonts = async () => {
    if (!fonts) {
      fonts = {
        Helvetica: await doc.embedFont(StandardFonts.Helvetica),
        'Times-Roman': await doc.embedFont(StandardFonts.TimesRoman),
        Courier: await doc.embedFont(StandardFonts.Courier),
      };
    }
    return fonts;
  };

  return async (page: PDFPage, annotations: Annotation[]): Promise<void> => {
    if (annotations.length === 0) return;

    const embedded = await ensureFonts();
    const { width, height } = page.getSize();

    for (const ann of annotations) {
      const pdfX = ann.x * width;
      const pdfY_Top = ann.y * height;

      if (ann.type === 'rect') {
        const w = (ann.width ?? 0) * width;
        const h = (ann.height ?? 0) * height;
        const borderWidth = ann.borderWidth ?? 0;
        const [r, g, b] = hexToRgbTuple(ann.color || '#ff0000');

        page.drawRectangle({
          x: pdfX,
          y: height - pdfY_Top - h,
          width: w,
          height: h,
          borderColor: borderWidth > 0 ? rgb(r, g, b) : undefined,
          color: rgb(r, g, b),
          borderWidth: borderWidth * 0.5, // Scale down border for PDF visually
          opacity: ann.opacity ?? 0.25,
        });
      } else if (ann.type === 'text') {
        const size = ann.fontSize || 20;
        const [r, g, b] = hexToRgbTuple(ann.color || '#ff0000');

        page.drawText(ann.text ?? '', {
          x: pdfX,
          y: height - pdfY_Top - size * 0.8, // Adjust baseline visually
          size,
          font: embedded[ann.fontFamily ?? 'Helvetica'] ?? embedded.Helvetica,
          color: rgb(r, g, b),
        });
      }
    }
  };
};
