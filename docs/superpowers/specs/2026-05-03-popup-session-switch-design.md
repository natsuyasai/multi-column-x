# ポップアップウィンドウ セッション切り替え機能 設計書

**日付:** 2026-05-03  
**ステータス:** 承認済み

---

## 概要

メディアリンクをクリックして開くポップアップウィンドウに、アカウント（セッション）を切り替えるツールバーを追加する。ツールバーはドロップダウン形式で、選択時は現在のウィンドウを閉じて新しいセッションで同URLを開き直す。

---

## アーキテクチャ

### 方針

- Tauri の `WebviewWindow` は作成後に `data_directory` を変更できないため、セッション切り替え時はウィンドウを再作成する
- ツールバーUIは initialization_script として注入する（新規 `popup_toolbar.ts`）
- アカウント一覧はフロントエンドがグローバル変数 `window.__tvAccountList` に書き出し、inject スクリプトが参照する

---

## コンポーネント詳細

### 1. フロントエンド: `window.__tvAccountList` の管理

**対象ファイル:** `src/App.tsx` または accounts を管理する適切なコンポーネント

- アプリ起動時および アカウント追加・削除時に以下を実行する:
  ```ts
  window.__tvAccountList = accounts.map((a) => ({
    id: a.id,
    label: a.label,
    color: a.color,
    dataDirectory: a.dataDirectory,
  }));
  ```
- `types.d.ts` に `Window.__tvAccountList` の型定義を追加する

### 2. inject スクリプト: `image_popup.ts` の変更

`tauriInvoke("open_popup_window", ...)` の引数に `accounts` を追加する:

```ts
const accounts = (window as any).__tvAccountList ?? [];
tauriInvoke("open_popup_window", {
  webviewLabelCaller: label,
  url: resolveAbsolute(href),
  accounts,
});
```

### 3. Rust: `open_popup_window` コマンドの変更

**対象ファイル:** `src-tauri/src/commands/webview.rs`

引数に `accounts: Vec<AccountInfo>` を追加:

```rust
#[derive(serde::Deserialize)]
pub struct AccountInfo {
    pub id: String,
    pub label: String,
    pub color: String,
    #[serde(rename = "dataDirectory")]
    pub data_directory: String,
}
```

initialization_script の先頭にアカウント情報を埋め込む:

```rust
let accounts_json = serde_json::to_string(&accounts).unwrap_or_else(|_| "[]".to_string());
let current_account_id = // registryからwebview_label_callerのaccount_idを取得
let toolbar_init = format!(
    "window.__tvAccounts={};window.__tvCurrentAccountId={:?};",
    accounts_json, current_account_id
);
// toolbar_init + popup_toolbar.js を initialization_script に追加
```

`popup_toolbar.js`（ビルド済みJS）も initialization_script に追加する。

### 4. 新規 inject スクリプト: `popup_toolbar.ts`

**対象ファイル:** `src-tauri/src/inject/_src/popup_toolbar.ts`

- DOM に固定ツールバーを挿入する（`position: fixed; top: 0; width: 100%; z-index: 99999`）
- `window.__tvAccounts` を元にセレクトボックスを構築する
- `window.__tvCurrentAccountId` を初期選択状態にする
- セレクトボックス変更時に `switch_popup_session` を invoke する:
  ```ts
  tauriInvoke("switch_popup_session", {
    popupLabel: currentWindowLabel,
    accountId: selected.id,
    dataDirectory: selected.dataDirectory,
    url: window.location.href,
  });
  ```
- ツールバーの高さ分だけページコンテンツが隠れないよう `document.body` に `padding-top` を付与する
- `__tvAccounts` が空または未定義の場合はツールバーを非表示にする

### 5. 新規 Rust コマンド: `switch_popup_session`

**対象ファイル:** `src-tauri/src/commands/webview.rs`

```rust
#[derive(serde::Deserialize)]
pub struct SwitchPopupSessionArgs {
    #[serde(rename = "popupLabel")]
    pub popup_label: String,
    #[serde(rename = "accountId")]
    pub account_id: String,
    #[serde(rename = "dataDirectory")]
    pub data_directory: String,
    pub url: String,
}

#[tauri::command]
pub async fn switch_popup_session(
    app: AppHandle,
    args: SwitchPopupSessionArgs,
) -> Result<(), String>
```

引数に `accounts: Vec<AccountInfo>` も追加する（ツールバー再注入のため）。

処理フロー:

1. `app.get_webview_window(&args.popup_label)` で現在ウィンドウを取得
2. `outer_position()` と `outer_size()` で位置・サイズを保存
3. 現在ウィンドウを `close()`
4. 新しい `WebviewWindowBuilder` で同URL・同位置・同サイズ・新 `data_directory` のウィンドウを作成
5. initialization_script に `window.__tvAccounts`（同じアカウント一覧）、`window.__tvCurrentAccountId`（新アカウントID）、`popup_toolbar.js` を埋め込む

### 6. inject スクリプトのビルド

`popup_toolbar.ts` を Vite でビルドして `src-tauri/src/inject/popup_toolbar.js` を生成する（既存の他スクリプトと同様の手順）。

### 7. コマンド登録

`src-tauri/src/lib.rs` の `invoke_handler` に `switch_popup_session` を追加する。

---

## データフロー

```
アプリ起動
  → window.__tvAccountList = accounts

ユーザーがメディアリンクをクリック
  → image_popup.ts が __tvAccountList を読み取り
  → open_popup_window(webviewLabelCaller, url, accounts) を invoke

Rust: open_popup_window
  → registryからcurrent_account_idを取得
  → initialization_scriptに __tvAccounts, __tvCurrentAccountId, popup_toolbar.js を埋め込み
  → WebviewWindow を作成

ポップアップ表示
  → popup_toolbar.ts が DOM にツールバーを注入
  → 現在アカウントをドロップダウンに選択状態で表示

ユーザーがドロップダウンを変更
  → switch_popup_session(popupLabel, accountId, dataDirectory, url) を invoke

Rust: switch_popup_session
  → 現ウィンドウの位置・サイズを取得
  → 現ウィンドウを閉じる
  → 新ウィンドウを同位置・同サイズ・新data_directoryで作成
```

---

## エラーハンドリング

| ケース                                                      | 対応                                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------------------- |
| `window.__tvAccountList` が未定義                           | `accounts = []` として扱い、ツールバーのドロップダウンを非表示            |
| `switch_popup_session` 時にウィンドウがすでに閉じられていた | 新ウィンドウのみ作成して続行（エラーにしない）                            |
| アカウントが1件のみ                                         | ドロップダウンを表示するが選択肢は1件（切り替え不要だが非表示にはしない） |
| `serde_json::to_string` 失敗                                | `"[]"` にフォールバック                                                   |

---

## 対象ファイル一覧

| ファイル                                     | 変更種別                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------- |
| `src-tauri/src/commands/webview.rs`          | 変更（`open_popup_window` 引数追加、`switch_popup_session` 追加・accounts引数も含む） |
| `src-tauri/src/lib.rs`                       | 変更（コマンド登録追加）                                                              |
| `src-tauri/src/inject/_src/image_popup.ts`   | 変更（accounts引数を渡す）                                                            |
| `src-tauri/src/inject/_src/popup_toolbar.ts` | 新規                                                                                  |
| `src-tauri/src/inject/_src/types.d.ts`       | 変更（`__tvAccountList`, `__tvAccounts`, `__tvCurrentAccountId` 型追加）              |
| `src-tauri/src/inject/image_popup.js`        | 変更（ビルド済みJS更新）                                                              |
| `src-tauri/src/inject/popup_toolbar.js`      | 新規（ビルド済みJS）                                                                  |
| `src/App.tsx`（または適切なコンポーネント）  | 変更（`__tvAccountList` の書き出し）                                                  |
