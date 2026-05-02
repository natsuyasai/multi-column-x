// vite.inject.config.ts
import { defineConfig } from "vite";
import { resolve } from "path";

const srcDir = resolve(import.meta.dirname, "src-tauri/src/inject/_src");
const outDir = resolve(import.meta.dirname, "src-tauri/src/inject");

const entries = [
  "image_popup",
  "tab_selector",
  "header_customizer",
  "custom_css",
  "auto_reload",
  "scroll_event",
];

export default defineConfig({
  build: {
    outDir,
    emptyOutDir: false,
    minify: false,
    rollupOptions: {
      input: Object.fromEntries(
        entries.map((name) => [name, resolve(srcDir, `${name}.ts`)])
      ),
      output: {
        format: "iife",
        entryFileNames: "[name].js",
        inlineDynamicImports: false,
      },
    },
  },
});
