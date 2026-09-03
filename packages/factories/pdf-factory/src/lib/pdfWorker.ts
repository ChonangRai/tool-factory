import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

// Self-hosted worker bundled from the installed pdfjs-dist version, so it
// never drifts out of sync with the API build and never depends on a CDN.
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export default pdfjsLib;
