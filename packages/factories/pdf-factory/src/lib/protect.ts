/**
 * Password protection for PDFs, done entirely in the browser.
 *
 * The encryption itself comes from @cantoo/pdf-lib, which is imported
 * dynamically so neither it nor its crypto code lands in any bundle except
 * this route's. The rest of the app keeps using plain pdf-lib.
 */

/** Revision 6 hashes at most 127 UTF-8 bytes, silently dropping the rest. */
export const PASSWORD_MAX_BYTES = 127;
export const PASSWORD_MIN_LENGTH = 8;

const encoder = new TextEncoder();

/** Passwords are measured in UTF-8 bytes, not characters -- an emoji is four. */
export const passwordByteLength = (password: string): number => encoder.encode(password).length;

export type PasswordProblem = 'empty' | 'too-short' | 'too-long' | 'mismatch';

export interface PasswordCheck {
  problem: PasswordProblem | null;
  message: string | null;
}

export const checkPassword = (password: string, confirmation: string): PasswordCheck => {
  if (password.length === 0) {
    return { problem: 'empty', message: 'Enter a password.' };
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return {
      problem: 'too-short',
      message: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
    };
  }
  const bytes = passwordByteLength(password);
  if (bytes > PASSWORD_MAX_BYTES) {
    return {
      problem: 'too-long',
      message: `This password is ${bytes} bytes long. The PDF format allows ${PASSWORD_MAX_BYTES}, so please shorten it.`,
    };
  }
  if (password !== confirmation) {
    return { problem: 'mismatch', message: 'The two passwords do not match.' };
  }
  return { problem: null, message: null };
};

export type PasswordStrength = 'weak' | 'fair' | 'strong';

/**
 * Rough, honest guidance only -- length and variety, nothing more. It is not
 * a measure of how long the password would survive an attack, and the UI says
 * so rather than showing a score.
 */
export const passwordStrength = (password: string): PasswordStrength => {
  if (password.length < PASSWORD_MIN_LENGTH) return 'weak';
  const variety =
    Number(/[a-z]/.test(password)) +
    Number(/[A-Z]/.test(password)) +
    Number(/[0-9]/.test(password)) +
    Number(/[^A-Za-z0-9]/.test(password));
  if (password.length >= 16 && variety >= 2) return 'strong';
  if (password.length >= 12 || variety >= 3) return 'fair';
  return 'weak';
};

export type ProtectFailure = 'already-encrypted' | 'unreadable' | 'invalid-password';

export class ProtectError extends Error {
  readonly reason: ProtectFailure;

  constructor(reason: ProtectFailure, message: string) {
    super(message);
    this.name = 'ProtectError';
    this.reason = reason;
  }
}

export interface ProtectResult {
  blob: Blob;
  originalBytes: number;
  resultBytes: number;
  pageCount: number;
}

export const protectedFileName = (name: string): string =>
  `${name.replace(/\.pdf$/i, '')}-protected.pdf`;

/**
 * Encrypts a PDF with AES-256 (PDF 2.0 revision 6) under a single password.
 *
 * No ownerPassword is passed: at revision 6 the file encryption key is random
 * and wrapped separately under the user and owner entries, so letting the
 * library default the owner password to the user's costs nothing in strength
 * and leaves the user with exactly one credential. Generating a random owner
 * password and discarding it would instead lock owner access away forever for
 * no benefit, since v1 sets no permission restrictions.
 */
export const protectPDF = async (file: File, password: string): Promise<ProtectResult> => {
  if (password.length < PASSWORD_MIN_LENGTH || passwordByteLength(password) > PASSWORD_MAX_BYTES) {
    throw new ProtectError('invalid-password', 'This password cannot be used.');
  }

  const cantoo = await import('@cantoo/pdf-lib');
  const { PDFDocument, EncryptedPDFError } = cantoo;
  const bytes = await file.arrayBuffer();

  // PDFDocument's constructor is private, so infer the instance from load().
  let doc: Awaited<ReturnType<typeof cantoo.PDFDocument.load>>;
  try {
    // preserveXFA keeps dynamic form data that the default load path drops.
    doc = await PDFDocument.load(bytes, { preserveXFA: true });
  } catch (error) {
    if (error instanceof EncryptedPDFError) {
      throw new ProtectError(
        'already-encrypted',
        'This PDF is already password protected. Changing or removing an existing password is not supported yet.',
      );
    }
    throw new ProtectError('unreadable', 'This PDF could not be read.');
  }

  // A damaged file can survive load() and fail on the first real read, so the
  // rest of the pipeline is guarded too rather than throwing raw library errors.
  try {
    const pageCount = doc.getPageCount();
    doc.encrypt({ userPassword: password, algorithm: 'AES-256' });
    const encrypted = await doc.save();

    return {
      blob: new Blob([encrypted as BlobPart], { type: 'application/pdf' }),
      originalBytes: file.size,
      resultBytes: encrypted.byteLength,
      pageCount,
    };
  } catch {
    throw new ProtectError('unreadable', 'This PDF could not be protected.');
  }
};
