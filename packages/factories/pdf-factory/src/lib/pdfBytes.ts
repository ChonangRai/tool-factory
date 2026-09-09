/**
 * pdf-lib's `save()` is typed as `Uint8Array<ArrayBufferLike>`, but `Blob` and
 * `File` only accept views backed by a real `ArrayBuffer`. In practice pdf-lib
 * always returns an ArrayBuffer-backed array, so the normal path re-wraps the
 * same memory with no copy. The `SharedArrayBuffer` branch the type permits is
 * handled by copying rather than by asserting the type away.
 */
const asBlobPart = (bytes: Uint8Array): BlobPart => {
  const { buffer, byteOffset, byteLength } = bytes;
  return buffer instanceof ArrayBuffer
    ? new Uint8Array(buffer, byteOffset, byteLength)
    : new Uint8Array(bytes);
};

export const pdfBlob = (bytes: Uint8Array): Blob =>
  new Blob([asBlobPart(bytes)], { type: 'application/pdf' });

export const pdfFile = (bytes: Uint8Array, name: string): File =>
  new File([asBlobPart(bytes)], name, { type: 'application/pdf' });

/**
 * Names an existing blob so it can be downloaded and handed to another tool as
 * one value. The blob's data is referenced, not copied, so this is cheap even
 * for a 50MB result.
 */
export const pdfFileFrom = (blob: Blob, name: string): File =>
  blob instanceof File && blob.name === name ? blob : new File([blob], name, { type: 'application/pdf' });
