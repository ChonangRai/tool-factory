import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { pdfBlob } from '@/lib/pdfBytes';

/**
 * Removes the password from a PDF the user can already open.
 *
 * This is decryption with the key the user supplies, not password recovery:
 * without the right password nothing here can read the file, and no attempt is
 * made to find one.
 *
 * The decryption itself comes from @cantoo/pdf-lib -- the same dependency
 * Protect uses, imported dynamically so its crypto code stays out of every
 * bundle but this route's. Loading with a password reparses the document
 * through a cipher, and the library then drops the encryption dictionary, so a
 * plain save writes the same document back out with nothing to unlock. The
 * page content itself is never touched or re-rendered.
 */

export type UnlockFailure =
  | 'not-encrypted'
  | 'missing-password'
  | 'wrong-password'
  | 'unsupported'
  | 'unreadable';

export class UnlockError extends Error {
  readonly reason: UnlockFailure;

  constructor(reason: UnlockFailure, message: string) {
    super(message);
    this.name = 'UnlockError';
    this.reason = reason;
  }
}

export interface UnlockResult {
  blob: Blob;
  pageCount: number;
  originalBytes: number;
  resultBytes: number;
}

/**
 * `document-protected.pdf` becomes `document-unlocked.pdf` rather than
 * `document-protected-unlocked.pdf`, and unlocking twice does not stack.
 */
export const unlockedFileName = (name: string): string => {
  const base = name.replace(/\.pdf$/i, '').replace(/-(protected|unlocked)$/i, '');
  return `${base}-unlocked.pdf`;
};

/**
 * Cheap check for whether a file is encrypted at all, used before the crypto
 * chunk is fetched. `/Encrypt` appears in the trailer or the cross-reference
 * stream's dictionary, both of which sit near the end of the file and are
 * never themselves encrypted; the whole buffer is searched as a fallback for
 * unusual writers. Authoritative confirmation happens during the unlock, where
 * the parser reports whether a cipher was actually engaged.
 */
const ENCRYPT_MARKER = '/Encrypt';

const containsMarker = (bytes: Uint8Array): boolean => {
  const marker = ENCRYPT_MARKER;
  const first = marker.charCodeAt(0);
  outer: for (let i = 0; i <= bytes.length - marker.length; i += 1) {
    if (bytes[i] !== first) continue;
    for (let j = 1; j < marker.length; j += 1) {
      if (bytes[i + j] !== marker.charCodeAt(j)) continue outer;
    }
    return true;
  }
  return false;
};

/** Tail first: the trailer is at the end, so a 50MB scan is rarely needed. */
export const looksEncrypted = async (file: File): Promise<boolean> => {
  const tailStart = Math.max(0, file.size - 256 * 1024);
  const tail = new Uint8Array(await file.slice(tailStart).arrayBuffer());
  if (containsMarker(tail)) return true;
  if (tailStart === 0) return false;
  return containsMarker(new Uint8Array(await file.arrayBuffer()));
};

/** Maps the crypto layer's messages onto something a person can act on. */
const failureFor = (error: unknown): UnlockError => {
  const message = error instanceof Error ? error.message : String(error);

  if (/NEEDS PASSWORD/i.test(message)) {
    return new UnlockError('missing-password', 'This PDF needs its password before it can be opened.');
  }
  if (/password incorrect/i.test(message)) {
    return new UnlockError('wrong-password', 'That password did not open this PDF. Check it and try again.');
  }
  if (/unsupported encryption|unknown encryption|unknown crypto|invalid key length|invalid crypt filter/i.test(message)) {
    return new UnlockError(
      'unsupported',
      'This PDF uses an encryption method that cannot be removed here.',
    );
  }
  return new UnlockError('unreadable', 'This PDF could not be read.');
};

/**
 * An encryption dictionary is the only object in a PDF that says
 * `/Filter /Standard` alongside the `/O` and `/U` password verifiers.
 */
const isEncryptionDictionary = (dict: PDFDict): boolean =>
  dict.lookup(PDFName.of('Filter')) === PDFName.of('Standard') &&
  dict.has(PDFName.of('O')) &&
  dict.has(PDFName.of('U'));

/** Confirms nothing in the saved file still asks for the original password. */
const hasEncryptionObjects = (doc: PDFDocument): boolean => {
  if (doc.isEncrypted) return true;
  return doc.context
    .enumerateIndirectObjects()
    .some(([, object]) => object instanceof PDFDict && isEncryptionDictionary(object));
};

export const unlockPdf = async (file: File, password: string): Promise<UnlockResult> => {
  if (password.length === 0) {
    throw new UnlockError('missing-password', 'Enter the password for this PDF.');
  }

  const bytes = await file.arrayBuffer();
  // The fork's own classes are needed for the object walk below: an object
  // parsed by @cantoo is not an instance of plain pdf-lib's PDFDict, and the
  // two packages intern their PDFNames separately.
  const {
    PDFDocument: CantooPDFDocument,
    EncryptedPDFError,
    PDFDict: CantooDict,
    PDFInvalidObject: CantooInvalidObject,
    PDFName: CantooName,
    PDFStream: CantooStream,
  } = await import('@cantoo/pdf-lib');

  let doc: Awaited<ReturnType<typeof CantooPDFDocument.load>>;
  try {
    // preserveXFA keeps dynamic form data that the default load path drops;
    // updateMetadata false leaves the document's own Info dictionary alone.
    doc = await CantooPDFDocument.load(bytes, { password, preserveXFA: true, updateMetadata: false });
  } catch (error) {
    if (error instanceof EncryptedPDFError) {
      throw new UnlockError('wrong-password', 'That password did not open this PDF. Check it and try again.');
    }
    throw failureFor(error);
  }

  // The parser sets this only when a cipher key was actually derived, so it
  // separates "decrypted with the password given" from "was never encrypted".
  if (!doc.context.isDecrypted) {
    throw new UnlockError(
      'not-encrypted',
      'This PDF is not password protected, so there is nothing to remove.',
    );
  }
  if (doc.isEncrypted) {
    throw new UnlockError('unsupported', 'This PDF could not be decrypted with the password given.');
  }

  let saved: Uint8Array;
  let pageCount: number;
  try {
    pageCount = doc.getPageCount();

    // Detaching the encryption dictionary from the trailer is enough for a
    // reader to open the file, but the dictionary object itself survives, and
    // so does the original cross-reference stream that still names it -- which
    // would leave the old password's verifier hashes inside a file the user
    // was told is unlocked. Neither is referenced by the document (the writer
    // emits a fresh cross-reference section), so both go.
    //
    // The old cross-reference stream usually comes back as an invalid object,
    // because its own bytes were encrypted; those are matched on the raw
    // `/Encrypt` reference they carry rather than on a parsed dictionary.
    const standard = CantooName.of('Standard');
    const xref = CantooName.of('XRef');
    for (const [ref, object] of doc.context.enumerateIndirectObjects()) {
      if (object instanceof CantooInvalidObject) {
        const raw = new Uint8Array(object.sizeInBytes());
        object.copyBytesInto(raw, 0);
        if (containsMarker(raw)) doc.context.delete(ref);
        continue;
      }

      const dict =
        object instanceof CantooDict ? object : object instanceof CantooStream ? object.dict : null;
      if (!dict) continue;
      const isEncryptDict =
        dict.lookup(CantooName.of('Filter')) === standard &&
        dict.has(CantooName.of('O')) &&
        dict.has(CantooName.of('U'));
      if (isEncryptDict || dict.lookup(CantooName.of('Type')) === xref) {
        doc.context.delete(ref);
      }
    }

    saved = await doc.save();
  } catch {
    throw new UnlockError('unreadable', 'This PDF could not be rewritten without its password.');
  }

  // Prove the result really is open: reload it with the ordinary library and
  // check that nothing encryption-related survived and no page was lost.
  try {
    const check = await PDFDocument.load(saved, { ignoreEncryption: true, updateMetadata: false });
    if (hasEncryptionObjects(check)) throw new Error('encryption survived');
    if (check.getPageCount() !== pageCount) throw new Error('page count changed');
  } catch {
    throw new UnlockError('unsupported', 'The unlocked copy could not be verified, so it was not produced.');
  }

  return {
    blob: pdfBlob(saved),
    pageCount,
    originalBytes: file.size,
    resultBytes: saved.byteLength,
  };
};
