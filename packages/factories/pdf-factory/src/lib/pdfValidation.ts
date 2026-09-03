import { PDFDocument } from 'pdf-lib';

// Conservative caps to keep client-side canvas rendering and pdf-lib
// merges from hanging the tab on large/many uploads.
export const PDF_LIMITS = {
  MAX_FILE_SIZE_BYTES: 50 * 1024 * 1024,
  MAX_FILES: 30,
  MAX_TOTAL_PAGES: 300,
} as const;

export interface ValidatedFile {
  file: File;
  pageCount: number;
}

export interface ValidationResult {
  valid: ValidatedFile[];
  errors: string[];
}

const readsAsPdfHeader = async (file: File): Promise<boolean> => {
  const headerBytes = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  const header = String.fromCharCode(...headerBytes);
  return header === '%PDF-';
};

export const formatBytes = (bytes: number): string => `${(bytes / (1024 * 1024)).toFixed(1)}MB`;

export const validatePDFFiles = async (
  files: File[],
  existingFileCount: number,
  existingPageCount: number
): Promise<ValidationResult> => {
  const errors: string[] = [];
  const valid: ValidatedFile[] = [];
  let fileCount = existingFileCount;
  let pageCount = existingPageCount;

  for (const file of files) {
    if (fileCount >= PDF_LIMITS.MAX_FILES) {
      errors.push(`${file.name}: skipped — workspace limit of ${PDF_LIMITS.MAX_FILES} files reached.`);
      continue;
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      errors.push(`${file.name}: not a PDF file.`);
      continue;
    }

    if (file.size === 0) {
      errors.push(`${file.name}: file is empty.`);
      continue;
    }

    if (file.size > PDF_LIMITS.MAX_FILE_SIZE_BYTES) {
      errors.push(`${file.name}: exceeds the 50MB limit (${formatBytes(file.size)}).`);
      continue;
    }

    if (!(await readsAsPdfHeader(file))) {
      errors.push(`${file.name}: not a valid PDF file.`);
      continue;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
      const numPages = pdf.getPageCount();

      if (numPages === 0) {
        errors.push(`${file.name}: PDF has no pages.`);
        continue;
      }

      if (pageCount + numPages > PDF_LIMITS.MAX_TOTAL_PAGES) {
        errors.push(`${file.name}: skipped — would exceed the ${PDF_LIMITS.MAX_TOTAL_PAGES}-page workspace limit.`);
        continue;
      }

      fileCount += 1;
      pageCount += numPages;
      valid.push({ file, pageCount: numPages });
    } catch {
      errors.push(`${file.name}: corrupt or unreadable PDF.`);
    }
  }

  return { valid, errors };
};
