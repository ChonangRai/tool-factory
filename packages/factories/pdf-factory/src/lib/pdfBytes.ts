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
