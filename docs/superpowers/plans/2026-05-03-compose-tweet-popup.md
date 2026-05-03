# Compose Tweet Popup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** サイドバーのツイートボタンから x.com/compose/post をポップアップ表示し、アカウント切り替えとデフォルトアカウント設定を実現する。

**Architecture:** 新Rustコマンド `open_compose_window` を追加してツイート専用ポップアップを開く。`GlobalSettings` に `defaultAccountId` を追加してAccountManager画面で設定可能にする。ツールバーUIは既存 `popup_toolbar.js` / `switch_popup_session` をそのまま流用。

**Tech Stack:** Tauri v2 (Rust), React 19 + TypeScript, Zustand, tauri-plugin-store

---

## ファイル構成

| ファイル                                                   | 変更種別 | 内容                                                               |
| ---------------------------------------------------------- | -------- | ------------------------------------------------------------------ |
| `src/types/index.ts`                                       | Modify   | `GlobalSettings` に `defaultAccountId?: string` 追加               |
| `src/components/AccountManager/AccountManager.tsx`         | Modify   | `onSetDefault` prop追加、★ボタンUI追加                             |
| `src/components/AccountManager/AccountManager.module.scss` | Modify   | `defaultBtn` スタイル追加                                          |
| `src/App.tsx`                                              | Modify   | `handleComposeTweet` 実装、AccountManager に `onSetDefault` を渡す |
| `src-tauri/src/commands/webview.rs`                        | Modify   | `open_compose_window` コマンド追加                                 |
| `src-tauri/src/lib.rs`                                     | Modify   | `open_compose_window` をコマンド登録                               |

---

## Task 1: `GlobalSettings` に `defaultAccountId` を追加

**Files:**

- Modify: `src/types/index.ts`

- [ ] **Step 1: `GlobalSettings` インターフェースに `defaultAccountId` を追加する**

[src/types/index.ts](src/types/index.ts) の `GlobalSettings` を以下に変更:

```typescript
export interface GlobalSettings {
  theme: "dark" | "light";
  customCSS: string;
  windowBounds: { x: number; y: number; width: number; height: number };
  defaultAccountId?: string;
}
```

- [ ] **Step 2: TypeScript コンパイルエラーがないか確認する**

```powershell
cd c:\Users\fuku\Desktop\twitter-viewer
npx tsc --noEmit
```

期待: エラーなし（`DEFAULT_GLOBAL_SETTINGS` はオプショナルフィールドなので変更不要）

- [ ] **Step 3: コミット**

```powershell
git add src/types/index.ts
git commit -m "feat: add defaultAccountId to GlobalSettings"
```

---

## Task 2: AccountManager にデフォルトアカウント設定UIを追加

**Files:**

- Modify: `src/components/AccountManager/AccountManager.tsx`
- Modify: `src/components/AccountManager/AccountManager.module.scss`

- [ ] **Step 1: AccountManager.tsx の props インターフェースに `defaultAccountId` と `onSetDefault` を追加する**

[src/components/AccountManager/AccountManager.tsx](src/components/AccountManager/AccountManager.tsx) 全体を以下に置き換え:

```typescript
import React from 'react';
import type { Account } from '../../types';
import styles from './AccountManager.module.scss';

interface AccountManagerProps {
  accounts: Account[];
  defaultAccountId?: string;
  onAddAccount: () => void;
  onRemoveAccount: (id: string) => void;
  onSetDefault: (id: string) => void;
  onClose: () => void;
}

export const AccountManager: React.FC<AccountManagerProps> = ({
  accounts,
  defaultAccountId,
  onAddAccount,
  onRemoveAccount,
  onSetDefault,
  onClose,
}) => {
  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <h2 className={styles.title}>アカウント管理</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="閉じる">✕</button>
        </div>

        <div className={styles.list}>
          {accounts.length === 0 && (
            <p className={styles.empty}>アカウントがありません</p>
          )}
          {accounts.map((account) => {
            const isDefault = account.id === defaultAccountId || (!defaultAccountId && accounts[0]?.id === account.id);
            return (
              <div key={account.id} className={styles.item}>
                <span
                  className={styles.dot}
                  style={{ backgroundColor: account.color }}
                />
                <span className={styles.label}>{account.label}</span>
                <button
                  className={`${styles.defaultBtn}${isDefault ? ` ${styles.defaultBtnActive}` : ''}`}
                  onClick={() => onSetDefault(account.id)}
                  title="ツイート時のデフォルトアカウントに設定"
                  aria-label={`${account.label} をデフォルトに設定`}
                >
                  {isDefault ? '★' : '☆'}
                </button>
                <button
                  className={styles.removeBtn}
                  onClick={() => onRemoveAccount(account.id)}
                  aria-label={`${account.label} を削除`}
                >
                  削除
                </button>
              </div>
            );
          })}
        </div>

        <button className={styles.addBtn} onClick={onAddAccount}>
          + アカウントを追加
        </button>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: AccountManager.module.scss に `defaultBtn` スタイルを追加する**

[src/components/AccountManager/AccountManager.module.scss](src/components/AccountManager/AccountManager.module.scss) の末尾（`.addBtn` の後）に追加:

```scss
.defaultBtn {
  background: none;
  border: none;
  color: #666;
  cursor: pointer;
  font-size: 16px;
  padding: 2px 6px;
  line-height: 1;
  &:hover {
    color: #e5c07b;
  }
}

.defaultBtnActive {
  color: #e5c07b;
}
```

- [ ] **Step 3: TypeScript コンパイルエラーがないか確認する**

```powershell
npx tsc --noEmit
```

期待: `App.tsx` で `onSetDefault` が渡されていないためエラーが出る（次のタスクで修正する）

- [ ] **Step 4: コミット**

```powershell
git add src/components/AccountManager/AccountManager.tsx src/components/AccountManager/AccountManager.module.scss
git commit -m "feat: add default account selector to AccountManager"
```

---

## Task 3: App.tsx に `handleComposeTweet` と `onSetDefault` を実装する

**Files:**

- Modify: `src/App.tsx`

- [ ] **Step 1: `handleComposeTweet` を App.tsx に追加し、AccountManager に `onSetDefault` を渡す**

[src/App.tsx](src/App.tsx) を以下の差分で修正する:

**`useAppStore` の destructuring に `globalSettings` と `updateGlobalSettings` を追加**（既存の行 `const { loadSettings, isLoaded, accounts, sidebarExpanded, setSidebarExpanded } = useAppStore();` を変更）:

```typescript
const {
  loadSettings,
  isLoaded,
  accounts,
  globalSettings,
  updateGlobalSettings,
  sidebarExpanded,
  setSidebarExpanded,
} = useAppStore();
```

**`handleApplySettings` の後（`if (!isLoaded)` の前）に追加**:

```typescript
const handleComposeTweet = useCallback(async () => {
  if (accounts.length === 0) return;
  const targetId = globalSettings.defaultAccountId ?? accounts[0].id;
  const account = accounts.find((a) => a.id === targetId) ?? accounts[0];
  await invoke("open_compose_window", {
    accountId: account.id,
    dataDirectory: account.dataDirectory,
  }).catch(console.error);
}, [accounts, globalSettings.defaultAccountId]);

const handleSetDefaultAccount = useCallback(
  (id: string) => {
    updateGlobalSettings({ defaultAccountId: id });
  },
  [updateGlobalSettings],
);
```

**`onComposeTweet={() => {}}` を `onComposeTweet={handleComposeTweet}` に変更**:

```typescript
onComposeTweet = { handleComposeTweet };
```

**`showAccountManager` の AccountManager レンダリング部分を変更**（`onSetDefault` と `defaultAccountId` を追加）:

```typescript
      {showAccountManager && (
        <AccountManager
          accounts={accounts}
          defaultAccountId={globalSettings.defaultAccountId}
          onAddAccount={startAddAccount}
          onRemoveAccount={removeAccount}
          onSetDefault={handleSetDefaultAccount}
          onClose={() => setShowAccountManager(false)}
        />
      )}
```

- [ ] **Step 2: TypeScript コンパイルエラーがないか確認する**

```powershell
npx tsc --noEmit
```

期待: エラーなし

- [ ] **Step 3: コミット**

```powershell
git add src/App.tsx
git commit -m "feat: implement handleComposeTweet and default account wiring in App.tsx"
```

---

## Task 4: Rust に `open_compose_window` コマンドを追加する

**Files:**

- Modify: `src-tauri/src/commands/webview.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: `open_compose_window` 関数を webview.rs の末尾に追加する**

[src-tauri/src/commands/webview.rs](src-tauri/src/commands/webview.rs) の `open_in_browser` 関数の後（ファイル末尾）に以下を追加:

```rust
#[tauri::command]
pub async fn open_compose_window(
    app: AppHandle,
    #[allow(non_snake_case)] accountId: String,
    #[allow(non_snake_case)] dataDirectory: String,
) -> Result<(), String> {
    let data_dir = std::path::PathBuf::from(&dataDirectory);

    let accounts_json = load_accounts_json(&app);
    let popup_init = crate::inject::build_popup_init_script(&accounts_json, &accountId);

    let compose_label = format!("compose-{}", uuid::Uuid::new_v4());

    const COMPOSE_WIDTH: f64 = 600.0;
    const COMPOSE_WINDOW_HEIGHT: f64 = 580.0; // コンテンツ 540px + ツールバー 40px

    let mut builder = tauri::WebviewWindowBuilder::new(
        &app,
        &compose_label,
        WebviewUrl::External(parse_url("https://x.com/compose/post")?),
    )
    .title("X - ツイート")
    .inner_size(COMPOSE_WIDTH, COMPOSE_WINDOW_HEIGHT)
    .initialization_script(&popup_init)
    .data_directory(data_dir);

    if let Some(window) = app.get_window("main") {
        if let (Ok(pos), Ok(size)) = (window.outer_position(), window.outer_size()) {
            let scale = window.scale_factor().unwrap_or(1.0);
            let center_x = pos.x as f64 + (size.width as f64 - COMPOSE_WIDTH * scale) / 2.0;
            let center_y = pos.y as f64 + (size.height as f64 - COMPOSE_WINDOW_HEIGHT * scale) / 2.0;
            builder = builder.position(center_x / scale, center_y / scale);
        }
    }

    builder.build().map_err(|e| e.to_string())?;

    Ok(())
}
```

- [ ] **Step 2: lib.rs の invoke_handler に `open_compose_window` を登録する**

[src-tauri/src/lib.rs](src-tauri/src/lib.rs) の `invoke_handler` リストに以下の1行を追加（`commands::account::close_window,` の後）:

```rust
            commands::webview::open_compose_window,
```

結果として invoke_handler は以下のようになる:

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
            commands::webview::open_compose_window,
        ])
```

- [ ] **Step 3: Rust ビルドエラーがないか確認する**

```powershell
cd c:\Users\fuku\Desktop\twitter-viewer\src-tauri
cargo check
```

期待: `warning` は出ても `error` はなし

- [ ] **Step 4: コミット**

```powershell
cd c:\Users\fuku\Desktop\twitter-viewer
git add src-tauri/src/commands/webview.rs src-tauri/src/lib.rs
git commit -m "feat: add open_compose_window Tauri command"
```

---

## Task 5: 動作確認

- [ ] **Step 1: アプリを起動する**

```powershell
cd c:\Users\fuku\Desktop\twitter-viewer
$env:Path += ";$env:USERPROFILE\.cargo\bin"
npm run tauri:dev
```

- [ ] **Step 2: アカウントが1件の状態でツイートボタンを押す**

期待: `https://x.com/compose/post` が 600×580px のポップアップで開く。ツールバーが上部に表示され、コンテンツと重ならない。

- [ ] **Step 3: アカウントが複数ある場合にツールバーのselectを別アカウントに切り替える**

期待: 同じ compose/post URL で別セッションのポップアップに切り替わる。

- [ ] **Step 4: AccountManager を開き、★ボタンでデフォルトアカウントを変更する**

期待: クリックした行の★が塗りつぶしになり、他の行は☆に戻る。

- [ ] **Step 5: ツイートボタンを押して、設定したデフォルトアカウントで開くことを確認する**

期待: ツールバーのselectの初期値が設定したアカウントになっている。

- [ ] **Step 6: デフォルトアカウントを削除してからツイートボタンを押す**

期待: エラーなく残りの accounts[0] のセッションでポップアップが開く。

- [ ] **Step 7: 最終コミット（問題なければ）**

```powershell
git add -p  # 未コミットの変更があれば
git commit -m "feat: compose tweet popup - manual verification complete"
```
