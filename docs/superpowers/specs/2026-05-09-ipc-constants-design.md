# IPC 定数設計資料

作成日: 2026-05-09

---

## 概要

ネイティブ（Rust）と WebView（TypeScript）の間で送受信するコマンド・イベント・グローバル変数名を、各実装言語ごとに定数として定義した。これにより、文字列のハードコードによるタイポや定義散在を防ぎ、変更時の一括管理を可能にする。

---

## 定数ファイル一覧

| ファイル                                 | 対象言語                       | 用途                                                              |
| ---------------------------------------- | ------------------------------ | ----------------------------------------------------------------- |
| `src-tauri/src/ipc_constants.rs`         | Rust                           | イベント名・ラベルプレフィックス・グローバル変数名                |
| `src/constants/ipc.ts`                   | TypeScript (メインアプリ)      | IPC コマンド名・イベント名・ラベル生成・eval スクリプト           |
| `src-tauri/src/inject/_src/constants.ts` | TypeScript (inject スクリプト) | inject スクリプトで使うコマンド名の定義一覧（参照用ドキュメント） |
| `src/types/global.d.ts`                  | TypeScript (メインアプリ)      | `window` オブジェクトのグローバル型定義                           |

---

## Tauri IPC コマンド一覧

Tauri IPC コマンドは TypeScript から `invoke(コマンド名, 引数)` で呼び出し、Rust の `#[tauri::command]` 関数が受け取る。コマンド名は Rust 関数名のスネークケースと一致する。

### 設定

| 定数名          | コマンド文字列  | 呼び出し元       | Rust 関数                           |
| --------------- | --------------- | ---------------- | ----------------------------------- |
| `LOAD_SETTINGS` | `load_settings` | `useAppStore.ts` | `commands::settings::load_settings` |
| `SAVE_SETTINGS` | `save_settings` | `useAppStore.ts` | `commands::settings::save_settings` |

### カラム WebView 管理

| 定数名                  | コマンド文字列          | 呼び出し元                    | Rust 関数                                  |
| ----------------------- | ----------------------- | ----------------------------- | ------------------------------------------ |
| `CREATE_COLUMN_WEBVIEW` | `create_column_webview` | `useColumns.ts`               | `commands::webview::create_column_webview` |
| `REMOVE_COLUMN_WEBVIEW` | `remove_column_webview` | `useColumns.ts`               | `commands::webview::remove_column_webview` |
| `RESIZE_COLUMN_WEBVIEW` | `resize_column_webview` | `useColumns.ts`               | `commands::webview::resize_column_webview` |
| `EVAL_IN_WEBVIEW`       | `eval_in_webview`       | `App.tsx`, `useAutoReload.ts` | `commands::webview::eval_in_webview`       |

### ポップアップ

| 定数名                   | コマンド文字列           | 呼び出し元                            | Rust 関数                                   |
| ------------------------ | ------------------------ | ------------------------------------- | ------------------------------------------- |
| `OPEN_POPUP_WINDOW`      | `open_popup_window`      | `image_popup.ts` (inject)             | `commands::webview::open_popup_window`      |
| `OPEN_LINK_POPUP_WINDOW` | `open_link_popup_window` | `App.tsx`, `context_menu.ts` (inject) | `commands::webview::open_link_popup_window` |
| `CLOSE_POPUP_WINDOW`     | `close_popup_window`     | `popup_toolbar.ts` (inject)           | `commands::webview::close_popup_window`     |
| `SWITCH_POPUP_SESSION`   | `switch_popup_session`   | `popup_toolbar.ts` (inject)           | `commands::webview::switch_popup_session`   |

### コンポーズ・ブラウザ

| 定数名                | コマンド文字列        | 呼び出し元 | Rust 関数                                |
| --------------------- | --------------------- | ---------- | ---------------------------------------- |
| `OPEN_COMPOSE_WINDOW` | `open_compose_window` | `App.tsx`  | `commands::webview::open_compose_window` |
| `OPEN_IN_BROWSER`     | `open_in_browser`     | —          | `commands::webview::open_in_browser`     |

### アカウント管理

| 定数名                     | コマンド文字列             | 呼び出し元       | Rust 関数                                     |
| -------------------------- | -------------------------- | ---------------- | --------------------------------------------- |
| `OPEN_ADD_ACCOUNT_WINDOW`  | `open_add_account_window`  | `useAccounts.ts` | `commands::account::open_add_account_window`  |
| `NOTIFY_ACCOUNT_LOGGED_IN` | `notify_account_logged_in` | —                | `commands::account::notify_account_logged_in` |
| `MARK_LOGIN_COMPLETE`      | `mark_login_complete`      | —                | `commands::account::mark_login_complete`      |
| `CHECK_LOGIN_COMPLETE`     | `check_login_complete`     | —                | `commands::account::check_login_complete`     |
| `DELETE_ACCOUNT_DATA`      | `delete_account_data`      | `useAccounts.ts` | `commands::account::delete_account_data`      |
| `CLOSE_WINDOW`             | `close_window`             | `useAccounts.ts` | `commands::account::close_window`             |

### モバイル専用

| 定数名                  | コマンド文字列          | 呼び出し元                 | Rust 関数                                  |
| ----------------------- | ----------------------- | -------------------------- | ------------------------------------------ |
| `REPORT_WEBVIEW_SCROLL` | `report_webview_scroll` | `scroll_event.ts` (inject) | `commands::webview::report_webview_scroll` |
| `GET_MOBILE_INSETS`     | `get_mobile_insets`     | —                          | `commands::webview::get_mobile_insets`     |
| `SET_COLUMN_COOKIES`    | `set_column_cookies`    | `useColumns.ts`            | `commands::webview::set_column_cookies`    |

---

## Tauri イベント一覧

Tauri イベントは `emit(イベント名, payload)` で送信し、`listen(イベント名, callback)` で受信する。

| 定数名                   | イベント文字列           | 送信元                                 | 受信先           | 説明                                     |
| ------------------------ | ------------------------ | -------------------------------------- | ---------------- | ---------------------------------------- |
| `ACCOUNT_LOGIN_COMPLETE` | `account-login-complete` | Rust (`commands::account`)             | `useAccounts.ts` | デスクトップ: ログイン URL 検出時に emit |
| `WEBVIEW_SCROLL`         | `webview-scroll`         | inject `scroll_event.ts` → Rust → emit | `App.tsx`        | 横スクロール量の伝達                     |
| `CLOSE_TOPMOST_POPUP`    | `close-topmost-popup`    | Android JNI (`android_bridge.rs`)      | —                | 戻るボタンで最前面ポップアップを閉じる   |

> **WEBVIEW_SCROLL の流れ**  
> WebView 内の wheel イベント → inject スクリプトが `report_webview_scroll` コマンドを invoke → Rust が `emit("webview-scroll", delta)` → メインウィンドウの `App.tsx` が listen

---

## WebView ラベル規則

WebView / ウィンドウのラベルはプレフィックス + UUID（またはアカウント ID の一部）で構成される。

| プレフィックス定数                                      | 値             | 例                                 | 対象                                     |
| ------------------------------------------------------- | -------------- | ---------------------------------- | ---------------------------------------- |
| `COLUMN_PREFIX` (Rust) / `WEBVIEW_LABELS.column()` (TS) | `column-`      | `column-a1b2c3d4-...`              | カラム WebView                           |
| `POPUP_PREFIX`                                          | `popup-`       | `popup-a1b2c3d4-...`               | ポップアップウィンドウ                   |
| `COMPOSE_PREFIX`                                        | `compose-`     | `compose-a1b2c3d4-...`             | コンポーズウィンドウ                     |
| `ADD_ACCOUNT_PREFIX`                                    | `add-account-` | `add-account-a1b2c3d4` (先頭8文字) | アカウント追加ウィンドウ（デスクトップ） |
| `ADD_ACCOUNT_MOBILE`                                    | `add-account`  | `add-account`                      | アカウント追加ウィンドウ（モバイル固定） |

TypeScript 側では `WEBVIEW_LABELS.column(columnId)` ヘルパーを使う。

---

## inject スクリプト用 window グローバル変数

Rust 側で `eval` / 初期化スクリプトを通じて WebView の `window` に注入されるオブジェクト。型定義は2か所で管理する。

| グローバル変数                | 型                   | 注入スクリプト                                                             | 利用スクリプト                                      |
| ----------------------------- | -------------------- | -------------------------------------------------------------------------- | --------------------------------------------------- |
| `window.__multiColumnX`       | `MultiColumnXAPI`    | 各 inject `.ts` (auto_reload, custom_css, header_customizer, tab_selector) | `App.tsx` (eval経由), `useAutoReload.ts` (eval経由) |
| `window.__multiColumnXConfig` | `MultiColumnXConfig` | `inject/mod.rs` (`build_init_script`)                                      | `header_customizer.ts`                              |
| `window.__tvAccounts`         | `TvAccountInfo[]`    | `inject/mod.rs` (`build_popup_init_script`)                                | `popup_toolbar.ts`                                  |
| `window.__tvCurrentAccountId` | `string`             | `inject/mod.rs` (`build_popup_init_script`)                                | `popup_toolbar.ts`                                  |
| `window.__tvTargetHref`       | `string`             | `inject/mod.rs` (`build_popup_init_script`)                                | `popup_toolbar.ts`                                  |
| `window.__tvEscCloseEnabled`  | `boolean`            | `inject/mod.rs` (`build_popup_init_script`)                                | `popup_toolbar.ts`                                  |
| `window.__mobileTopInset`     | `number`             | `inject/mod.rs` (mobile insets)                                            | `header_customizer.ts`                              |
| `window.__mobileBottomInset`  | `number`             | `inject/mod.rs` (mobile insets)                                            | `header_customizer.ts`                              |

### MultiColumnXAPI メソッド

| メソッド                            | 定義ファイル           | 説明                                                     |
| ----------------------------------- | ---------------------- | -------------------------------------------------------- |
| `triggerReload()`                   | `auto_reload.ts`       | ページをリロードする                                     |
| `applyCustomCSS(css: string)`       | `custom_css.ts`        | カスタム CSS を `<style id="__custom_css__">` に適用する |
| `applyAreaRemove(enabled: boolean)` | `header_customizer.ts` | ヘッダーカスタマイズの有効/無効を切り替える              |
| `selectHomeTab()`                   | `tab_selector.ts`      | ホームタブを選択する（未実装）                           |

---

## eval_in_webview スクリプトテンプレート

`eval_in_webview` コマンドで WebView に評価させるスクリプトは `WEBVIEW_SCRIPTS` に集約している。

| 定数名                     | スクリプト内容                                                                | 呼び出し元                    |
| -------------------------- | ----------------------------------------------------------------------------- | ----------------------------- |
| `TRIGGER_RELOAD`           | `window.__multiColumnX && window.__multiColumnX.triggerReload();`             | `App.tsx`, `useAutoReload.ts` |
| `applyAreaRemove(enabled)` | `window.__multiColumnX && window.__multiColumnX.applyAreaRemove(${enabled});` | `App.tsx`                     |
| `applyCustomCSS(css)`      | `(function(){var el=...el.textContent=\`${escaped}\`;})();`                   | `App.tsx`                     |

---

## 型定義ファイルの管理方針

| ファイル                               | スコープ                | 定義内容                               |
| -------------------------------------- | ----------------------- | -------------------------------------- |
| `src/types/global.d.ts`                | メインアプリ TypeScript | `Window` 拡張型（`__multiColumnX` 等） |
| `src-tauri/src/inject/_src/types.d.ts` | inject TypeScript       | `Window` 拡張型 + Tauri グローバル型   |

両ファイルは同じ `Window` インタフェースを拡張しているが、ビルドシステムが異なるため分離している（inject スクリプトは Vite 別設定でビルド）。型の変更は両ファイルを同期して更新すること。

---

## 通信フロー図

```
メインウィンドウ (TypeScript)
  │
  ├─ invoke(IPC_COMMANDS.*)          ──► Rust コマンドハンドラ
  │                                        │
  │                                        ├─ emit(events::*)  ──► listen(IPC_EVENTS.*)
  │                                        │
  │                                        └─ eval(script)  ──► WebView (inject スクリプト)
  │
  └─ listen(IPC_EVENTS.*)           ◄── emit(events::*)  (Rust / Android JNI)

カラム WebView (inject TypeScript)
  │
  └─ invoke(INJECT_COMMANDS.*)       ──► Rust コマンドハンドラ
                                           │
                                           └─ emit(events::*)  ──► メインウィンドウ
```

---

## inject スクリプト定数の管理方針

inject スクリプト（`scroll_event.ts`, `image_popup.ts`, `popup_toolbar.ts`, `context_menu.ts`）は
Vite によって個別の単体 JS ファイルとしてビルドされ、Rust の `include_str!()` で埋め込まれる。
この構造のため、ES module `import` による定数共有ができない。

そのため各スクリプトファイルの先頭に同じ値を `const` としてローカル定義している。
`constants.ts` は定義一覧のドキュメントとして機能する（import 不可）。

---

## 変更時のチェックリスト

コマンド名・イベント名・ラベルプレフィックスを変更する場合は以下を確認する。

- [ ] `src-tauri/src/ipc_constants.rs` の定数値を更新
- [ ] `src/constants/ipc.ts` の定数値を更新
- [ ] `src-tauri/src/inject/_src/constants.ts` のドキュメントを更新
- [ ] inject スクリプト（`scroll_event.ts`, `image_popup.ts`, `popup_toolbar.ts`, `context_menu.ts`）のローカル定数も同じ値に更新
- [ ] グローバル変数名を変更する場合は `src/types/global.d.ts` と `src-tauri/src/inject/_src/types.d.ts` を両方更新
- [ ] `WEBVIEW_SCRIPTS` 内の文字列は `window.__multiColumnX` を直接参照しているため、グローバル変数名変更時は合わせて更新
