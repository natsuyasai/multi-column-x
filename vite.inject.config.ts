// vite.inject.config.ts
import { defineConfig } from "vite";
import { resolve } from "path";
import react from "@vitejs/plugin-react";

const srcDir = resolve(import.meta.dirname, "src-tauri/src/inject/_src");
const outDir = resolve(import.meta.dirname, "src-tauri/src/inject");

// React を含まない通常エントリ (ES modules)
const plainEntries = [
  "image_popup",
  "tab_selector",
  "custom_css",
  "auto_reload",
  "scroll_event",
];

// React を含む header_customizer は IIFE + inlineDynamicImports で個別ビルド
const reactEntry = "header_customizer";

export default defineConfig(({ mode }) => {
  if (mode === "react") {
    // header_customizer のみ: React バンドル込みの IIFE (単一エントリ)
    return {
      plugins: [react()],
      build: {
        outDir,
        emptyOutDir: false,
        minify: false,
        rollupOptions: {
          input: resolve(srcDir, `${reactEntry}.ts`),
          output: {
            format: "iife",
            entryFileNames: `${reactEntry}.js`,
            inlineDynamicImports: true,
          },
        },
      },
    };
  }

  // デフォルト: 通常スクリプト群を ES modules でビルド
  return {
    build: {
      outDir,
      emptyOutDir: false,
      minify: false,
      rollupOptions: {
        input: Object.fromEntries(
          plainEntries.map((name) => [name, resolve(srcDir, `${name}.ts`)])
        ),
        output: {
          format: "es",
          entryFileNames: "[name].js",
        },
      },
    },
  };
});
