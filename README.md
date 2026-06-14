# Multi Column X

TweetDeck スタイルの Twitter/X デスクトップ・モバイルクライアント。複数アカウント・複数カラムを同時表示できる Tauri v2 製アプリ。

## 機能

- **マルチアカウント対応** — アカウントごとに独立したセッション（Cookie）を保持
- **カラムレイアウト** — ホーム・通知・検索・リスト・カスタム URL を任意の数だけ並べて表示
- **グリッドレイアウト** — `gridRow` / `gridCol` でカラムをマトリクス状に配置。列内での縦積みに対応
- **カラム設定** — 各カラムごとに自動更新間隔・ヘッダー非表示・カスタム CSS を設定可能
- **自動更新** — 設定した間隔で自動リロード。スクロール中は更新をスキップ
- **メディアポップアップ** — 画像・動画リンクを別ウィンドウで開く
- **リンクポップアップ** — 任意の URL を専用ウィンドウで開く
- **ツイート投稿ウィンドウ** — サイドバーからツイート作成ウィンドウを開く
- **ポップアップセッション切替** — ポップアップウィンドウのアカウントをその場で切り替え
- **カスタムコンテキストメニュー** — WebView 右クリックメニューを拡張
- **動画自動再生停止** — ページ読み込み時に動画の自動再生を停止
- **TopBar ナビゲーション** — 横方向ツールバーでカラム追加・アカウント管理・設定を操作（デスクトップ）
- **Android 対応** — モバイルタブバー UI でカラムを切り替え表示

## 技術スタック

| 層             | 技術                            |
| -------------- | ------------------------------- |
| フロントエンド | React 19 + TypeScript + Vite    |
| スタイル       | SCSS Modules                    |
| 状態管理       | Zustand                         |
| デスクトップ   | Tauri v2                        |
| 設定永続化     | tauri-plugin-store v2           |
| テスト         | Vitest + @testing-library/react |

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

# Android ビルド
npm run tauri:android:build
```

### テスト

```bash
npm test
```

## プロジェクト構成

```
multi-column-x/
├── src/                              # React フロントエンド
│   ├── main.tsx
│   ├── App.tsx                       # ルートコンポーネント・イベント配線
│   ├── types/index.ts                # 型定義（Column, Account, GlobalSettings 等）
│   ├── constants/ipc.ts              # IPC 定数（コマンド名・イベント名・ラベル・スクリプト）
│   ├── store/useAppStore.ts          # Zustand ストア（設定読み書き・状態管理）
│   ├── lib/
│   │   ├── gridLayout.ts             # グリッド座標計算（純粋関数・calculateGridBounds）
│   │   └── log.ts                    # 文脈名付きエラーロガー（plugin-log 連携）
│   ├── services/
│   │   └── columnWebview.ts          # カラム WebView への Tauri IPC 呼び出しを集約
│   ├── hooks/
│   │   ├── useColumns.ts             # カラム操作の公開 API（mobile/desktop 実装へ委譲）
│   │   ├── useMobileColumns.ts       # モバイル: アクティブカラム・スワイプ・起動時復元
│   │   ├── useDesktopColumns.ts      # デスクトップ: グリッド再配置・リサイズ監視
│   │   ├── useWebviewEvents.ts       # WebView 発のイベント listen（スクロール・新着数）
│   │   ├── useAccounts.ts            # アカウント追加・削除
│   │   ├── useAutoReload.ts          # 自動更新カウントダウン
│   │   ├── useDialogState.ts         # ダイアログ開閉状態管理
│   │   └── useKeyboardShortcuts.ts   # キーボードショートカット処理
│   └── components/
│       ├── ColumnHeader/             # カラムヘッダー（更新・設定・削除ボタン）
│       ├── AddColumnDialog/          # カラム追加ダイアログ
│       ├── AccountManager/           # アカウント管理ダイアログ
│       ├── SettingsPanel/            # カラム個別設定パネル
│       ├── AppSettingsPanel/         # アプリ全体設定
│       │   ├── ColumnLayoutTab.tsx   # グリッドレイアウト設定タブ
│       │   └── PresetsTab.tsx        # カラムプリセット管理タブ
│       ├── TopBar/                   # 横方向ツールバー（デスクトップ）
│       ├── MobileTabBar/             # モバイルタブバー（Android）
│       ├── TabActionDialog/          # モバイルタブ長押しアクションダイアログ
│       └── LinkPopupDialog/          # リンクポップアップ URL 入力ダイアログ
└── src-tauri/                        # Rust バックエンド
    ├── tauri.conf.json
    ├── Cargo.toml
    └── src/
        ├── lib.rs                    # Tauri ビルダー・コマンド登録・ウィンドウ位置復元
        ├── state.rs                  # WebView レジストリ（label → accountId / dataDir）
        ├── ipc_constants.rs          # IPC 定数（Rust 側）
        ├── android_bridge.rs         # JNI ブリッジ（Android WebView 操作）
        ├── commands/
        │   ├── settings.rs           # 設定の保存・読み込み（tauri-plugin-store）
        │   ├── settings_store.rs     # Rust 側の設定読み出しヘルパー（store 直接参照）
        │   ├── webview/
        │   │   ├── column.rs         # カラム WebView の作成・削除・リサイズ・URL 解決
        │   │   ├── popup.rs          # メディア/リンクポップアップ・セッション切替
        │   │   └── compose.rs        # ツイート作成ウィンドウ
        │   └── account.rs            # アカウントウィンドウ・ログイン検出（desktop/mobile 分岐）
        └── inject/                   # WebView に注入する JS
            ├── _src/                 # TypeScript ソース（Vite でバンドル → *.js に出力）
            │   ├── auto_reload.ts    # 自動更新
            │   ├── context_menu.ts   # カスタムコンテキストメニュー
            │   ├── custom_css.ts     # カスタム CSS 適用
            │   ├── header_customizer.ts / .tsx / .scss  # ヘッダー非表示
            │   ├── image_popup.ts    # メディアリンクをポップアップで開く
            │   ├── popup_toolbar.ts  # ポップアップツールバー（アカウント切替）
            │   ├── scroll_event.ts   # 横スクロールイベントを main WebView に中継
            │   ├── tab_selector.ts   # ホームタブ選択
            │   └── video_control.ts  # 動画自動再生停止
            ├── *.js                  # _src をビルドした成果物（gitignore 対象・直接編集禁止）
            └── mod.rs                # build_init_script / build_popup_init_script
```

Kotlin 層（Android）:

```
src-tauri/gen/android/app/src/main/java/com/natsuyasai/multicolumnx/
├── MainActivity.kt              # カラム/ポップアップ WebView 管理・バックボタン処理
├── DoubleTapGestureDetector.kt  # アクティブカラムのダブルタップ検出器
├── WebViewProfiles.kt           # WebView Profile API のサポート判定・適用
├── AddAccount.kt                # ログイン用 Activity（センチネルファイル書き込みで完了通知）
├── AppBridge.kt                 # Rust JNI 呼び出しの窓口
├── ThreadUtils.kt               # UI スレッド実行ヘルパー
└── UrlUtils.kt                  # URL ユーティリティ
```

## Tauri コマンド一覧

| コマンド                   | 説明                                                   |
| -------------------------- | ------------------------------------------------------ |
| `load_settings`            | 設定ファイルの読み込み                                 |
| `save_settings`            | 設定ファイルへの書き込み                               |
| `create_column_webview`    | カラム WebView の作成                                  |
| `remove_column_webview`    | カラム WebView の削除                                  |
| `resize_column_webview`    | カラム WebView のリサイズ・移動                        |
| `open_popup_window`        | メディアポップアップを開く                             |
| `open_link_popup_window`   | 任意 URL のリンクポップアップを開く                    |
| `close_popup_window`       | ポップアップを閉じる                                   |
| `switch_popup_session`     | ポップアップのアカウントを切り替え（ウィンドウ再作成） |
| `eval_in_webview`          | 指定 WebView で JS を評価                              |
| `report_webview_scroll`    | WebView からの横スクロールを main に中継               |
| `report_new_posts_count`   | カラムの新着投稿数を main WebView に中継               |
| `report_keyboard_shortcut` | inject から検出したキーボードショートカットを中継      |
| `get_mobile_insets`        | Android システム UI のインセット（ノッチ等）を取得     |
| `set_column_cookies`       | カラム WebView に Cookie を設定（Android）             |
| `open_in_browser`          | URL をシステムブラウザで開く                           |
| `open_compose_window`      | ツイート作成ウィンドウを開く                           |
| `open_add_account_window`  | アカウント追加ウィンドウを開く（ログイン検出付き）     |
| `delete_account_data`      | アカウントデータディレクトリを削除                     |
| `close_window`             | 指定ラベルのウィンドウ / WebView を閉じる              |

## アーキテクチャ上の注意点

### Tauri 子 WebView と z-index

Tauri v2 の `window.add_child()` で作成した子 WebView は OS ネイティブウィンドウのため、CSS の `z-index` が効かない。ダイアログ表示中は全カラム WebView を画面外（x: -9999）に退避し、閉じたときに座標を復元する。

### 外部 WebView での IPC 不可

x.com などの外部 URL を表示する WebView では `window.__TAURI__` が inject されないため、JS から Tauri コマンドを呼び出せない。ログイン完了の検出はデスクトップでは Rust 側の tokio タスクが URL を 500ms ごとにポーリングして行う。

### serde の camelCase / snake_case

Tauri v2 は JS → Rust の自動ケース変換を行わない。JS 側が camelCase で送るフィールドには `#[serde(rename = "camelCaseName")]` が必要。

### desktop / mobile 条件コンパイル

機能を `#[cfg(desktop)]` / `#[cfg(mobile)]` で分岐している。

- **desktop**: `window.add_child()` で子 WebView を作成。URL を 500ms ポーリングしてログイン完了を検出し `account-login-complete` イベントを emit する。
- **mobile (Android)**: カラム WebView はネイティブ Android WebView を content FrameLayout のオーバーレイとして JNI 経由（`android_bridge.rs` → `MainActivity.kt`）で生成する。アカウント追加はセンチネルファイル方式で、`AddAccount.kt` が `add_account_login_complete` ファイルを書き込み、`open_add_account_window` が tokio でポーリングしてブロックする。

### inject スクリプトのビルドフロー

`src-tauri/src/inject/_src/` に TypeScript / React ソースを置き、`vite.inject.config.ts` でバンドルして `src-tauri/src/inject/*.js` に出力する。`npm run tauri:dev` / `tauri:build` は前段で `build:inject` を実行するため、`_src` を変更したら再ビルドが必要。ビルド済み `.js` は管理対象外のため、直接作成編集は禁止。

### グリッドレイアウト

`Column.gridRow` / `Column.gridCol` でカラムをマトリクス状に配置する。同じ `gridCol` に複数カラムを配置すると縦積みになり、`heightMode`（`auto` / `fixed`）と `heightValue` / `heightUnit`（`px` / `%`）で各カラムの高さを制御する。`src/lib/gridLayout.ts` の `calculateGridBounds` が各カラムの絶対座標を計算して Rust に渡す。
