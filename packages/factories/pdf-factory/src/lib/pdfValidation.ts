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

export type EncryptedRejection = 'not-pdf' | 'empty' | 'too-large' | 'unreadable' | 'not-encrypted';

export interface EncryptedValidation {
  file: File | null;
  reason: EncryptedRejection | null;
  message: string | null;
}

/**
 * Validation for the one tool whose input is *meant* to be encrypted.
 *
 * The normal validator opens the document to count its pages, which is exactly
 * what an encrypted file will not allow without its password -- so this one
 * checks the envelope only, and leaves everything inside to the unlock itself.
 * It shares the same size and format limits; it does not relax them, and no
 * other tool uses it.
 */
export const validateEncryptedPDFFile = async (
  file: File,
  isEncrypted: (file: File) => Promise<boolean>,
): Promise<EncryptedValidation> => {
  const reject = (reason: EncryptedRejection, message: string): EncryptedValidation => ({
    file: null,
    reason,
    message,
  });

  if (!file.name.toLowerCase().endsWith('.pdf')) return reject('not-pdf', `${file.name}: not a PDF file.`);
  if (file.size === 0) return reject('empty', `${file.name}: file is empty.`);
  if (file.size > PDF_LIMITS.MAX_FILE_SIZE_BYTES) {
    return reject('too-large', `${file.name}: exceeds the 50MB limit (${formatBytes(file.size)}).`);
  }
  if (!(await readsAsPdfHeader(file))) return reject('not-pdf', `${file.name}: not a valid PDF file.`);

  try {
    if (!(await isEncrypted(file))) {
      return reject('not-encrypted', 'This PDF is not password protected, so there is nothing to remove.');
    }
  } catch {
    return reject('unreadable', `${file.name}: corrupt or unreadable PDF.`);
  }

  return { file, reason: null, message: null };
};

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
