# プロジェクト構成

`src/`（React フロントエンド）・`src-tauri/`（Rust バックエンド）・Android Kotlin 層のファイル構成と役割。ファイルを追加・移動・削除したらこのノートも更新すること。

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
│   │   ├── gridLayout.contract.test.ts  # SCSS の寸法と gridLayout の rem 定数の一致を検証する契約テスト
│   │   ├── uiScale.ts                # アプリUI倍率の決定ロジック・rem→px 変換（詳細: ui-scale-notes.md）
│   │   ├── log.ts                    # 文脈名付きエラーロガー（plugin-log 連携）
│   │   ├── theme.ts                  # テーマ解決（ダーク/ライト/システム）
│   │   ├── reauthIdentity.ts         # 既存アカウント再認証時の同一アカウント判定
│   │   ├── apiRateLimit.ts           # API レート制限バケットの severity 判定
│   │   ├── rafThrottle.ts            # requestAnimationFrame 単位のスロットル
│   │   ├── githubRelease.ts          # GitHub Releases API 応答の解析（APK 自己更新のハッシュ取得等）
│   │   ├── updatePrompt.ts / version.ts  # 更新案内の要否・バージョン比較
│   │   ├── autoReloadTarget.ts       # 自動更新対象カラムの判定
│   │   ├── columnOrder.ts            # TopBar のカラム並び順計算
│   │   ├── linkPopupUrl.ts           # リンクポップアップ URL のスキーム補完
│   │   ├── ngWordPattern.ts          # NG ワードのマッチ判定
│   │   └── repostHiddenUserId.ts     # リポスト非表示ユーザー ID の正規化・検証
│   ├── services/
│   │   ├── columnWebview.ts          # カラム WebView への Tauri IPC 呼び出しを集約
│   │   ├── externalColumn.ts         # 外部 URL カラムのデータディレクトリ操作
│   │   └── updater.ts                # 自動アップデート（デスクトップ/Android）の IPC 呼び出し
│   ├── hooks/
│   │   ├── useColumns.ts             # カラム操作の公開 API（mobile/desktop 実装へ委譲）
│   │   ├── useMobileColumns.ts       # モバイル: アクティブカラム・スワイプ・起動時復元
│   │   ├── useDesktopColumns.ts      # デスクトップ: グリッド再配置・リサイズ監視
│   │   ├── useWebviewEvents.ts       # WebView 発のイベント listen（スクロール・新着数）
│   │   ├── useAccounts.ts            # アカウント追加・削除
│   │   ├── useAutoReload.ts          # 自動更新カウントダウン
│   │   ├── useAppUpdater.ts          # 自動アップデートの確認・進捗表示
│   │   ├── useWhatsNew.ts            # 更新後の What's New 表示
│   │   ├── useTheme.ts               # テーマ（ダーク/ライト/システム）切替
│   │   ├── useUiScale.ts             # アプリUI倍率を <html> の font-size へ反映（端末倍率の測定含む）
│   │   ├── useDialogState.ts         # ダイアログ開閉状態管理
│   │   ├── useEscapeKey.ts           # Esc キーでのダイアログ/ポップアップ閉じる処理
│   │   ├── useOutsideClick.ts        # 要素外クリック検出
│   │   └── useKeyboardShortcuts.ts   # キーボードショートカット処理
│   └── components/
│       ├── ColumnHeader/             # カラムヘッダー（更新・設定・削除ボタン）
│       ├── AddColumnDialog/          # カラム追加ダイアログ
│       ├── AccountManager/           # アカウント管理ダイアログ
│       ├── AccountNameDialog/        # アカウント名入力ダイアログ
│       ├── ApiRateLimitIndicator/    # API レート制限モニターのツールバー表示
│       ├── SettingsPanel/            # カラム個別設定パネル
│       ├── AppSettingsPanel/         # アプリ全体設定
│       │   ├── SettingsGroup.tsx     # 一般タブのグループ見出し（空なら非表示）
│       │   ├── ColumnLayoutTab.tsx   # グリッドレイアウト設定タブ
│       │   └── PresetsTab.tsx        # カラムプリセット管理タブ
│       ├── TopBar/                   # 横方向ツールバー（デスクトップ）
│       ├── MobileTabBar/             # モバイルタブバー（Android）
│       ├── TabActionDialog/          # モバイルタブ長押しアクションダイアログ
│       ├── LinkPopupDialog/          # リンクポップアップ URL 入力ダイアログ
│       ├── ConfirmDialog/            # 汎用確認ダイアログ
│       ├── HelpPopover/              # ヘルプ用ポップオーバー
│       ├── ShortcutHelpDialog/       # キーボードショートカット一覧ダイアログ
│       ├── UpdateDialog/             # アプリ更新確認・進捗ダイアログ
│       └── WhatsNewDialog/           # 更新後の What's New ダイアログ
└── src-tauri/                        # Rust バックエンド
    ├── tauri.conf.json
    ├── Cargo.toml
    └── src/
        ├── lib.rs                    # Tauri ビルダー・コマンド登録・ウィンドウ位置復元
        ├── state.rs                  # WebView レジストリ（label → accountId / dataDir）
        ├── ipc_constants.rs          # IPC 定数（Rust 側）
        ├── android_bridge.rs         # JNI ブリッジ（Android WebView 操作）
        ├── acl_contract.rs           # コマンドの capability(ACL) 許可漏れを検知する契約テスト
        ├── linux_codec_env.rs        # Linux のメディアコーデック（GStreamer 等）環境判定
        ├── video/                    # 動画ダウンロード（hls.rs=HLS/m3u8 処理, http.rs=HTTP I/O）
        ├── commands/
        │   ├── backup/               # バックアップ／リストア（format / restore / snapshot / file_io と Tauri コマンド）
        │   ├── settings.rs           # 設定の保存・読み込み（tauri-plugin-store）
        │   ├── settings_store.rs     # Rust 側の設定読み出しヘルパー（store 直接参照）
        │   ├── webview/
        │   │   ├── column.rs         # カラム WebView の作成・削除・リサイズ・URL 解決（Linux 配置・クリッピングを含む）
        │   │   ├── popup.rs          # メディア/リンクポップアップ・セッション切替
        │   │   └── compose.rs        # ツイート作成ウィンドウ
        │   ├── account.rs            # アカウントウィンドウ・ログイン検出・再認証（desktop/mobile 分岐）
        │   ├── update.rs             # Android APK 自己更新（呼び出し元制限・URL 許可リスト・SHA-256 検証）
        │   ├── media_codec.rs        # Linux AppImage のメディアコーデック対応状況判定
        │   ├── openh264_fetch.rs / openh264_http_client.rs  # Cisco OpenH264 ランタイムのダウンロード・有効化
        │   ├── arch_support.rs       # 対応アーキテクチャ（x86_64）の判定
        │   └── video_download.rs     # カラム上の動画ダウンロード（デスクトップ）
        └── inject/                   # WebView に注入する JS
            ├── _src/                 # TypeScript ソース（Vite でバンドル → *.js に出力）
            │   ├── auto_reload.ts    # 自動更新（新着数報告を含む）
            │   ├── api_rate_limit_monitor.ts # X内部APIのレート制限ヘッダ監視
            │   ├── blur_image.ts     # 画像ぼかし表示
            │   ├── compose_only.ts   # 投稿専用カラム（投稿フォーム以外をスポットライト非表示）
            │   ├── context_menu.ts   # カスタムコンテキストメニュー
            │   ├── custom_css.ts     # カスタム CSS 適用
            │   ├── dom_observer.ts   # DOM 変化監視を共有する単一 MutationObserver ハブ
            │   ├── header_customizer.ts / useHeaderCustomizer.ts / HeaderCustomizer.tsx  # ヘッダー非表示
            │   ├── hide_ad.ts        # 広告非表示
            │   ├── image_popup.ts    # メディアリンクをポップアップで開く
            │   ├── keyboard_shortcut.ts # ショートカットキーを main へ転送
            │   ├── mobile_area_hide.ts  # モバイル用の領域非表示
            │   ├── ng_word.ts / ng_word_matcher.ts  # NG ワードフィルタ
            │   ├── notification_header_hide.ts # 通知ページの設定ヘッダー非表示
            │   ├── popup_toolbar.ts  # ポップアップツールバー（アカウント切替）
            │   ├── popup_video_autoplay.ts # ポップアップ動画の自動再生
            │   ├── repost_hide_matcher.ts # 指定ユーザーのリポスト非表示判定
            │   ├── return_to_last_read.ts / return_to_last_read_logic.ts # 前回の境目へ戻るボタン・写真閲覧後の位置復元
            │   ├── scroll_event.ts   # 横スクロールイベントを main WebView に中継
            │   ├── sidebar_hide.ts   # x.com サイドバー非表示
            │   ├── small_image.ts    # 画像縮小表示
            │   ├── tab_selector.ts   # ホームタブ選択
            │   ├── video_control.ts  # 動画自動再生停止
            │   └── video_long_press_menu.ts # 動画の長押し/右クリックメニュー（ポップアップ表示・ダウンロード）
            ├── *.js                  # _src をビルドした成果物（gitignore 対象・直接編集禁止）
            └── mod.rs                # build_init_script / build_popup_init_script
```

Kotlin 層（Android）:

```
src-tauri/gen/android/app/src/main/java/com/natsuyasai/multicolumnx/
├── MainActivity.kt                  # カラム/ポップアップ WebView 管理・バックボタン処理
├── AddAccount.kt                    # ログイン用 Activity（センチネルファイル書き込みで完了通知）
├── ApiRateLimitBridge.kt            # APIレート制限ヘッダの JS ブリッジ
├── ApkHashVerifier.kt               # APK 自己更新の SHA-256 検証
├── AppBridge.kt                     # Rust JNI 呼び出しの窓口
├── BackupFileSelector.kt / MultiColumnXBackupAgent.kt  # Auto Backup 対象ファイルの選定
├── BridgeMessage.kt / BridgeOrigins.kt  # JS ブリッジのメッセージ形式・許可オリジン
├── ColumnWebViewUtils.kt            # カラム WebView 生成・操作ヘルパー
├── FileChooserUtils.kt              # ファイル選択ダイアログ処理
├── PopupSessionBridge.kt            # ポップアップのセッション切替ブリッジ
├── ReauthUtils.kt                   # 既存アカウント再認証ヘルパー
├── SwipeBarOverlayView.kt / SwipeGestureResolver.kt  # スワイプ切替バーの描画・ジェスチャー判定
├── ThreadUtils.kt                   # UI スレッド実行ヘルパー
├── TwidUtils.kt                     # X ユーザー ID 抽出ユーティリティ
├── UrlUtils.kt                      # URL ユーティリティ
├── VideoDownloadForegroundService.kt / VideoDownloadRequestBridge.kt  # 動画ダウンロード（フォアグラウンドサービス）
└── WebViewProfiles.kt               # WebView Profile API のサポート判定・適用
```

## 設定画面（AppSettingsPanel）の一般タブ構成

一般タブは `SettingsGroup`（`h2` 見出し + 子要素）で次の 6 グループに分かれる。順序は上から下。

| #   | グループ             | 中身                                                                          | 出し分け                                                                                                          |
| --- | -------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1   | 表示                 | アプリUIの表示サイズ・カラム内の表示サイズ・テーマ                            | 全環境                                                                                                            |
| 2   | 新規カラムの既定値   | 自動更新・ヘッダー非表示等の既定値と一括適用                                  | 全環境                                                                                                            |
| 3   | 閲覧・フィルタ       | NG ワード・リポスト非表示ユーザー・広告・API残量モニター                      | 全環境                                                                                                            |
| 4   | メディア             | 動画設定 / ポップアップウィンドウ / 動画再生(Linux)                           | ポップアップ = desktop のみ、動画再生(Linux) = Linux デスクトップのみ（`isLinux && !isMobile`）、動画設定は全環境 |
| 5   | Android専用          | ツイート（X アプリ起動）・スワイプ切替・複数カラム表示                        | mobile のみ                                                                                                       |
| 6   | アプリ・メンテナンス | バージョン・更新確認・X 公式設定・全 WebView 再生成・データフォルダ削除再実行 | 全環境                                                                                                            |

- 子要素が 0 件のグループは `SettingsGroup` が見出しごと描画しない（環境によって中身が空になっても見出しだけ残らない）。
- `isMobile` は `useAppStore`、`isLinux` は `App.tsx` が `platform()` から導出して props で渡す。
- Windows / macOS 専用項目は現状無いため `isWindows` / `isMac` 判定は追加していない。追加するときは `App.tsx` の `isLinux` と同様に `platform()` で導出して props に渡す。
- Storybook の `MobileGroups` 系 Story はストアの `isMobile` を一時的に true にしてモバイル構成を確認できる。
