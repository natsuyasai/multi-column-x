# Multi Column X 技術知識

Tauri v2 製 TweetDeck 風 X クライアント（React 19 + TypeScript と Rust、desktop と Android 対応）の、実装時に踏み抜きやすい構造上の制約をまとめる。詳細・背景は `docs/development/*-notes.md` を正本とし、領域に触れる前に該当ノートを読む。

## 領域別の誘導

| 触れる領域                                                              | 参照するノート                                                                     |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `src-tauri/src/inject/_src/**`、IPC 定数、キーボードショートカット      | `docs/development/inject-ipc-shortcuts-notes.md`                                   |
| `src/App.tsx`、`src/lib/gridLayout.ts`、`src/services/columnWebview.ts` | `docs/development/column-layout-notes.md`                                          |
| `src-tauri/src/lib.rs`、投稿ポップアップ、TopBar、常駐ウィンドウ        | `docs/development/compose-popup-topbar-notes.md`                                   |
| `src-tauri/src/commands/webview/external_link.rs`（`on_new_window`）    | `docs/development/external-link-new-window-notes.md`                               |
| `linux_column_layout`（`src-tauri/src/commands/webview/column.rs`）     | `docs/development/linux-webview-notes.md`、`docs/development/linux-column-spec.md` |
| `src-tauri/gen/android/**`                                              | `docs/development/android-notes.md`                                                |
| テーマ・再認証・自動更新・設定の既定値                                  | `docs/development/release-theme-reauth-notes.md`                                   |
| API レート制限モニター                                                  | `docs/development/api-rate-limit-operations-notes.md`                              |

## desktop / mobile の条件コンパイル

| 事実                                                                                                                                                                                                      | 影響                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Rust は `#[cfg(desktop)]` / `#[cfg(mobile)]` で分岐する                                                                                                                                                   | 同一コマンド名でも実装が異なる場合がある |
| 変更時は両方の実装を確認する                                                                                                                                                                              | 片方だけの修正はもう一方のデグレになる   |
| アカウントログイン検出は desktop が tokio の URL 500ms ポーリング（`account-login-complete` を emit）、mobile が `open_add_account_window` のセンチネルファイル（`add_account_login_complete`）ポーリング | 検出方式を混同しない                     |

## serde と IPC

| 事実                                              | 影響                                                                         |
| ------------------------------------------------- | ---------------------------------------------------------------------------- |
| Tauri v2 は JS から Rust へのケース変換を行わない | JS 側 camelCase のフィールドには Rust 側で `#[serde(rename = "...")]` が必要 |

## ACL（コマンド追加時）

| 事実                                                                   | 影響                                                                                                                                 |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| コマンドは ACL 化されている                                            | 新規コマンドは `src-tauri/build.rs` の `AppManifest` への追加が必要                                                                  |
| カラム WebView 用の許可は `src-tauri/capabilities/column-webview.json` | inject から `invoke` するコマンドは `allow-<command>` の追加が必要。許可集合は inject が実際に使うコマンド集合と厳密一致で検証される |
| 契約テストは `src-tauri/src/acl_contract.rs`                           | 更新漏れはここで落ちる                                                                                                               |
| Android のカラム・ポップアップはネイティブ WebView で JS ブリッジ経由  | Tauri IPC の ACL とは別経路。必要なら `docs/development/android-notes.md` を確認する                                                 |

## inject スクリプト

| 事実                                                                        | 影響                                                                                                                      |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 正本は `src-tauri/src/inject/_src/**` の TypeScript                         | 生成された `src-tauri/src/inject/*.js` は gitignore 済みで直接編集禁止                                                    |
| 変更後は `npm run build:inject` が必要                                      | Rust の `include_str!` はビルド済み `.js` を参照するため、ビルド前は Rust のビルド・テストが失敗する                      |
| IIFE 形式で個別ビルドされ、ES module の `import` でスクリプト間共有できない | 共有定数は各ファイルにローカル `const` で定義する。複数エントリから import したモジュールは共有チャンクになり連結が壊れる |
| 連結後は 1 本の init script になる                                          | トップレベルの `function` / `const` 名がファイル間で重複すると上書きや SyntaxError になる                                 |
| テストは同ディレクトリにコロケーション配置（vitest + jsdom）                | jsdom の合成 DOM では実 X の挙動を保証できない。実 DOM の扱いは方針 `mcx-real-webview-investigation` に従う               |

## 同期が必要な複数箇所

| 変更                                                                            | 同期する箇所                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| キーボードショートカット                                                        | `src/hooks/useKeyboardShortcuts.ts` の keydown ハンドラ、同ファイルの `IPC_EVENTS.WEBVIEW_KEYBOARD_SHORTCUT` を listen する側の switch、`src-tauri/src/inject/_src/keyboard_shortcut.ts` の 3 箇所                                                                                                   |
| 新しい GlobalSettings フラグを inject の `window.__multiColumnXConfig` へ届ける | `src/types/index.ts`、`contracts/default-settings.json`、`src-tauri/src/commands/settings.rs`、`src-tauri/src/commands/settings_store.rs`、`src-tauri/src/commands/webview/column.rs`（`build_column_init_script`）、`src-tauri/src/inject/mod.rs`、`src-tauri/src/inject/_src/types.d.ts` の 7 箇所 |
| 設定の既定値                                                                    | Rust の `impl Default`（唯一の定義元。構造体レベル `#[serde(default)]`、フィールドごとの `#[serde(default = "...")]` は付けない）、TS の `DEFAULT_GLOBAL_SETTINGS` 等、`contracts/default-settings.json` の 3 箇所。契約テストで一致を保証している                                                   |
| カラム個別設定（`ColumnSettings`）                                              | `build_column_init_script` が `column.settings.*` から直接 `InitScriptParams` に渡す。GlobalSettings 用の `settings_store.rs` 手順は不要                                                                                                                                                             |
| `MainActivity.kt` のメソッドシグネチャ                                          | `src-tauri/gen/android/app/proguard-rules.pro`（リリースビルドでしか症状が出ない）                                                                                                                                                                                                                   |

## WebView とウィンドウ

| 事実                                                                                                                                                                | 影響                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tauri v2 の子 WebView は OS ネイティブウィンドウ                                                                                                                    | CSS `z-index` が機能しない。ダイアログ表示中は `hideColumnWebviews()` で全 WebView を画面外に退避する。新しいダイアログ系 UI は `src/App.tsx` の `anyDialogOpen` の条件に追加する                                                           |
| カラムは `gridRow` / `gridCol` でマトリクス配置する                                                                                                                 | `gridLayout.ts` / `columnWebview.ts` の変更は column-layout-notes を確認する                                                                                                                                                                |
| Linux ではカラムが独立 `WebviewWindow` で親クリップが効かない                                                                                                       | はみ出し表示は `linux_column_layout` で制御する。過去にインライン実装・テスト無しで複数回デグレしており、変更時は linux-webview-notes のテスト方針に従う                                                                                    |
| `WebviewWindow::close()` は `prevent_close()` + `hide()` で握っている常駐ウィンドウ（例: 常駐コンポーズ `compose-`）には効かない                                    | 確実な破棄は `destroy()` を使う。`prevent_close` を使う常駐ウィンドウを新設したら、`src-tauri/src/lib.rs` のメインウィンドウ `CloseRequested` に明示 `destroy()` を追加する                                                                 |
| デスクトップの `target=_blank` / `window.open` は Rust の `on_new_window`（`external_link.rs`）で受け、http/https/mailto/tel のみ既定ブラウザで開いて常に Deny する | カラム / ポップアップ / コンポーズの WebView builder を新設・変更したら `.on_new_window(external_link::new_window_handler(app.clone()))` を付ける（契約テストが検査する）。デスクトップでは opener プラグインの自動クリックスクリプトは無効 |
