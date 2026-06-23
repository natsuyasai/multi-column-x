import js from "@eslint/js";
import jsxA11y from "eslint-plugin-jsx-a11y";
import importX from "eslint-plugin-import-x";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // Rust / Android / ビルド成果物 / 設定ファイルは対象外（フロントの src のみを lint する）
    ignores: [
      "dist",
      "src-tauri",
      "node_modules",
      "**/*.config.{js,ts}",
      "src-tauri/src/inject/**",
    ],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "jsx-a11y": jsxA11y,
      "import-x": importX,
    },
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      // @/ から始まる import を internal グループ扱いにする
      "import-x/internal-regex": "^@/",
    },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      // 意図的に握りつぶす catch（クリーンアップ失敗を無視する箇所）は許可する
      "no-empty": ["error", { allowEmptyCatch: true }],
      // 既存コードに多数存在する a11y 指摘は段階的に解消するため警告に留める（新規コードでは解消すること）
      "jsx-a11y/click-events-have-key-events": "warn",
      "jsx-a11y/no-static-element-interactions": "warn",
      "jsx-a11y/no-autofocus": "warn",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "import-x/order": [
        "error",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            "parent",
            "sibling",
            "index",
          ],
          "newlines-between": "never",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
    },
  },
  {
    // テスト・Story はインタラクション記述の都合上ルールを一部緩める
    files: ["src/**/*.{test,stories}.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
);
