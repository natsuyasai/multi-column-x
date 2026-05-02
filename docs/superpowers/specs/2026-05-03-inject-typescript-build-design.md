# Design: inject スクリプトのTypeScriptビルド化

## 概要

`src-tauri/src/inject/` 以下の注入JSファイルをTypeScriptで記述し、Viteで事前ビルドしてからRustに取り込む仕組みを導入する。

## 背景

現状、inject スクリプトは手書きの生JavaScriptで書かれており、型安全性がない。TypeScriptで記述することで型チェックの恩恵を受けられるようにする。

## ディレクトリ構成

```
src-tauri/src/inject/
├── _src/                      ← TypeScriptソース（開発者が編集）
│   ├── image_popup.ts
│   ├── tab_selector.ts
│   ├── header_customizer.ts
│   ├── custom_css.ts
│   ├── auto_reload.ts
│   └── scroll_event.ts
├── image_popup.js             ← ビルド成果物（.gitignore対象）
├── tab_selector.js
├── header_customizer.js
├── custom_css.js
├── auto_reload.js
├── scroll_event.js
└── mod.rs                     ← 変更なし
```

## Viteビルド設定

`vite.inject.config.ts`（プロジェクトルートに配置）:

- `_src/` 内の各TSファイルを個別エントリポイントとしてビルド
- 出力形式: IIFE（即時実行関数）
- 出力先: `src-tauri/src/inject/`
- minify: 無効（可読性維持）
- TypeScript strict設定を適用

## package.json scripts

```json
"build:inject": "vite build --config vite.inject.config.ts",
"dev": "npm run build:inject && tauri dev",
"build": "npm run build:inject && tauri build"
```

## .gitignore

```
src-tauri/src/inject/*.js
```

`mod.rs` は除外しない。

## Rust側

`mod.rs` の `include_str!()` 参照先は変更なし。ビルド成果物が同じパスに出力されるため。

## tsconfig

`_src/` 用の `tsconfig.inject.json` をプロジェクトルートに配置し、strict設定を適用する。既存の `tsconfig.json` とは独立して管理する。

## 移行方針

1. 既存の `.js` ファイルを `_src/` に `.ts` として複製
2. 型注釈を追加（`window.__twitterViewer` 等のグローバル型定義を `_src/types.d.ts` に集約）
3. ビルドが通ることを確認
4. 既存の `.js` ファイルを `.gitignore` に追加
5. CI/開発フローに `build:inject` を組み込む
