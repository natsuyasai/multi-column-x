# ツイート入力ポップアップ — 設計仕様

**日付:** 2026-05-03  
**ステータス:** 承認済み

---

## 概要

サイドバーの「✏️ ツイート」ボタンを押すと、設定済みのデフォルトアカウント（未設定の場合は登録順1番目）のセッションで `https://x.com/compose/post` をポップアップウィンドウとして表示する。ポップアップ内では既存の画像ポップアップと同じツールバーUIでアカウントを切り替えられる。AccountManager 画面でデフォルトアカウントを指定できる。

---

## アーキテクチャ

### データフロー

```
Sidebar: 「✏️ツイート」ボタン押下
  → App.tsx: handleComposeTweet()
    → globalSettings.defaultAccountId または accounts[0] を取得
    → invoke("open_compose_window", { accountId, dataDirectory })
      → Rust: open_compose_window()
        → load_accounts_json() でアカウント一覧取得
        → build_popup_init_script(accounts_json, account_id) でツールバーJS生成
        → WebviewWindowBuilder でウィンドウ作成
            URL:  https://x.com/compose/post
            size: 600 × 580px（コンテンツ 540px + ツールバー 40px）
            data_directory: 指定アカウントのディレクトリ

ツールバー上のアカウント切り替え（select 変更）
  → popup_toolbar.js: invoke("switch_popup_session", { ..., url: window.location.href })
    → Rust: switch_popup_session()（既存、変更不要）
      → 現ウィンドウをクローズ → 同位置・同サイズで新ウィンドウを開く
      → url は window.location.href = compose/post のまま維持される
```

### ウィンドウサイズ

| 定数 | 値 | 説明 |
|---|---|---|
| `COMPOSE_WIDTH` | 600px | ウィンドウ幅 |
| `COMPOSE_CONTENT_HEIGHT` | 540px | x.com コンテンツ領域の高さ |
| `TOOLBAR_HEIGHT` | 40px | popup_toolbar.js と一致（既存定数） |
| `COMPOSE_WINDOW_HEIGHT` | 580px | `COMPOSE_CONTENT_HEIGHT + TOOLBAR_HEIGHT` |

`body.paddingTop = 40px` は既存の `popup_toolbar.js` がそのまま適用するため、ツールバーとコンテンツが重ならない。

---

## 変更ファイル

| ファイル | 変更内容 |
|---|---|
| `src/types/index.ts` | `GlobalSettings` に `defaultAccountId?: string` を追加 |
| `src/components/AccountManager/AccountManager.tsx` | 各アカウント行に「デフォルト設定」ボタンを追加 |
| `src/App.tsx` | `handleComposeTweet` を実装、`onComposeTweet` に渡す |
| `src-tauri/src/commands/webview.rs` | `open_compose_window` コマンドを新設 |
| `src-tauri/src/commands/mod.rs` | `open_compose_window` を `pub use` |
| `src-tauri/src/lib.rs` | `open_compose_window` をコマンド登録 |

**変更しないファイル:**
- `src-tauri/src/inject/popup_toolbar.js` — 既存のまま流用
- `src-tauri/src/commands/webview.rs` の `switch_popup_session` — 既存のまま流用
- `src/store/useAppStore.ts` — `updateGlobalSettings` が既存のまま使える

---

## 各コンポーネントの詳細

### `GlobalSettings`（types/index.ts）

```typescript
export interface GlobalSettings {
  theme: 'dark' | 'light';
  customCSS: string;
  windowBounds: { x: number; y: number; width: number; height: number };
  defaultAccountId?: string;  // 追加
}
```

### `open_compose_window`（Rust コマンド）

```rust
#[tauri::command]
pub async fn open_compose_window(
    app: AppHandle,
    account_id: String,      // camelCase: accountId
    data_directory: String,  // camelCase: dataDirectory
) -> Result<(), String>
```

- `build_popup_init_script` を呼んでツールバーJS生成（`open_popup_window` と同じ呼び方）
- ウィンドウラベル: `compose-{uuid}`
- タイトル: `"X - ツイート"`
- サイズ: `600.0 × 580.0`
- メインウィンドウ中央に配置

### `AccountManager` のデフォルト選択UI

各アカウント行の右側に「★」ボタンを追加。
- 現在のデフォルトアカウントには塗りつぶし「★」を表示
- クリック時: `onSetDefault(account.id)` を呼ぶ
- `App.tsx` 側で `updateGlobalSettings({ defaultAccountId: id })` を実行

### `handleComposeTweet`（App.tsx）

```typescript
const handleComposeTweet = useCallback(async () => {
  const { accounts, globalSettings } = useAppStore.getState();
  if (accounts.length === 0) return;
  const targetId = globalSettings.defaultAccountId ?? accounts[0].id;
  const account = accounts.find(a => a.id === targetId) ?? accounts[0];
  await invoke('open_compose_window', {
    accountId: account.id,
    dataDirectory: account.dataDirectory,
  });
}, []);
```

---

## エラーハンドリング

- アカウントが0件の場合: `handleComposeTweet` は何もしない（accounts.length === 0 で early return）
- `defaultAccountId` が削除済みアカウントを指している場合: `accounts[0]` にフォールバック

---

## テスト方針

手動テスト:
1. アカウントが1件の状態でツイートボタンを押す → compose/post がポップアップ表示される
2. アカウントが複数の状態でツールバーのselectを切り替える → 同URLで別セッションに切り替わる
3. AccountManager でデフォルトアカウントを変更 → 次回ツイートボタン押下時に変更したアカウントで開く
4. デフォルトアカウントを削除 → accounts[0] にフォールバックしてポップアップが開く
