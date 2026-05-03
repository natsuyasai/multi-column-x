# ポップアップ セッション切り替え Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ポップアップウィンドウ内にアカウント切り替えドロップダウンを持つツールバーを注入し、選択時に同URLを新セッションで開き直す。

**Architecture:** フロントエンドがアカウント一覧を `window.__tvAccountList` に書き出し、inject スクリプトがそれを読んで Rust コマンドに渡す。ポップアップには `popup_toolbar.js` を initialization_script として注入してツールバーをDOMに挿入する。セッション切り替え時はウィンドウを再作成する。

**Tech Stack:** Rust (Tauri v2), TypeScript (inject スクリプト), React (フロントエンド)

---

## ファイル構成

| ファイル                                     | 変更種別 | 責務                                                                                |
| -------------------------------------------- | -------- | ----------------------------------------------------------------------------------- |
| `src/App.tsx`                                | 変更     | `window.__tvAccountList` の書き出し                                                 |
| `src-tauri/src/inject/_src/types.d.ts`       | 変更     | グローバル型定義追加                                                                |
| `src-tauri/src/inject/_src/image_popup.ts`   | 変更     | `accounts` 引数を `open_popup_window` に渡す                                        |
| `src-tauri/src/inject/image_popup.js`        | 変更     | ビルド済みJS更新                                                                    |
| `src-tauri/src/inject/_src/popup_toolbar.ts` | 新規     | ツールバーUIの注入・セッション切り替えinvoke                                        |
| `src-tauri/src/inject/popup_toolbar.js`      | 新規     | ビルド済みJS                                                                        |
| `src-tauri/src/inject/mod.rs`                | 変更     | `build_popup_init_script` 関数を追加                                                |
| `src-tauri/src/commands/webview.rs`          | 変更     | `AccountInfo` 型、`open_popup_window` 引数追加、`switch_popup_session` コマンド追加 |
| `src-tauri/src/lib.rs`                       | 変更     | `switch_popup_session` コマンド登録                                                 |

---

### Task 1: 型定義とフロントエンドのアカウント書き出し

**Files:**

- Modify: `src-tauri/src/inject/_src/types.d.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: `types.d.ts` に型定義を追加する**

[src-tauri/src/inject/\_src/types.d.ts](src-tauri/src/inject/_src/types.d.ts) の `declare global` ブロックを以下に置き換える:

```typescript
interface TvAccountInfo {
  id: string;
  label: string;
  color: string;
  dataDirectory: string;
}

declare global {
  interface Window {
    __twitterViewer: TwitterViewerAPI;
    __twitterViewerConfig?: TwitterViewerConfig;
    __TAURI__?: TauriGlobal;
    __TAURI_INTERNALS__?: TauriInternals;
    __tvAccountList?: TvAccountInfo[];
    __tvAccounts?: TvAccountInfo[];
    __tvCurrentAccountId?: string;
  }
}
```

- [ ] **Step 2: `App.tsx` に `window.__tvAccountList` の書き出しを追加する**

[src/App.tsx](src/App.tsx) の既存の `useEffect` ブロック群（`loadSettings` の後）に以下を追加する。`accounts` は既に `useAppStore` から取得済み（16行目）:

```typescript
// accounts が変わるたびに inject スクリプトが参照できるよう書き出す
useEffect(() => {
  window.__tvAccountList = accounts.map((a) => ({
    id: a.id,
    label: a.label,
    color: a.color,
    dataDirectory: a.dataDirectory,
  }));
}, [accounts]);
```

- [ ] **Step 3: ビルドして型エラーがないことを確認する**

```bash
cd c:/Users/fuku/Desktop/twitter-viewer
npm run build 2>&1 | tail -20
```

期待結果: エラーなし（または既存と同じエラーのみ）

- [ ] **Step 4: コミット**

```bash
git add src-tauri/src/inject/_src/types.d.ts src/App.tsx
git commit -m "feat: add __tvAccountList global and TvAccountInfo type"
```

---

### Task 2: `image_popup.ts` と `image_popup.js` を更新して accounts を渡す

**Files:**

- Modify: `src-tauri/src/inject/_src/image_popup.ts`
- Modify: `src-tauri/src/inject/image_popup.js`

- [ ] **Step 1: `image_popup.ts` の invoke 呼び出しを更新する**

[src-tauri/src/inject/\_src/image_popup.ts](src-tauri/src/inject/_src/image_popup.ts) の `tauriInvoke` 呼び出し箇所を以下に変更する:

```typescript
if (isMediaLink(href)) {
  e.preventDefault();
  e.stopPropagation();
  const label =
    window.__TAURI_INTERNALS__?.metadata?.currentWebview?.label ?? "unknown";
  const accounts = window.__tvAccountList ?? [];
  tauriInvoke("open_popup_window", {
    webviewLabelCaller: label,
    url: resolveAbsolute(href),
    accounts,
  });
}
```

- [ ] **Step 2: `image_popup.js`（ビルド済みJS）を同様に更新する**

[src-tauri/src/inject/image_popup.js](src-tauri/src/inject/image_popup.js) の invoke 呼び出し部分を以下に変更する:

```javascript
if (isMediaLink(href)) {
  e.preventDefault();
  e.stopPropagation();
  const label =
    window.__TAURI_INTERNALS__?.metadata?.currentWebview?.label ?? "unknown";
  const accounts = window.__tvAccountList ?? [];
  tauriInvoke("open_popup_window", {
    webviewLabelCaller: label,
    url: resolveAbsolute(href),
    accounts,
  });
}
```

- [ ] **Step 3: コミット**

```bash
git add src-tauri/src/inject/_src/image_popup.ts src-tauri/src/inject/image_popup.js
git commit -m "feat: pass accounts list to open_popup_window from image_popup"
```

---

### Task 3: `popup_toolbar.ts` と `popup_toolbar.js` を新規作成する

**Files:**

- Create: `src-tauri/src/inject/_src/popup_toolbar.ts`
- Create: `src-tauri/src/inject/popup_toolbar.js`

- [ ] **Step 1: `popup_toolbar.ts` を作成する**

`c:/Users/fuku/Desktop/twitter-viewer/src-tauri/src/inject/_src/popup_toolbar.ts` を以下の内容で作成する:

```typescript
// src-tauri/src/inject/_src/popup_toolbar.ts
(function () {
  const accounts: TvAccountInfo[] = window.__tvAccounts ?? [];
  const currentAccountId: string = window.__tvCurrentAccountId ?? "";

  if (accounts.length === 0) return;

  function tauriInvoke(cmd: string, args: Record<string, unknown>): void {
    const invoke = window.__TAURI__?.core?.invoke ?? window.__TAURI__?.invoke;
    if (invoke) {
      invoke(cmd, args);
    }
  }

  const TOOLBAR_HEIGHT = 40;

  const toolbar = document.createElement("div");
  toolbar.style.cssText = [
    "position: fixed",
    "top: 0",
    "left: 0",
    "width: 100%",
    "height: " + TOOLBAR_HEIGHT + "px",
    "z-index: 99999",
    "background: #15202b",
    "border-bottom: 1px solid #38444d",
    "display: flex",
    "align-items: center",
    "padding: 0 12px",
    "box-sizing: border-box",
    "font-family: sans-serif",
    "font-size: 13px",
    "color: #e7e9ea",
  ].join(";");

  const label = document.createElement("span");
  label.textContent = "アカウント: ";
  label.style.cssText = "margin-right: 8px; white-space: nowrap;";

  const select = document.createElement("select");
  select.style.cssText = [
    "background: #253341",
    "color: #e7e9ea",
    "border: 1px solid #38444d",
    "border-radius: 4px",
    "padding: 4px 8px",
    "font-size: 13px",
    "cursor: pointer",
    "max-width: 200px",
  ].join(";");

  accounts.forEach((account) => {
    const option = document.createElement("option");
    option.value = account.id;
    option.textContent = account.label;
    if (account.id === currentAccountId) {
      option.selected = true;
    }
    select.appendChild(option);
  });

  select.addEventListener("change", function () {
    const selectedId = select.value;
    const selectedAccount = accounts.find((a) => a.id === selectedId);
    if (!selectedAccount) return;
    const popupLabel =
      window.__TAURI_INTERNALS__?.metadata?.currentWebview?.label ?? "";
    tauriInvoke("switch_popup_session", {
      popupLabel,
      accountId: selectedAccount.id,
      dataDirectory: selectedAccount.dataDirectory,
      url: window.location.href,
      accounts,
    });
  });

  toolbar.appendChild(label);
  toolbar.appendChild(select);

  function inject() {
    if (document.body) {
      document.body.style.paddingTop = TOOLBAR_HEIGHT + "px";
      document.body.insertBefore(toolbar, document.body.firstChild);
    } else {
      document.addEventListener("DOMContentLoaded", function () {
        document.body.style.paddingTop = TOOLBAR_HEIGHT + "px";
        document.body.insertBefore(toolbar, document.body.firstChild);
      });
    }
  }

  inject();
})();
```

- [ ] **Step 2: `popup_toolbar.js`（ビルド済みJS）を作成する**

`c:/Users/fuku/Desktop/twitter-viewer/src-tauri/src/inject/popup_toolbar.js` を以下の内容で作成する（TypeScriptの型アノテーションを除いたもの）:

```javascript
(function () {
  const accounts = window.__tvAccounts ?? [];
  const currentAccountId = window.__tvCurrentAccountId ?? "";

  if (accounts.length === 0) return;

  function tauriInvoke(cmd, args) {
    const invoke = window.__TAURI__?.core?.invoke ?? window.__TAURI__?.invoke;
    if (invoke) {
      invoke(cmd, args);
    }
  }

  const TOOLBAR_HEIGHT = 40;

  const toolbar = document.createElement("div");
  toolbar.style.cssText = [
    "position: fixed",
    "top: 0",
    "left: 0",
    "width: 100%",
    "height: " + TOOLBAR_HEIGHT + "px",
    "z-index: 99999",
    "background: #15202b",
    "border-bottom: 1px solid #38444d",
    "display: flex",
    "align-items: center",
    "padding: 0 12px",
    "box-sizing: border-box",
    "font-family: sans-serif",
    "font-size: 13px",
    "color: #e7e9ea",
  ].join(";");

  const label = document.createElement("span");
  label.textContent = "アカウント: ";
  label.style.cssText = "margin-right: 8px; white-space: nowrap;";

  const select = document.createElement("select");
  select.style.cssText = [
    "background: #253341",
    "color: #e7e9ea",
    "border: 1px solid #38444d",
    "border-radius: 4px",
    "padding: 4px 8px",
    "font-size: 13px",
    "cursor: pointer",
    "max-width: 200px",
  ].join(";");

  accounts.forEach(function (account) {
    const option = document.createElement("option");
    option.value = account.id;
    option.textContent = account.label;
    if (account.id === currentAccountId) {
      option.selected = true;
    }
    select.appendChild(option);
  });

  select.addEventListener("change", function () {
    const selectedId = select.value;
    const selectedAccount = accounts.find(function (a) {
      return a.id === selectedId;
    });
    if (!selectedAccount) return;
    const popupLabel =
      window.__TAURI_INTERNALS__?.metadata?.currentWebview?.label ?? "";
    tauriInvoke("switch_popup_session", {
      popupLabel,
      accountId: selectedAccount.id,
      dataDirectory: selectedAccount.dataDirectory,
      url: window.location.href,
      accounts,
    });
  });

  toolbar.appendChild(label);
  toolbar.appendChild(select);

  function inject() {
    if (document.body) {
      document.body.style.paddingTop = TOOLBAR_HEIGHT + "px";
      document.body.insertBefore(toolbar, document.body.firstChild);
    } else {
      document.addEventListener("DOMContentLoaded", function () {
        document.body.style.paddingTop = TOOLBAR_HEIGHT + "px";
        document.body.insertBefore(toolbar, document.body.firstChild);
      });
    }
  }

  inject();
})();
```

- [ ] **Step 3: コミット**

```bash
git add src-tauri/src/inject/_src/popup_toolbar.ts src-tauri/src/inject/popup_toolbar.js
git commit -m "feat: add popup_toolbar inject script for session switching"
```

---

### Task 4: `inject/mod.rs` に `build_popup_init_script` を追加する

**Files:**

- Modify: `src-tauri/src/inject/mod.rs`

- [ ] **Step 1: `mod.rs` に `build_popup_init_script` 関数を追加する**

[src-tauri/src/inject/mod.rs](src-tauri/src/inject/mod.rs) の末尾に以下を追加する:

```rust
pub fn build_popup_init_script(accounts_json: &str, current_account_id: &str) -> String {
    let popup_toolbar = include_str!("popup_toolbar.js");
    format!(
        "window.__tvAccounts={};window.__tvCurrentAccountId={:?};\n{}",
        accounts_json, current_account_id, popup_toolbar
    )
}
```

- [ ] **Step 2: Rust ビルドが通ることを確認する**

```bash
cd c:/Users/fuku/Desktop/twitter-viewer
cargo build --manifest-path src-tauri/Cargo.toml 2>&1 | grep -E "^error" | head -20
```

期待結果: `error` 行なし

- [ ] **Step 3: コミット**

```bash
git add src-tauri/src/inject/mod.rs
git commit -m "feat: add build_popup_init_script to inject mod"
```

---

### Task 5: `webview.rs` に `AccountInfo` 型と `open_popup_window` の変更を追加する

**Files:**

- Modify: `src-tauri/src/commands/webview.rs`

- [ ] **Step 1: `AccountInfo` 型を追加し、`open_popup_window` の引数と処理を更新する**

[src-tauri/src/commands/webview.rs](src-tauri/src/commands/webview.rs) の先頭 `use` の後に `AccountInfo` 型を追加する:

```rust
#[derive(serde::Deserialize, serde::Serialize)]
pub struct AccountInfo {
    pub id: String,
    pub label: String,
    pub color: String,
    #[serde(rename = "dataDirectory")]
    pub data_directory: String,
}
```

次に `open_popup_window` 関数のシグネチャを変更する（`accounts: Vec<AccountInfo>` を追加）:

```rust
#[tauri::command]
pub async fn open_popup_window(
    app: AppHandle,
    webview_label_caller: String,
    url: String,
    accounts: Vec<AccountInfo>,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    let (data_dir, current_account_id) = {
        let registry = state.registry.lock().unwrap();
        let data_dir = registry
            .get_data_directory(&webview_label_caller)
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(""));
        let account_id = registry
            .get_account_id(&webview_label_caller)
            .unwrap_or("")
            .to_string();
        (data_dir, account_id)
    };

    let popup_label = format!("popup-{}", uuid::Uuid::new_v4());

    let accounts_json = serde_json::to_string(&accounts).unwrap_or_else(|_| "[]".to_string());
    let popup_init = crate::inject::build_popup_init_script(&accounts_json, &current_account_id);

    const POPUP_WIDTH: f64 = 900.0;
    const POPUP_HEIGHT: f64 = 700.0;

    let mut builder = tauri::WebviewWindowBuilder::new(
        &app,
        &popup_label,
        WebviewUrl::External(parse_url(&url)?),
    )
    .title("X - メディア")
    .inner_size(POPUP_WIDTH, POPUP_HEIGHT)
    .initialization_script(&popup_init)
    .data_directory(data_dir);

    if let Some(window) = app.get_window("main") {
        if let (Ok(pos), Ok(size)) = (window.outer_position(), window.outer_size()) {
            let scale = window.scale_factor().unwrap_or(1.0);
            let center_x = pos.x as f64 + (size.width as f64 - POPUP_WIDTH * scale) / 2.0;
            let center_y = pos.y as f64 + (size.height as f64 - POPUP_HEIGHT * scale) / 2.0;
            builder = builder.position(center_x / scale, center_y / scale);
        }
    }

    builder.build().map_err(|e| e.to_string())?;

    Ok(())
}
```

- [ ] **Step 2: Rust ビルドが通ることを確認する**

```bash
cargo build --manifest-path c:/Users/fuku/Desktop/twitter-viewer/src-tauri/Cargo.toml 2>&1 | grep -E "^error" | head -20
```

期待結果: `error` 行なし

- [ ] **Step 3: コミット**

```bash
git add src-tauri/src/commands/webview.rs
git commit -m "feat: add AccountInfo type and update open_popup_window to inject toolbar"
```

---

### Task 6: `switch_popup_session` コマンドを追加する

**Files:**

- Modify: `src-tauri/src/commands/webview.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: `SwitchPopupSessionArgs` 型と `switch_popup_session` コマンドを `webview.rs` に追加する**

[src-tauri/src/commands/webview.rs](src-tauri/src/commands/webview.rs) の `open_in_browser` 関数の直前に以下を追加する:

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
    pub accounts: Vec<AccountInfo>,
}

#[tauri::command]
pub async fn switch_popup_session(
    app: AppHandle,
    args: SwitchPopupSessionArgs,
) -> Result<(), String> {
    let (pos, size) = if let Some(window) = app.get_webview_window(&args.popup_label) {
        let pos = window.outer_position().ok();
        let size = window.outer_size().ok();
        window.close().map_err(|e| e.to_string())?;
        (pos, size)
    } else {
        (None, None)
    };

    let new_label = format!("popup-{}", uuid::Uuid::new_v4());
    let data_dir = PathBuf::from(&args.data_directory);

    let accounts_json = serde_json::to_string(&args.accounts).unwrap_or_else(|_| "[]".to_string());
    let popup_init = crate::inject::build_popup_init_script(&accounts_json, &args.account_id);

    let mut builder = tauri::WebviewWindowBuilder::new(
        &app,
        &new_label,
        WebviewUrl::External(parse_url(&args.url)?),
    )
    .title("X - メディア")
    .initialization_script(&popup_init)
    .data_directory(data_dir);

    if let (Some(p), Some(s)) = (pos, size) {
        let scale = app
            .get_window("main")
            .and_then(|w| w.scale_factor().ok())
            .unwrap_or(1.0);
        builder = builder
            .inner_size(s.width as f64 / scale, s.height as f64 / scale)
            .position(p.x as f64 / scale, p.y as f64 / scale);
    } else {
        builder = builder.inner_size(900.0, 700.0);
    }

    builder.build().map_err(|e| e.to_string())?;

    Ok(())
}
```

- [ ] **Step 2: `lib.rs` にコマンドを登録する**

[src-tauri/src/lib.rs](src-tauri/src/lib.rs) の `invoke_handler` に `commands::webview::switch_popup_session` を追加する:

```rust
        .invoke_handler(tauri::generate_handler![
            commands::settings::load_settings,
            commands::settings::save_settings,
            commands::webview::create_column_webview,
            commands::webview::remove_column_webview,
            commands::webview::resize_column_webview,
            commands::webview::open_popup_window,
            commands::webview::switch_popup_session,
            commands::webview::eval_in_webview,
            commands::webview::report_webview_scroll,
            commands::webview::open_in_browser,
            commands::account::open_add_account_window,
            commands::account::notify_account_logged_in,
            commands::account::delete_account_data,
            commands::account::close_window,
        ])
```

- [ ] **Step 3: Rust ビルドが通ることを確認する**

```bash
cargo build --manifest-path c:/Users/fuku/Desktop/twitter-viewer/src-tauri/Cargo.toml 2>&1 | grep -E "^error" | head -20
```

期待結果: `error` 行なし

- [ ] **Step 4: コミット**

```bash
git add src-tauri/src/commands/webview.rs src-tauri/src/lib.rs
git commit -m "feat: add switch_popup_session command for account switching in popup"
```

---

### Task 7: 既存の `open_popup_window` の旧コードを整理する

現在 `webview.rs` の `open_popup_window` にはTask5で書き換える前の旧コード（ `window_pos`/`window_size` の計算ブロック）が残っている可能性がある。Task5の変更後にビルドが通っていれば、このタスクは不要。ビルドエラーが残る場合のみ対処する。

- [ ] **Step 1: `webview.rs` の `open_popup_window` に旧コードが残っていないか確認する**

```bash
grep -n "window_pos\|window_size\|PADDING" c:/Users/fuku/Desktop/twitter-viewer/src-tauri/src/commands/webview.rs
```

期待結果: 何も出力されない（旧コードなし）。出力がある場合は該当行を削除する。

- [ ] **Step 2: 最終ビルド確認**

```bash
cargo build --manifest-path c:/Users/fuku/Desktop/twitter-viewer/src-tauri/Cargo.toml 2>&1 | grep -E "^error" | head -20
```

期待結果: `error` 行なし

- [ ] **Step 3: コミット（変更があった場合のみ）**

```bash
git add src-tauri/src/commands/webview.rs
git commit -m "chore: remove leftover code from open_popup_window"
```

---

## 動作確認手順

1. アプリを起動する
2. 複数アカウントが登録されている状態でカラムを開く
3. ツイートのメディアリンク（画像・動画）をクリックする
4. ポップアップウィンドウが開き、上部にツールバー（「アカウント: [ドロップダウン]」）が表示されることを確認する
5. ドロップダウンから別のアカウントを選択する
6. ポップアップが同じURLで再度開き、ツールバーに選択したアカウントが表示されることを確認する
7. ツールバーが x.com のコンテンツに被さっていないこと（`padding-top` が効いていること）を確認する
