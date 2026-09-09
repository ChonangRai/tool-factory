import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const require = createRequire(import.meta.url);

/**
 * The OCR runtime: Tesseract's worker script, the two WebAssembly core builds
 * (SIMD and not), and the English model.
 *
 * These are served from this origin instead of the jsDelivr defaults, so a
 * scanned page is never the reason a request leaves the browser, and so the
 * tool keeps working offline once they are cached. They are copied rather than
 * imported as hashed assets because Tesseract picks the core build and the
 * model itself, by appending a filename to a directory it is given.
 */
const OCR_RUNTIME_FILES: Record<string, string> = {
  "worker.min.js": "tesseract.js/dist/worker.min.js",
  "tesseract-core-simd-lstm.wasm.js": "tesseract.js-core/tesseract-core-simd-lstm.wasm.js",
  "tesseract-core-lstm.wasm.js": "tesseract.js-core/tesseract-core-lstm.wasm.js",
  "eng.traineddata.gz": "@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz",
};

const ocrRuntimeAssets = (): Plugin => {
  const resolveSource = (specifier: string) => require.resolve(specifier);

  return {
    name: "ocr-runtime-assets",
    // Dev has no copy step, so the same files are served straight from disk.
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = req.url?.split("?")[0].replace(/^\/ocr\//, "");
        if (!req.url?.startsWith("/ocr/") || !name || !(name in OCR_RUNTIME_FILES)) return next();

        res.setHeader(
          "Content-Type",
          name.endsWith(".js") ? "application/javascript" : "application/octet-stream",
        );
        fs.createReadStream(resolveSource(OCR_RUNTIME_FILES[name])).pipe(res);
      });
    },
    generateBundle() {
      for (const [name, specifier] of Object.entries(OCR_RUNTIME_FILES)) {
        this.emitFile({
          type: "asset",
          fileName: `ocr/${name}`,
          source: fs.readFileSync(resolveSource(specifier)),
        });
      }
    },
  };
};

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8082,
  },
  plugins: [react(), ocrRuntimeAssets()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split the two largest vendor libraries out of the app chunk. This
        // changes no loading boundary -- the same code still loads on first
        // paint -- but app edits stop invalidating half a megabyte of cached
        // vendor code. @cantoo/pdf-lib is deliberately excluded: it must stay
        // in the lazily imported Protect chunk.
        manualChunks(id) {
          const p = id.split("\\").join("/");
          if (!p.includes("/node_modules/")) return undefined;
          if (p.includes("/node_modules/pdf-lib/")) return "vendor-pdf-lib";
          if (
            p.includes("/node_modules/react-dom/") ||
            p.includes("/node_modules/react/") ||
            p.includes("/node_modules/scheduler/")
          ) {
            return "vendor-react";
          }
          return undefined;
        },
      },
    },
  },
}));
