// vite.inject.config.ts
import { defineConfig, Plugin } from "vite";
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

// document.head が null のタイミングで appendChild が呼ばれる問題を防ぐプラグイン
function safeHeadInjectPlugin(): Plugin {
  return {
    name: "safe-head-inject",
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== "chunk") continue;
        chunk.code = chunk.code.replace(
          /document\.head\.appendChild\(([^)]+)\)/g,
          "(function(el){if(document.head){document.head.appendChild(el);}else{document.addEventListener('DOMContentLoaded',function(){document.head.appendChild(el);});}})($1)"
        );
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  if (mode === "react") {
    // header_customizer のみ: React バンドル込みの IIFE (単一エントリ)
    return {
      plugins: [react(), safeHeadInjectPlugin()],
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
