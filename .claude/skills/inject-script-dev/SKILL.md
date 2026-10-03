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

実DOM調査で判明した知見（例: 引用RTの動画は status リンクが DOM 上に無く、React fiber の `tweet.id_str` からのみ id を取得できる）やビルドフローの詳細は `docs/development/inject-ipc-shortcuts-notes.md` に集約されている。着手前に読み、新たに判明した恒久的な知見は同ノートへ追記する。

## GlobalSettingsフラグの配線チェーン（7箇所同期）

新しい GlobalSettings フラグを inject の `window.__multiColumnXConfig` から参照させるには、以下**すべて**の同期が必要。1箇所でも漏れると型エラー・契約テスト失敗・値未到達が起きる。

1. `src/types/index.ts`: `GlobalSettings` interface に型追加 + `DEFAULT_GLOBAL_SETTINGS` に既定値
2. `contracts/default-settings.json`: `globalSettings` に既定値を追加（`src/types/defaults.contract.test.ts` と Rust側 `default_settings_match_contract_fixture`（`src-tauri/src/commands/settings.rs`）が突合する）
3. `src-tauri/src/commands/settings.rs`: `GlobalSettingsData` にフィールド追加（`#[serde(rename = "camelCase名")]` のみ）+ `impl Default for GlobalSettingsData` に既定値。構造体レベルの `#[serde(default)]` で欠落キーは `impl Default` にフォールバックするため、**フィールドごとの `#[serde(default = "...")]` は付けない**（既定値の唯一の定義元は `impl Default`）
4. `src-tauri/src/commands/settings_store.rs`: `ColumnScriptSettings` 構造体にフィールド追加 + `column_script_settings_from(global: &serde_json::Value) -> ColumnScriptSettings` 内で `bool_flag` / `u32_flag` / `string_list` 等のヘルパーを使い、`GlobalSettingsData::default()` の値を既定値として取り出す処理を追加（既存例: `video_auto_play_stop_enabled` / `hide_ad_enabled` / `image_popup_enabled`）
5. `src-tauri/src/commands/webview/column.rs`: `build_column_init_script`（desktop/mobile 両方の `create_column_webview` から共通で呼ばれるヘルパー関数）内で `script_settings.xxx` を `InitScriptParams`（`src-tauri/src/inject/mod.rs` 定義）へ渡す。desktop（`#[cfg(desktop)]`）/ mobile（`#[cfg(mobile)]`）の `create_column_webview` 自体は `build_column_init_script` を呼ぶだけなので個別の修正は不要
6. `src-tauri/src/inject/mod.rs`: `InitScriptParams` にフィールド追加 + `build_init_script` 内の `window.__multiColumnXConfig = {...}` 生成文字列に追加
7. `src-tauri/src/inject/_src/types.d.ts`: `MultiColumnXConfig` interface に optional フィールド追加

## 経路の違いに注意

- **カラム個別設定**（例: `small_image_enabled` / `custom_css` / `ng_words`）は `build_column_init_script` 内で `column.settings.*` から直接 `InitScriptParams` に渡る。手順1〜3は `ColumnSettings` / `DEFAULT_COLUMN_SETTINGS` / fixture の `columnSettings` / `impl Default for ColumnSettings` が対象になり、手順4は不要
- **GlobalSettings**（例: `video_auto_play_stop_enabled` / `hide_ad_enabled` / `global_ng_words`）は `build_column_init_script` が `load_global_settings` で1回だけ読み込み、`column_script_settings_from` で取り出してから `InitScriptParams` に渡る

## inject から Rust コマンドを呼ぶ場合（ACL）

inject スクリプトから新しい Tauri コマンドを `invoke` する場合は、以下も同時に更新する（漏れると実行時に ACL 拒否され、`src-tauri/src/acl_contract.rs` の契約テストも落ちる）。

- `src-tauri/build.rs` の `AppManifest` にコマンドを追加
- `src-tauri/capabilities/column-webview.json` に `allow-<command>` を追加（このファイルの許可集合は inject が実際に使うコマンド集合と厳密一致で検証される）
- Android のカラム・ポップアップはネイティブ WebView で Tauri IPC ではなく JS ブリッジ経由のため、mobile で必要なら別経路の実装を確認する（`docs/development/android-notes.md`）

## キーボードショートカットを追加・変更する場合（3箇所同期）

カラム WebView フォーカス中のショートカットは inject で捕捉して転送するため、以下すべてを同期する。

1. `src/hooks/useKeyboardShortcuts.ts` の keydown ハンドラ（メインウィンドウフォーカス時）
2. `src/hooks/useKeyboardShortcuts.ts` の `IPC_EVENTS.WEBVIEW_KEYBOARD_SHORTCUT` を listen する側の switch（payload 文字列・`jump_column_N` のパース）
3. `src-tauri/src/inject/_src/keyboard_shortcut.ts`（WebView フォーカス時）

## 完了条件

- `npm run build:inject` が成功する
- `npm test` がグリーン（追加・変更したテストを含む）
- Rust 側を変更した場合、`npm run build:inject` 後に `cargo test --manifest-path src-tauri/Cargo.toml` と `npm run lint:rust` がグリーン（`include_str!` がビルド済み `.js` を埋め込むため、ビルド前は失敗する）
- DOM 依存ロジックを変更した場合、実DOM検証の要否をユーザーに確認済みである
