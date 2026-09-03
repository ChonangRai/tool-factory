import { PDF_LIMITS } from './pdfValidation';

export type ImageKind = 'png' | 'jpeg';

export interface ValidatedImage {
  file: File;
  kind: ImageKind;
  width: number;
  height: number;
}

export interface ImageValidationResult {
  valid: ValidatedImage[];
  errors: string[];
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];

const detectImageKind = async (file: File): Promise<ImageKind | null> => {
  const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (JPEG_SIGNATURE.every((b, i) => header[i] === b)) return 'jpeg';
  if (PNG_SIGNATURE.every((b, i) => header[i] === b)) return 'png';
  return null;
};

const readDimensions = async (file: File): Promise<{ width: number; height: number } | null> => {
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    bitmap.close();
    return { width, height };
  } catch {
    return null;
  }
};

export const validateImageFiles = async (
  files: File[],
  existingCount: number
): Promise<ImageValidationResult> => {
  const errors: string[] = [];
  const valid: ValidatedImage[] = [];
  let count = existingCount;

  for (const file of files) {
    if (count >= PDF_LIMITS.MAX_FILES) {
      errors.push(`${file.name}: skipped — workspace limit of ${PDF_LIMITS.MAX_FILES} images reached.`);
      continue;
    }

    if (file.size === 0) {
      errors.push(`${file.name}: file is empty.`);
      continue;
    }

    if (file.size > PDF_LIMITS.MAX_FILE_SIZE_BYTES) {
      errors.push(`${file.name}: exceeds the 50MB limit.`);
      continue;
    }

    const kind = await detectImageKind(file);
    if (!kind) {
      errors.push(`${file.name}: not a valid JPEG or PNG file.`);
      continue;
    }

    const dimensions = await readDimensions(file);
    if (!dimensions) {
      errors.push(`${file.name}: corrupt or unreadable image.`);
      continue;
    }

    count += 1;
    valid.push({ file, kind, ...dimensions });
  }

  return { valid, errors };
};
