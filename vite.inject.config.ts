// vite.inject.config.ts
import { defineConfig } from "vite";
import { resolve } from "path";

const srcDir = resolve(__dirname, "src-tauri/src/inject/_src");
const outDir = resolve(__dirname, "src-tauri/src/inject");

export default defineConfig({
  build: {
    outDir,
    emptyOutDir: false,
    minify: false,
    lib: {
      entry: {
        image_popup: resolve(srcDir, "image_popup.ts"),
        tab_selector: resolve(srcDir, "tab_selector.ts"),
        header_customizer: resolve(srcDir, "header_customizer.ts"),
        custom_css: resolve(srcDir, "custom_css.ts"),
        auto_reload: resolve(srcDir, "auto_reload.ts"),
        scroll_event: resolve(srcDir, "scroll_event.ts"),
      },
      formats: ["iife"],
    },
    rollupOptions: {
      output: {
        entryFileNames: "[name].js",
      },
    },
  },
});
