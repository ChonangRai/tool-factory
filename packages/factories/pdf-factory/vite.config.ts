import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8082,
  },
  plugins: [react()].filter(Boolean),
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
