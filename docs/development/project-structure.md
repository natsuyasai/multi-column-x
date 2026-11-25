# プロジェクト構成

`src/`（React フロントエンド）・`src-tauri/`（Rust バックエンド）・Android Kotlin 層のファイル構成と役割。ファイルを追加・移動・削除したらこのノートも更新すること。

```
multi-column-x/
├── src/                              # React フロントエンド
│   ├── main.tsx
│   ├── App.tsx                       # ルートコンポーネント・イベント配線
│   ├── types/index.ts                # 型定義（Column, Account, GlobalSettings 等）
│   ├── index.css                     # 配色トークン（--mcx-*）・テーマ別 CSS 変数
│   ├── styles/
│   │   ├── _dialog-fullscreen.scss   # パネル型ダイアログを Android で全画面化するミキシン（詳細: ui-scale-notes.md）
│   │   ├── _dialog-modal.scss        # ネイティブ <dialog> を .overlay として使うためのミキシン modal-overlay（UA 既定の打ち消し。詳細: ui-design-principles-notes.md §7）
│   │   ├── _tokens.scss              # UI 共通デザイントークン（SCSS 変数: space / radius / font-size / duration / tap-target。詳細: ui-design-principles-notes.md）
│   │   └── _mixins.scss              # focus-ring / transition-base / android-tap-target / android-button-gap
│   ├── i18n/                         # 多言語対応の初期化（index.ts=i18next 初期化, resources.ts=辞書の集約, types.ts=AppTFunction 型。詳細: i18n-notes.md）
│   ├── locales/{ja,en}/              # 画面文言の辞書（名前空間ごとの JSON。ja と en でキー集合を一致させる）
│   ├── test-utils/
│   │   ├── japanese.ts               # 英語表示で日本語が残っていないことを検査するテスト用ヘルパー（expectNoJapanese）
│   │   ├── scssBlocks.ts             # SCSS をセレクタ・宣言・include のブロックへ分解する最小パーサと *.module.scss の列挙（契約テスト用）
│   │   ├── uiDesignRules.ts          # UI デザイン原則の検査ルール（checkGrid 等）と例外定数 GRID_EXEMPT / ANDROID_TAP_EXEMPT
│   │   ├── a11y.ts                   # 操作要素がアクセシブルネームを持つことを検査する（expectAccessibleControls）
│   │   ├── tapTargets.ts             # Story 用: Android の当たり判定・隣接ボタン間隔の実測と data-platform の切替
│   │   └── storyTheme.ts             # Story 用: テーマ変数（installThemeTokens）と border-box リセット（installAppReset）の差し込み
│   ├── constants/
│   │   ├── ipc.ts                    # IPC 定数（コマンド名・イベント名・ラベル・スクリプト）
│   │   ├── accountColors.ts          # アカウント識別色のパレット
│   │   └── apiRateLimitLabels.ts     # API レート制限モニターの bucketKey と辞書ラベルの対応表
│   ├── store/useAppStore.ts          # Zustand ストア（設定読み書き・状態管理）
│   ├── lib/
│   │   ├── gridLayout.ts             # グリッド座標計算（純粋関数・calculateGridBounds）
│   │   ├── gridLayout.contract.test.ts  # SCSS の寸法と gridLayout の rem 定数の一致を検証する契約テスト
│   │   ├── uiDesign.contract.test.ts # 全 *.module.scss が UI デザイン原則（余白・文字・動き・状態・枠色・Android 当たり判定）を満たすことを検証する契約テスト
│   │   ├── androidBackHandler.ts     # Android の戻る操作のハンドラ登録簿と `window.__mcxHandleBack` ブリッジ（詳細: settings-panel-navigation-notes.md）
│   │   ├── tabListKeyboard.ts        # タブ列・サイドナビの矢印 / Home / End の移動先計算（純粋関数 nextTabIndex）
│   │   ├── uiScale.ts                # アプリUI倍率の決定ロジック・rem→px 変換（詳細: ui-scale-notes.md）
│   │   ├── log.ts                    # 文脈名付きエラーロガー（plugin-log 連携）
│   │   ├── appError.ts               # Rust の AppError（種別コード＋詳細）の判定と翻訳（describeAppError）
│   │   ├── language.ts               # 表示言語設定（auto/ja/en）の正規化と OS 言語からの解決
│   │   ├── backupRestore.ts          # バックアップ復元ロジック（紐づけ候補・件数集計・accountId 差し替え・エラー文言。純粋関数）
│   │   ├── extensionsSupport.ts      # ブラウザ拡張機能に対応する環境（Windows デスクトップ）の判定
│   │   ├── contrast.ts               # 色のコントラスト比計算（配色トークンの契約テスト用）
│   │   ├── lineListValidation.ts     # 行リスト入力（NG ワード・ホワイトリスト・リポスト非表示ユーザー）の parse / 検証
│   │   ├── scrollRestoreSetting.ts   # 画像縮小表示の切替に連動するスクロール位置復元設定の算出
│   │   ├── theme.ts                  # テーマ解決（ダーク/ライト/システム）
│   │   ├── reauthIdentity.ts         # 既存アカウント再認証時の同一アカウント判定
│   │   ├── apiRateLimit.ts           # API レート制限バケットの severity 判定
│   │   ├── rafThrottle.ts            # requestAnimationFrame 単位のスロットル
│   │   ├── githubRelease.ts          # GitHub Releases API 応答の解析（APK 自己更新のハッシュ取得、更新後ダイアログのリリースノート選別等）
│   │   ├── updatePrompt.ts / version.ts  # 更新案内の要否・バージョン比較
│   │   ├── autoReloadTarget.ts       # 自動更新対象カラムの判定
│   │   ├── columnOrder.ts            # TopBar のカラム並び順計算
│   │   ├── linkPopupUrl.ts           # リンクポップアップ URL のスキーム補完
│   │   ├── ngWordPattern.ts          # NG ワードのマッチ判定
│   │   └── repostHiddenUserId.ts     # リポスト非表示ユーザー ID の正規化・検証
│   ├── services/
│   │   ├── columnWebview.ts          # カラム WebView への Tauri IPC 呼び出しを集約
│   │   ├── externalColumn.ts         # 外部 URL カラムのデータディレクトリ操作
│   │   ├── mediaPopup.ts             # モバイルの複数カラム表示フラグ（メディアのポップアップ可否）をネイティブへ同期
│   │   ├── backup.ts                 # バックアップの書き出し・読み込み・復元の IPC 呼び出し
│   │   ├── extensions.ts             # ブラウザ拡張機能（Windows のみ）の管理コマンドの IPC 呼び出し
│   │   ├── releasePage.ts            # リリース一覧ページを既定ブラウザで開く（固定 URL。opener プラグイン）
│   │   └── updater.ts                # 自動アップデート（デスクトップ/Android）の IPC 呼び出し
│   ├── hooks/
│   │   ├── useColumns.ts             # カラム操作の公開 API（mobile/desktop 実装へ委譲）
│   │   ├── useMobileColumns.ts       # モバイル: アクティブカラム・スワイプ・起動時復元
│   │   ├── useDesktopColumns.ts      # デスクトップ: グリッド再配置・リサイズ監視
│   │   ├── useAndroidBackHandler.ts  # Android の戻る操作のハンドラ登録フック（enabled の間だけ登録）
│   │   ├── useTabListKeyboard.ts     # タブ列・サイドナビの矢印 / Home / End キー移動（`lib/tabListKeyboard.ts` の純粋関数を使う）
│   │   ├── useWebviewEvents.ts       # WebView 発のイベント listen（スクロール・新着数）
│   │   ├── useAppBootstrap.ts        # 起動時の初期化（プラットフォーム検出→設定ロード→カラム復元→表示サイズ適用）
│   │   ├── useAppLanguage.ts         # 表示言語を i18next と <html lang> へ反映
│   │   ├── useBackupFlow.ts          # バックアップタブの操作の流れ（書き出し／読み込み→紐づけ→確認→復元）
│   │   ├── useColumnNavigation.ts    # カラムへのジャンプ・スクロールバー追従・手動更新・フォーカスカラム状態
│   │   ├── useH264Setup.ts           # Linux の OpenH264 ランタイム取得・有効化の状態管理
│   │   ├── useMobileSwipeBarSync.ts  # モバイルのスワイプバー（ネイティブオーバーレイ）状態を Kotlin 側へ同期
│   │   ├── usePlatformAttribute.ts   # <html> に data-platform（android/desktop）を付与
│   │   ├── usePopupWindowHandlers.ts # リンクポップアップ・公式設定ポップアップ・投稿ウィンドウの起動処理
│   │   ├── useSettingsApplyHandlers.ts # カラム個別設定・全体設定の「適用」処理
│   │   ├── useAccounts.ts            # アカウント追加・削除
│   │   ├── useAutoReload.ts          # 自動更新カウントダウン
│   │   ├── useAppUpdater.ts          # 自動アップデートの確認・進捗表示
│   │   ├── useWhatsNew.ts            # 更新後に前回から今回までのリリースノート（最大3件）を表示
│   │   ├── useTheme.ts               # テーマ（ダーク/ライト/システム）切替
│   │   ├── useUiScale.ts             # アプリUI倍率を <html> の font-size へ反映（端末倍率の測定含む）
│   │   ├── useDialogState.ts         # ダイアログ開閉状態管理
│   │   ├── useEscapeKey.ts           # document の Esc keydown を購読する（ダイアログ外の非モーダル部品用。モーダルダイアログの Esc は ModalDialog が処理する）
│   │   ├── useRestoreFocus.ts        # ダイアログを閉じたときに開く前の要素へフォーカスを戻す（ModalDialog が呼ぶ）
│   │   ├── useOutsideClick.ts        # 要素外クリック検出
│   │   └── useKeyboardShortcuts.ts   # キーボードショートカット処理
│   └── components/
│       ├── ColumnHeader/             # カラムヘッダー（更新・設定・削除ボタン）
│       ├── AddColumnDialog/          # カラム追加ダイアログ
│       ├── AccountManager/           # アカウント管理ダイアログ
│       ├── AccountNameDialog/        # アカウント名入力ダイアログ
│       ├── StatusMark/               # 成功・警告・選択中を色だけで伝えないための記号（✓ / ⚠）
│       ├── ApiRateLimitIndicator/    # API レート制限モニターのツールバー表示
│       ├── SettingsPanel/            # カラム個別設定パネル（SettingsSections.tsx=セクション部品, columnSettingsTabs.ts=タブ定義（基本 / 表示 / フィルタ / カスタム CSS。外部サイトカラムはタブ無し）, lineListInputs.ts=行リスト入力の parse / 検証）
│       ├── AppSettingsPanel/         # アプリ全体設定
│       │   ├── settingsCategories.ts # カテゴリ定義・分類・表示条件・下書きキー割当（DRAFT_KEY_CATEGORY）・未適用判定（純粋関数）
│       │   ├── SettingsCategoryNav.tsx  # デスクトップ用サイドナビ（分類見出し＋カテゴリボタン、未適用 / エラーの印）
│       │   ├── SettingsCategoryList.tsx # Android 用カテゴリ一覧（一覧→詳細の 2 階層の一覧側）
│       │   ├── DisplaySettingsSection.tsx / ColumnDefaultsSections.tsx / GeneralSettingsSections.tsx / AppInfoSections.tsx  # 各カテゴリのセクション（AppInfoSections=X公式設定・メンテナンス・このアプリについて）
│       │   ├── LinuxVideoPlaybackSection.tsx # 動画再生（Linux の H.264 有効化）セクション
│       │   ├── ColumnLayoutTab.tsx / ColumnLayoutParts.tsx  # グリッドレイアウト設定タブ（Parts=並べ替え部品）
│       │   ├── PresetsTab.tsx        # カラムプリセット管理タブ
│       │   ├── BackupTab.tsx         # バックアップ／リストアタブ
│       │   ├── ExtensionsTab.tsx     # ブラウザ拡張機能タブ（Windows のみ）
│       │   ├── settingsDraft.ts      # 設定画面の draft 型と変換（純粋関数）
│       │   └── columnLayoutDraft.ts  # ColumnLayoutTab の draft 操作（純粋関数）
│       ├── TopBar/                   # 横方向ツールバー（デスクトップ。SortableColumnGroups.tsx=dnd-kit による並び替え, columnDisplay.tsx=カラム表示名・アイコン）
│       ├── H264SetupDialog/          # Linux の H.264 コーデック取得ダイアログ
│       ├── NoAccountsPrompt/         # アカウント未登録時にアカウント管理へ誘導する案内
│       ├── MobileTabBar/             # モバイルタブバー（Android）
│       ├── TabActionDialog/          # モバイルタブ長押しアクションダイアログ
│       ├── LinkPopupDialog/          # リンクポップアップ URL 入力ダイアログ
│       ├── ModalDialog/              # モーダルダイアログ共通部品（ネイティブ <dialog> + showModal()。Tab の折り返し・Esc・初期フォーカス data-autofocus・フォーカス復帰。モーダルは必ずこれで作る）
│       ├── ConfirmDialog/            # 汎用確認ダイアログ
│       ├── HelpPopover/              # ヘルプ用ポップオーバー
│       ├── ShortcutHelpDialog/       # キーボードショートカット一覧ダイアログ
│       ├── UpdateDialog/             # アプリ更新確認・進捗ダイアログ
│       └── WhatsNewDialog/           # 更新後の What's New ダイアログ（複数バージョン・リリースページへのリンク）
└── src-tauri/                        # Rust バックエンド
    ├── tauri.conf.json
    ├── Cargo.toml
    └── src/
        ├── lib.rs                    # Tauri ビルダー・コマンド登録・ウィンドウ位置復元
        ├── state.rs                  # WebView レジストリ（label → accountId / dataDir）
        ├── ipc_constants.rs          # IPC 定数（Rust 側）
        ├── android_bridge.rs         # JNI ブリッジ（Android WebView 操作）
        ├── acl_contract.rs           # コマンドの capability(ACL) 許可漏れを検知する契約テスト
        ├── log_language_contract.rs  # ログ・expect・panic 等の開発者向けメッセージが英語であることを検査する契約テスト
        ├── linux_codec_env.rs        # Linux のメディアコーデック（GStreamer 等）環境判定
        ├── video/                    # 動画ダウンロード（hls.rs=HLS/m3u8 処理, http.rs=HTTP I/O）
        ├── commands/
        │   ├── app_error.rs          # フロントへ返すエラー AppError（種別コード `codes` ＋詳細。文言は返さない）
        │   ├── ui_language.rs        # Rust が使う文言（ウィンドウタイトル等）の ja/en 表 `ui_text` と表示言語の解決
        │   ├── backup/               # バックアップ／リストア
        │   │   ├── mod.rs            #   Tauri コマンド（メインウィンドウ専用。各処理を組み合わせるだけ）
        │   │   ├── format.rs         #   ファイル形式・読み込み検証・エクスポート変換（純粋関数）
        │   │   ├── restore.rs        #   復元の置換計算と検証（純粋関数）
        │   │   ├── snapshot.rs       #   復元直前の自動退避（専用ファイル・世代制限）
        │   │   └── file_io.rs        #   保存・読込のプラットフォーム差（desktop=ダイアログ, Android=SAF）
        │   ├── extensions/           # ブラウザ拡張機能（Windows のみ。OS 非依存ロジックと WebView2 ブリッジに分離）
        │   │   ├── mod.rs            #   管理コマンド（メインウィンドウ専用。Windows 以外は非対応エラー）
        │   │   ├── model.rs          #   データモデル（camelCase 直列化）
        │   │   ├── store.rs          #   settings.json の `browserExtensions` キーへの読み書き
        │   │   ├── manifest.rs       #   拡張の manifest.json 解析
        │   │   ├── chrome.rs         #   Chrome / Edge にインストール済みの拡張機能の検出
        │   │   ├── sanitize.rs       #   拡張フォルダ直下の予約名エントリ検出と除外コピーの作成
        │   │   ├── reconcile_plan.rs #   同期計画（何を Add / Remove / SetEnabled するか）の純粋ロジック
        │   │   ├── executor.rs       #   同期計画の実行器（`ProfileOps` 越しに実行）
        │   │   ├── hresult.rs        #   WebView2 の Add 失敗 HRESULT を AppError コードへ変換
        │   │   ├── service.rs        #   状態操作・検証・reconcile を直列化するサービス層
        │   │   └── webview2.rs       #   WebView2 拡張機能 API への非同期ブリッジ（Windows 専用）
        │   ├── settings.rs           # 設定の保存・読み込み（tauri-plugin-store）
        │   ├── settings_file.rs      # settings.json の破損耐性（アトミック書き込み・起動時の検査と復旧・`.prev` 世代）
        │   ├── settings_store.rs     # Rust 側の設定読み出しヘルパー（store 直接参照）
        │   ├── webview/
        │   │   ├── column.rs         # カラム WebView の作成・削除・リサイズ・URL 解決（Linux 配置・クリッピングを含む）
        │   │   ├── popup.rs          # メディア/リンクポップアップ・セッション切替
        │   │   ├── compose.rs        # ツイート作成ウィンドウ
        │   │   └── external_link.rs  # 新規ウィンドウ要求（target=_blank 等）を既定ブラウザで開く `on_new_window` ハンドラ
        │   ├── account.rs            # アカウントウィンドウ・ログイン検出・再認証（desktop/mobile 分岐）
        │   ├── update.rs             # Android APK 自己更新（呼び出し元制限・URL 許可リスト・SHA-256 検証）
        │   ├── media_codec.rs        # Linux AppImage のメディアコーデック対応状況判定
        │   ├── openh264_fetch.rs / openh264_http_client.rs  # Cisco OpenH264 ランタイムのダウンロード・有効化
        │   ├── relaunch.rs           # アプリの再起動（`relaunch_app`。AppImage では環境・fd を整理して起動し直す）
        │   ├── arch_support.rs       # 対応アーキテクチャ（x86_64）の判定
        │   └── video_download.rs     # カラム上の動画ダウンロード（デスクトップ）
        └── inject/                   # WebView に注入する JS
            ├── _src/                 # TypeScript ソース（Vite でバンドル → *.js に出力）
            │   ├── auto_reload.ts    # 自動更新（新着数報告を含む）
            │   ├── api_rate_limit_monitor.ts # X内部APIのレート制限ヘッダ監視
            │   ├── blur_image.ts     # 画像ぼかし表示
            │   ├── compose_only.ts   # 投稿専用カラム（投稿フォーム以外をスポットライト非表示）
            │   ├── constants.ts      # inject から呼ぶ Tauri IPC コマンド名の一覧（src/constants/ipc.ts と同期）
            │   ├── context_menu.ts   # カスタムコンテキストメニュー
            │   ├── custom_css.ts     # カスタム CSS 適用
            │   ├── dom_observer.ts   # DOM 変化監視を共有する単一 MutationObserver ハブ
            │   ├── header_customizer.ts / headerCustomizerTypes.ts / useHeaderCustomizer.ts / HeaderCustomizer.tsx  # ヘッダー非表示
            │   ├── hide_ad.ts        # 広告非表示
            │   ├── hide_grok_button.ts # Grok ボタン非表示（CSS の :has() で隠す）
            │   ├── i18n.ts           # inject の自前 UI 文言の ja/en 切替ハブ（window.__mcxI18n を公開）
            │   ├── image_popup.ts    # メディアリンクをポップアップで開く
            │   ├── keyboard_shortcut.ts # ショートカットキーを main へ転送
            │   ├── mediaviewer_autoplay.ts # モバイルの動画拡大表示（/mediaviewer）を開くたびに自動再生
            │   ├── mobile_area_hide.ts  # モバイル用の領域非表示
            │   ├── ng_word.ts / ng_word_matcher.ts  # NG ワードフィルタ
            │   ├── notification_header_hide.ts # 通知ページの設定ヘッダー非表示
            │   ├── popup_toolbar.ts  # ポップアップツールバー（アカウント切替）
            │   ├── popup_video_autoplay.ts # ポップアップ動画の自動再生（playButton を click → 生成された video を再生。body 出現後に開始）
            │   ├── repost_hide_matcher.ts # 指定ユーザーのリポスト非表示判定
            │   ├── return_to_last_read.ts / return_to_last_read_logic.ts # 前回の境目へ戻るボタン・写真閲覧後の位置復元
            │   ├── scroll_event.ts   # 横スクロールイベントを main WebView に中継
            │   ├── sidebar_hide.ts   # x.com サイドバー非表示
            │   ├── small_image.ts    # 画像縮小表示
            │   ├── tab_selector.ts   # ホームタブ選択
            │   ├── types.d.ts        # inject スクリプト側の window グローバル型定義
            │   ├── video_control.ts  # 動画自動再生停止
            │   └── video_long_press_menu.ts # 動画の長押し/右クリックメニュー（ポップアップ表示・ダウンロード）
            ├── *.js                  # _src をビルドした成果物（gitignore 対象・直接編集禁止）
            └── mod.rs                # build_init_script / build_popup_init_script
```

Kotlin 層（Android）:

```
src-tauri/gen/android/app/src/main/java/com/natsuyasai/multicolumnx/
├── MainActivity.kt                  # カラム/ポップアップ WebView 管理・バックボタン処理（ポップアップ→メイン画面へ問い合わせ→カラム履歴→バックグラウンド）
├── MainPageBack.kt                  # メイン画面への「戻る操作」問い合わせ JS と結果判定（純粋関数）
├── AddAccount.kt                    # ログイン用 Activity（センチネルファイル書き込みで完了通知）
├── ApiRateLimitBridge.kt            # APIレート制限ヘッダの JS ブリッジ
├── ApkHashVerifier.kt               # APK 自己更新の SHA-256 検証
├── AppBridge.kt                     # Rust JNI 呼び出しの窓口
├── BackupFileCopy.kt                # バックアップ入出力（SAF）の上限付きストリームコピー
├── BackupFileSelector.kt / MultiColumnXBackupAgent.kt  # Auto Backup 対象ファイルの選定
├── BridgeMessage.kt / BridgeOrigins.kt  # JS ブリッジのメッセージ形式・許可オリジン
├── ColumnWebViewUtils.kt            # カラム WebView 生成・操作ヘルパー
├── FileChooserUtils.kt              # ファイル選択ダイアログ処理
├── MediaPopupBridge.kt              # メディアのポップアップ要求の JS ブリッジ（送信元カラム固定・重複抑止）
├── MediaPopupFlagSync.kt            # 複数カラム表示フラグの保持と全カラムへの配布
├── PopupSessionBridge.kt            # ポップアップのセッション切替ブリッジ
├── ReauthUtils.kt                   # 既存アカウント再認証ヘルパー
├── SwipeBarOverlayView.kt / SwipeGestureResolver.kt  # スワイプ切替バーの描画・ジェスチャー判定
├── ThreadUtils.kt                   # UI スレッド実行ヘルパー
├── TwidUtils.kt                     # X ユーザー ID 抽出ユーティリティ
├── UrlUtils.kt                      # URL ユーティリティ
├── VideoDownloadForegroundService.kt / VideoDownloadRequestBridge.kt  # 動画ダウンロード（フォアグラウンドサービス）
├── WebViewProfiles.kt               # WebView Profile API のサポート判定・適用
└── generated/                       # Tauri 自動生成（TauriActivity.kt / WryActivity.kt / Rust.kt / RustWebView*.kt / Ipc.kt / Logger.kt / PermissionHelper.kt / proguard-wry.pro）。直接編集しない
```

## ユーザーガイドサイト（docs/.vitepress）

`docs/guide/`（章ごとのページ）を VitePress で GitHub Pages に公開する。ガイドの正本は `docs/guide/` 配下。

```
docs/
├── .vitepress/config.mts   # サイト設定（srcDir・base・日本語UI・日本語検索トークナイザ・サイドバー・editLink）
├── guide/                  # 公開対象（srcDir）。ガイド本文の正本
│   ├── index.md            # はじめに（クイックスタート・概要）
│   ├── install.md / screen.md / accounts.md / columns.md / settings.md
│   ├── popup-shortcuts.md / android.md / update.md / faq.md
│   └── images/             # ガイドのスクリーンショット（npm run docs:screenshots の出力先）
└── development/ 等         # 開発者向け資料。srcDir の外なので公開されない
```

- 公開範囲は `config.mts` の `srcDir: "guide"` 配下のみ。`development/` `specs/` `superpowers/` は srcDir の外なので公開されない
- サイドバーは `config.mts` の `themeConfig.sidebar` で管理している。**ページを追加・改名・削除したらサイドバーも更新すること**
- 章間リンクは相対リンク（例 `./install`、節指定は `./columns#カラム個別設定`）で書く。デッドリンクはビルドで検出される
- `npm run docs:build` はデッドリンクがあると失敗する（CI の `frontend` ジョブでも実行）。生成物 `docs/.vitepress/dist` / `cache` は git・prettier の対象外
- デプロイは `.github/workflows/pages.yml`（`main` への push で `docs/**` 等が変わったとき、または手動実行）

## 設定画面（AppSettingsPanel）のカテゴリ構成

上部タブと一般タブ内のグループは廃止し、サイドナビ（Android は一覧→詳細）のカテゴリ単位に統合している。カテゴリの定義・順序・表示条件の唯一の場所は `settingsCategories.ts`（設計判断は `settings-panel-navigation-notes.md`）。順序は上から下。

| 分類         | カテゴリ           | 中身                                                                          | 出し分け                                                                                                          |
| ------------ | ------------------ | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 一般         | 表示               | 表示言語・アプリUIの表示サイズ・カラム内の表示サイズ・テーマ・API残量モニター | 全環境                                                                                                            |
| 一般         | 閲覧・フィルタ     | X 公式設定・グローバル NG ワード・リポスト非表示ユーザー・広告                | 全環境                                                                                                            |
| 一般         | メディア           | 動画設定 / ポップアップウィンドウ / 動画再生(Linux)                           | ポップアップ = desktop のみ、動画再生(Linux) = Linux デスクトップのみ（`isLinux && !isMobile`）、動画設定は全環境 |
| 一般         | カラム既定値       | 既存の全カラムに適用＋自動更新・表示・画像・画像ブラー・カスタム CSS          | 全環境                                                                                                            |
| 一般         | Android専用        | ツイート（X アプリ起動）・スワイプ切替・複数カラム表示                        | mobile のみ                                                                                                       |
| カラム       | カラム配置         | グリッドレイアウト（ページ内の適用）                                          | 全環境                                                                                                            |
| カラム       | プリセット         | レイアウトの保存と読み込み                                                    | desktop のみ                                                                                                      |
| データ・拡張 | 拡張機能           | ブラウザ拡張機能の管理                                                        | Windows のみ（`isExtensionsSupported`）                                                                           |
| データ・拡張 | バックアップ       | 書き出しと復元                                                                | 全環境                                                                                                            |
| アプリ       | メンテナンス       | 全 WebView 再生成・データフォルダ削除再実行（保留があるときのみ）             | 全環境                                                                                                            |
| アプリ       | このアプリについて | 現在のバージョン・更新確認                                                    | 全環境                                                                                                            |

- ページ切替はアクティブなカテゴリだけを描画する。下書きは `AppSettingsPanel` の state にあるのでアンマウントしても値は保持される。
- 表示 / 閲覧・フィルタ / メディア / カラム既定値 / Android専用 は 1 つの下書きを共有し、フッターは「キャンセル / 適用」。それ以外は「閉じる」のみ。
- `isMobile` は `useAppStore`、`isLinux` は `App.tsx` が `platform()` から導出して props で渡す。
- Windows / macOS 専用項目は現状無いため `isWindows` / `isMac` 判定は追加していない。追加するときは `App.tsx` の `isLinux` と同様に `platform()` で導出して props に渡す。
- Storybook の `MobileGroups` 系 Story はストアの `isMobile` を一時的に true にしてモバイル構成を確認できる。
