# Twitter Viewer

TweetDeck スタイルの Twitter/X デスクトップクライアント。複数アカウント・複数カラムを同時表示できる Tauri v2 製アプリ。

## 機能

- **マルチアカウント対応** — アカウントごとに独立したセッション（Cookie）を保持
- **カラムレイアウト** — ホーム・通知・検索・リスト・カスタム URL を任意の数だけ並べて表示
- **カラム設定** — 各カラムごとに自動更新間隔・ヘッダー非表示・カスタム CSS を設定可能
- **自動更新** — スクロール中は更新をスキップ
- **メディアポップアップ** — 画像・動画リンクを別ウィンドウで開く

## 技術スタック

| 層 | 技術 |
|---|---|
| フロントエンド | React 19 + TypeScript + Vite |
| スタイル | SCSS Modules |
| 状態管理 | Zustand |
| デスクトップ | Tauri v2 |
| 設定永続化 | tauri-plugin-store v2 |
| テスト | Vitest + @testing-library/react |

## 開発環境のセットアップ

### 必要なもの

- [Node.js](https://nodejs.org/) 18 以上
- [Rust](https://rustup.rs/) / Cargo
- [Tauri の前提条件](https://tauri.app/start/prerequisites/)（WebView2 など）

Rust をインストールした後、Cargo を PATH に追加：

```powershell
# PowerShell (永続設定)
[Environment]::SetEnvironmentVariable(
  "PATH",
  "$env:USERPROFILE\.cargo\bin;" + [Environment]::GetEnvironmentVariable("PATH", "User"),
  "User"
)
```

### インストール

```bash
npm install
```

### 起動

```bash
npm run tauri:dev
```

### ビルド

```bash
# リリースビルド
npm run tauri:build

# デバッグビルド
npm run tauri:build:debug
```

### テスト

```bash
npm test
```

## プロジェクト構成

```
twitter-viewer/
├── src/                        # React フロントエンド
│   ├── main.tsx
│   ├── App.tsx
│   ├── types/index.ts          # 型定義
│   ├── store/useAppStore.ts    # Zustand ストア
│   ├── hooks/
│   │   ├── useColumns.ts       # カラム操作・WebView 管理
│   │   └── useAccounts.ts      # アカウント追加・削除
│   └── components/
│       ├── ColumnHeader/       # カラムヘッダー（更新・設定・削除ボタン）
│       ├── AddColumnDialog/    # カラム追加ダイアログ
│       ├── AccountManager/     # アカウント管理ダイアログ
│       └── SettingsPanel/      # カラム設定パネル
└── src-tauri/                  # Rust バックエンド
    ├── tauri.conf.json
    └── src/
        ├── lib.rs              # Tauri ビルダー・コマンド登録
        ├── state.rs            # WebView レジストリ
        ├── commands/
        │   ├── settings.rs     # 設定の保存・読み込み
        │   ├── webview.rs      # WebView の作成・削除・リサイズ
        │   └── account.rs      # アカウントウィンドウ・ログイン検出
        └── inject/             # WebView に注入する JS
            ├── area_remove.js  # ヘッダー・投稿欄の非表示
            ├── auto_reload.js  # 自動更新
            ├── custom_css.js   # カスタム CSS 適用
            ├── image_popup.js  # メディアリンクをポップアップで開く
            └── tab_selector.js # ホームタブ選択
```

## アーキテクチャ上の注意点

### Tauri 子 WebView と z-index

Tauri v2 の `window.add_child()` で作成した子 WebView は OS ネイティブウィンドウのため、CSS の `z-index` が効かない。ダイアログ表示中は全カラム WebView を画面外（x: -9999）に退避し、閉じたときに座標を復元する。

### 外部 WebView での IPC 不可

x.com などの外部 URL を表示する WebView では `window.__TAURI__` が inject されないため、JS から Tauri コマンドを呼び出せない。ログイン完了の検出は Rust 側の tokio タスクが URL を 500ms ごとにポーリングして行う。

### serde の camelCase / snake_case

Tauri v2 は JS → Rust の自動ケース変換を行わない。JS 側が camelCase で送るフィールドには `#[serde(rename = "camelCaseName")]` が必要。
