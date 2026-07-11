---
description: "injectスクリプト（X実DOMに注入するJS）の新規作成・修正・設定フラグの配線を行う"
user-invocable: true
argument-hint: "対象のinjectスクリプトや追加したい機能"
---

# injectスクリプト開発

column WebView に注入する JS（`src-tauri/src/inject/_src/`）の開発ワークフロー。

## 基本ワークフロー

1. `src-tauri/src/inject/_src/` の TypeScript を編集する。テストは同ディレクトリにコロケーション配置（`<name>.test.ts` / `<name>.property.test.ts`、vitest + jsdom）。
2. `npm run build:inject` でバンドルする。内部的に `vite.inject.config.ts` を**2パス**実行する（通常モード＋ `--mode react`。`header_customizer` のみ React 込み IIFE で個別ビルドされる）。
3. 生成された `src-tauri/src/inject/*.js` は **gitignore 済みで直接編集禁止**。必ず `_src` を編集して再ビルドする。

## 実DOM検証の必須確認

inject スクリプトは x.com の実 DOM 構造（セレクタ・React 内部構造）に依存する。X の DOM は変更されやすく、jsdom の合成 DOM によるユニットテストだけでは実際の挙動を保証できない。

**新規作成・DOM 依存ロジックを変更する場合は、実 DOM での動作確認（`claude-in-chrome` での実 X ページ調査）が必要か否かを必ずユーザーに確認する。** 必要と判断されたら、完了前に実際の X ページで検証する。

例（CLAUDE.md記載の実例）: 引用RTの動画は引用ツイートに属し、status リンクが DOM 上に無く、React fiber の `tweet.id_str` からのみ id を取得できる。この種の事実は実 DOM 調査でしか判明しない。

## GlobalSettingsフラグの配線チェーン（7箇所同期）

新しい GlobalSettings フラグを inject の `window.__multiColumnXConfig` から参照させるには、以下**すべて**の同期が必要。1箇所でも漏れると型エラー・契約テスト失敗・値未到達が起きる。

1. `src/types/index.ts`: `GlobalSettings` interface に型追加 + `DEFAULT_GLOBAL_SETTINGS` に既定値
2. `contracts/default-settings.json`: `globalSettings` に既定値を追加（`src/types/defaults.contract.test.ts` と Rust側 `default_settings_match_contract_fixture`（`src-tauri/src/commands/settings.rs`）が突合する）
3. `src-tauri/src/commands/settings.rs`: `GlobalSettingsData` にフィールド追加（`#[serde(rename = "camelCase名")]` + `#[serde(default = ...)]`）、`Default` impl にも既定値
4. `src-tauri/src/commands/settings_store.rs`: `load_xxx_enabled(app: &AppHandle) -> bool` 形式のローダ関数を追加（既存例: `load_video_auto_play_stop_enabled` / `load_hide_ad_enabled` / `load_image_popup_enabled` / `load_video_popup_enabled`）
5. `src-tauri/src/commands/webview/column.rs`: **desktop（`#[cfg(desktop)]`）/ mobile（`#[cfg(mobile)]`）両方**の `create_column_webview` でローダを呼び出し、`InitScriptParams`（`src-tauri/src/inject/mod.rs` 定義）へ渡す
6. `src-tauri/src/inject/mod.rs`: `InitScriptParams` にフィールド追加 + `build_init_script` 内の `window.__multiColumnXConfig = {...}` 生成文字列に追加
7. `src-tauri/src/inject/_src/types.d.ts`: `MultiColumnXConfig` interface に optional フィールド追加

## 経路の違いに注意

- **カラム個別設定**（例: `small_image_enabled` / `custom_css` / `ng_words`）は `args.column.settings.*` から直接 `InitScriptParams` に渡る
- **GlobalSettings**（例: `video_auto_play_stop_enabled` / `hide_ad_enabled` / `global_ng_words`）は `settings_store.rs` の `load_xxx` 経由で読み込んでから `InitScriptParams` に渡る

同じ `InitScriptParams` に集約されるが、値の出どころ（カラム設定 vs グローバル設定ストア）が異なるため、新規フラグがどちら由来かで手順4の要否が変わる（カラム個別設定なら手順4は不要）。

## 完了条件

- `npm run build:inject` が成功する
- `npm test` がグリーン（追加・変更したテストを含む）
- DOM 依存ロジックを変更した場合、実DOM検証の要否をユーザーに確認済みである
