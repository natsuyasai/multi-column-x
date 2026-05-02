# Twitter Viewer アプリケーション設計書

**日付**: 2026-05-02  
**ステータス**: 承認済み  
**フェーズ**: INCEPTION - Application Design

---

## 概要

X（旧Twitter）専用デスクトップブラウザ。TweetDeck / XPro 風のマルチカラムレイアウトで複数アカウントを同時に表示する。Windows / Linux / macOS 対応（将来的にAndroid対応予定）。

---

## 技術スタック

| レイヤー | 技術 |
|---|---|
| デスクトップフレームワーク | Tauri v2 |
| フロントエンド | React 18 + TypeScript + Vite |
| スタイル | SCSS Modules |
| 設定永続化 | tauri-plugin-store（JSON） |
| WebView | Tauri Webview（システムWebView利用） |

---

## 全体アーキテクチャ

```
メインウィンドウ（Tauri Window）
├── Shell UI（React/TypeScript）
│   ├── カラムヘッダ（更新・設定・削除ボタン）
│   ├── カラム幅リサイズハンドル
│   ├── カラム追加ボタン
│   ├── アカウント管理ボタン
│   └── 設定パネル（カスタムCSS等）
│
└── カラム表示エリア
    ├── Webview[0]（x.com - Account A / フォロー中）
    ├── Webview[1]（x.com - Account B / 通知）
    └── Webview[N]...

Rustバックエンド（Tauri Commands）
├── create_column_webview(column: Column) -> Result
├── remove_column_webview(id: String) -> Result
├── resize_webview(id: String, bounds: Rect) -> Result
├── inject_script(id: String, script: String) -> Result
├── open_popup_window(url: String, account_id: String) -> Result
└── add_account() -> Result<Account>

ポップアップウィンドウ（WebviewWindow）
└── 画像・動画クリック時に別ウィンドウで表示

設定ストア（settings.json）
├── accounts: Account[]
├── columns: Column[]
└── globalSettings: GlobalSettings
```

---

## データモデル

### Account

```typescript
interface Account {
  id: string;           // UUID
  label: string;        // 表示名（例: "メインアカウント"）
  dataDirectory: string; // セッション保存先（AppData/accounts/account-{id}/）
  color: string;        // カラムヘッダの識別色
  createdAt: string;    // ISO8601
}
```

### Column

```typescript
type PageType = 'home' | 'notifications' | 'search' | 'list' | 'custom';

// ページタイプごとのURL解決
// home        → https://x.com/home
// notifications → https://x.com/notifications
// search      → https://x.com/search?q={searchQuery}
// list        → https://x.com/i/lists/{listId}
// custom      → customUrl をそのまま使用

interface Column {
  id: string;            // UUID
  accountId: string;     // 紐づくアカウントID
  pageType: PageType;    // ページ種別
  customUrl?: string;    // pageType === 'custom' の場合のURL
  homeTabName?: string;  // pageType === 'home' の場合のタブ名（例: "フォロー中"）
  searchQuery?: string;  // pageType === 'search' の場合の検索クエリ
  listId?: string;       // pageType === 'list' の場合のリストID
  width: number;         // カラム幅（px）
  order: number;         // 表示順
  label?: string;        // カラムのカスタム名
  settings: ColumnSettings;
}

interface ColumnSettings {
  autoReloadEnabled: boolean;
  autoReloadInterval: number; // 秒
  areaRemoveEnabled: boolean;
  customCSS: string;
}
```

### GlobalSettings

```typescript
interface GlobalSettings {
  theme: 'dark' | 'light';
  customCSS: string;       // 全カラム共通のカスタムCSS
  windowBounds: {
    x: number; y: number; width: number; height: number;
  };
}
```

---

## カラム・WebViewライフサイクル

### カラム追加フロー

1. ユーザーが「＋」ボタンをクリック
2. カラム設定ダイアログ表示（アカウント選択・ページタイプ選択・タブ名入力）
3. Rust: `create_column_webview(column)` を呼び出し
4. `WebviewBuilder` でWebViewを生成
   - `data_directory`: アカウントの `dataDirectory` を指定（セッション共有）
   - `bounds`: 現在のカラム配置から計算
   - `init_script`: 機能注入スクリプトをセット
5. `homeTabName` が設定されている場合、init_script内の `selectHomeTab()` が自動的にタブを選択
6. ストアに Column を追加・保存

### リサイズ対応

- ユーザーがカラム幅ハンドルをドラッグ → Shell UIがRust `resize_webview()` を呼び出し
- ウィンドウリサイズ時 → 全カラムのboundsを再計算して一括更新

### 起動時復元

- `settings.json` から Column[] を読み込み
- 各Columnに対してWebView生成フローを実行

---

## 機能注入（init_script）

WebView生成時に以下のスクリプトを注入する。既存の Chrome拡張機能 `D:\project\twitter-utils` のコードを流用。

### 1. 自動更新（auto-reload）

`src/content-scripts/auto-reload/` の AutoReload ロジックをTypeScript化してinit_scriptとして注入。
- `setInterval` でページをリロード
- スクロール中・非アクティブ時は停止
- 間隔設定はカラムごとにストア保存

### 2. 不要領域の非表示（area-remove）

`src/content-scripts/area-remove/AreaRemove.ts` のコメントアウト部分を有効化してinit_scriptとして注入。
- サイドバー非表示: `header[role='banner'] { display: none !important; }`
- 入力欄非表示: `div:has(> div[data-testid*="tweetTextarea"]) { display: none !important; }`
- `MutationObserver` でURL変化に追従
- カラムごとにON/OFF可能

### 3. カスタムCSS

init_scriptで `<style>` タグを挿入。グローバル設定またはカラムごとに指定可能。
初期版はアプリ再起動で反映（後の改善余地）。

### 4. 画像・動画ポップアップ

CORSの問題を回避するためiframeではなくTauri WebviewWindowを使用。

```typescript
// init_scriptで注入
document.addEventListener('click', (e) => {
  const link = (e.target as Element).closest('a[href*="x.com"]');
  if (isMediaLink(link)) {
    e.preventDefault();
    window.__TAURI__.invoke('open_popup', { url: link.href });
    // account_id はRust側でコマンド呼び出し元のWebview IDから自動解決する
    // Rustはwebview_id→column→accountIdのマッピングをメモリ上で管理する
  }
});
```

Rustは `open_popup` コマンド呼び出し元のWebview IDを使って、そのカラムに紐づくアカウントの `data_directory` を特定し、同セッションで新しいWebviewWindowを生成する。これにより認証済み状態でメディアページを表示できる。

### 5. タブ自動選択（homeTabName）

```typescript
function selectHomeTab(tabName: string) {
  const observer = new MutationObserver(() => {
    const tabs = document.querySelectorAll('[role="tab"]');
    const target = [...tabs].find(t => t.textContent?.includes(tabName));
    if (target) {
      (target as HTMLElement).click();
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 10000); // 10秒でタイムアウト
}
```

---

## アカウント管理

### 追加フロー

1. 「アカウント追加」ボタンをクリック
2. Rustが新規 `data_directory` を生成
3. `x.com/login` を開いたWebviewWindowを表示
4. ユーザーがX.comにログイン
5. URLが `x.com/home` に変わったことを検知して登録確認ダイアログを表示
6. Accountをストアに追加、ログインウィンドウを閉じる

### セッション分離

- 各アカウントは `AppData/com.twitter-viewer/accounts/account-{id}/` に独自のセッションデータを持つ
- 同アカウントを使う複数カラムは同一 `data_directory` を共有（ログイン状態が同期）
- 異なるアカウントは完全に分離されたセッションで同時表示可能
- アカウント削除時は `data_directory` ごと削除（ユーザー確認ダイアログを表示）

---

## 設定ファイルの保存先

```
AppData/com.twitter-viewer/
├── settings.json          # accounts・columns・globalSettings
└── accounts/
    ├── account-{uuid}/    # アカウントAのセッションデータ（クッキー等）
    └── account-{uuid}/    # アカウントBのセッションデータ
```

---

## 将来対応（スコープ外）

- Android対応: Tauri v2はAndroidをサポートするが、マルチWebviewのAndroid対応は別途検討が必要
- カスタムCSSのリアルタイムプレビュー
- カラムのドラッグ＆ドロップ並べ替え
- 通知バッジ（未読数）表示
