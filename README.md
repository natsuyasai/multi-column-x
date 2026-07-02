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
- **ツイート投稿ウィンドウ** — TopBar / モバイルタブバーからツイート作成ウィンドウを開く
- **ポップアップセッション切替** — ポップアップウィンドウのアカウントをその場で切り替え
- **カスタムコンテキストメニュー** — WebView 右クリックメニューを拡張
- **動画自動再生停止** — ページ読み込み時に動画の自動再生を停止
- **NG ワード** — カラム別・グローバルの NG ワードでタイムラインをフィルタ
- **画像の縮小・ぼかし表示 / 広告非表示** — カラムごとのタイムライン表示調整
- **新着バッジ・デスクトップ通知** — カラムごとの新着件数バッジ、通知カラムのデスクトップ通知
- **キーボードショートカット** — 投稿・カラム追加・カラム 1-9 ジャンプなど（カラム WebView フォーカス中も有効）
- **テーマ切替** — ダーク / ライト / システム連動
- **プリセット** — カラム構成の保存・切り替え（デスクトップ）
- **TopBar ナビゲーション** — 横方向ツールバーでカラム追加・アカウント管理・設定を操作（デスクトップ）
- **自動アップデート** — GitHub Releases からの更新確認・適用と What's New 表示（デスクトップ / Android APK）
- **クラッシュ自動復旧** — Linux の WebProcess クラッシュを検知してカラム WebView を自動再生成
- **Android 対応** — モバイルタブバー UI・スワイプバーでカラムを切り替え表示

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

### テスト・品質チェック

```bash
npm test                 # Vitest 単体テスト
npm run test:property    # fast-check プロパティテスト
npm run test:story       # Storybook play function（chromium）
npm run lint             # ESLint
npm run typecheck        # tsc --noEmit
npm run lint:rust        # cargo clippy（-D warnings）
cd src-tauri && cargo test   # Rust 単体テスト
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
            │   ├── auto_reload.ts    # 自動更新（新着数報告を含む）
            │   ├── blur_image.ts     # 画像ぼかし表示
            │   ├── context_menu.ts   # カスタムコンテキストメニュー
            │   ├── custom_css.ts     # カスタム CSS 適用
            │   ├── header_customizer.ts / useHeaderCustomizer.ts  # ヘッダー非表示
            │   ├── hide_ad.ts        # 広告非表示
            │   ├── image_popup.ts    # メディアリンクをポップアップで開く
            │   ├── keyboard_shortcut.ts # ショートカットキーを main へ転送
            │   ├── mobile_area_hide.ts  # モバイル用の領域非表示
            │   ├── ng_word.ts        # NG ワードフィルタ
            │   ├── popup_toolbar.ts  # ポップアップツールバー（アカウント切替）
            │   ├── popup_video_autoplay.ts # ポップアップ動画の自動再生
            │   ├── scroll_event.ts   # 横スクロールイベントを main WebView に中継
            │   ├── scroll_pos_restore.ts # 写真閲覧後のスクロール位置復元
            │   ├── sidebar_hide.ts   # x.com サイドバー非表示
            │   ├── small_image.ts    # 画像縮小表示
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
├── PopupGestureBlock.kt         # ポップアップ表示中のジェスチャー抑止
├── PopupSessionBridge.kt        # ポップアップのセッション切替ブリッジ
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
| `install_apk_update`       | APK をダウンロードしてインストーラを起動（Android）    |

## アーキテクチャ上の注意点

### Tauri 子 WebView と z-index

Tauri v2 の `window.add_child()` で作成した子 WebView は OS ネイティブウィンドウのため、CSS の `z-index` が効かない。ダイアログ表示中は全カラム WebView を画面外（x: -9999）に退避し、閉じたときに座標を復元する。

### 外部 WebView への IPC 注入（remote capability）

x.com などの外部 URL を表示するカラム / ポップアップ WebView には、`src-tauri/capabilities/column-webview.json` の `remote` 設定によって IPC（`window.__TAURI__`）が注入される。inject スクリプト（新着数報告・横スクロール中継・メディアポップアップ等）はこの IPC を通じて Tauri コマンドを invoke する。リモートページにアプリのコマンドを開放する設定であるため、`remote.urls` の対象ドメインは必要最小限に保つこと。

なお、ログイン完了の検出だけは IPC ではなく、デスクトップでは Rust 側の tokio タスクが URL を 500ms ごとにポーリングして行う（ログイン画面の遷移を JS 注入に依存させないため）。

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

### Linux カラム WebView の配置・クリッピング仕様

Windows / macOS ではカラムは `window.add_child()` の子 WebView で、親ウィンドウのクライアント領域によって自動的にクリップされる。一方 **Linux ではカラムが独立した `WebviewWindow`（OS ネイティブウィンドウ）** のため親クリップが効かず、横スクロールで画面端にはみ出すカラムの表示を Rust 側の座標計算で明示的に制御する。このロジックは `resize_column_webview`（`src-tauri/src/commands/webview/column.rs`）の純粋関数 `linux_column_layout` に集約されている。

仕様（横スクロール時の各カラムの可視領域）:

- **ウィンドウは常に画面内（論理 X 座標 `>= 0`）に配置する**。Linux の WM はウィンドウ X 座標を画面内へクランプするため、負の座標を指定して「スクリーン左端で自然クリップ」させる方式は機能しない（左端カラムが全幅のまま左端に居座り、完全に画面外になるまで縮まないデグレードを引き起こす）。
- **左右対称の「幅クリップ」**: 画面端にはみ出したカラムは、はみ出した分だけ幅を縮めて表示する（左端・右端とも同じ挙動）。可視領域は `left = max(0, x)` 〜 `right = min(x + width, ウィンドウ幅)` で求め、幅 `right - left` で配置する。
- **完全に画面外**（`x + width <= 0` または `x >= ウィンドウ幅`）のカラムは `hide()` する。
- **起動時は `visible(false)` で非表示作成**し、全カラム作成後に `recalculateAllBounds`（→ `resize_column_webview`）で WM が確定した座標へ配置してから `show()` する。WM がウィンドウ位置を確定する前に誤った座標で可視化すると WebKit WebProcess が不正状態で起動し、カラムが空白になる。

`linux_column_layout` は純粋関数として example テストとプロパティテスト（`x_offset >= 0` など WM クランプ回避の不変条件）で仕様を固定している。**このクリッピング挙動を変更する場合は、必ず `linux_column_layout` のテストで仕様を表現してから実装すること**（過去にインライン実装のままテストなしで挙動が変わりデグレードした経緯がある）。

#### WebProcess クラッシュ対策（横スクロール・スリープ復帰）

Linux の独立 `WebviewWindow` は WebKitGTK の WebProcess で描画されるが、(1) 横スクロールで `resize_column_webview` が高頻度に連続発火したとき、(2) スリープ復帰後などに、WebProcess がクラッシュして白画面/フリーズになることがある。次の3層で予防と復旧を行う:

- **予防（スクロール）**: スクロールバー操作 → 全カラム再配置を `rafThrottle`（`src/lib/rafThrottle.ts`）で 1 フレーム 1 回に間引き、`resize_column_webview` の連続発火を抑える（`useDesktopColumns.handleScrollbarScroll`）。
- **自動復旧**: カラム作成時に webkit2gtk の `connect_web_process_terminated` を接続し、クラッシュ時に `column-webview-crashed`（payload=columnId）を emit する。TS 側 `useColumnCrashRecovery` が当該カラムを再生成して自動復旧する（同一カラムは `CRASH_RECOVERY_COOLDOWN_MS` 秒のクールダウンでクラッシュループを防止）。
- **手動復旧**: カラムヘッダの「⟳ ページを再読み込み」ボタンはデスクトップでは `location.reload` ではなく WebView 自体の再生成（`recreateColumnWebview`）を行い、`location.reload` が効かない白画面からも復旧できる。モバイル（Android ネイティブ WebView）は従来どおりページ再読み込み。

webkit2gtk は wry と同一バージョン（`=2.0.2`, `v2_40`）を `[target.'cfg(target_os = "linux")'.dependencies]` でピン留めする（`PlatformWebview::inner()` の戻り型を一致させるため）。
