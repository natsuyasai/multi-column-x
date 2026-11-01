// Android ネイティブ層（Kotlin）ページのデータ
window.MCX_DATA = window.MCX_DATA || { flows: {}, catalogs: {}, details: {} };

const ANDROID_DIR =
  "src-tauri/gen/android/app/src/main/java/com/natsuyasai/multicolumnx/";

Object.assign(window.MCX_DATA.flows, {
  "android.add-account": {
    title: "アカウント追加（mobile）",
    description:
      "React の「アカウント追加」から、別 Activity でのログイン、センチネルファイルでの完了通知までの流れ",
    actors: [
      { id: "ui", label: "React（メイン UI）", layer: "react" },
      { id: "rs", label: "Rust open_add_account_window", layer: "rust" },
      { id: "main", label: "MainActivity", layer: "android" },
      { id: "add", label: "AddAccount Activity", layer: "android" },
      { id: "fs", label: "app_data_dir（センチネル）", layer: "common" },
    ],
    steps: [
      {
        from: "ui",
        to: "rs",
        label: "invoke('open_add_account_window')",
        kind: "invoke",
        detail:
          "<p>メインウィンドウからのみ呼べる（<code>require_main_caller</code>）。Rust は新しい <code>accountId</code>（UUID）を発行し、<code>accounts/account-{id}</code> を作成、古いセンチネルを削除する。</p>",
        files: ["src-tauri/src/commands/account.rs"],
      },
      {
        from: "rs",
        to: "main",
        label: "JNI: launchAddAccount(accountId)",
        kind: "call",
        detail:
          "<p><code>android_bridge::launch_add_account_activity</code> が <code>call_activity_method</code> で MainActivity の同名メソッドを呼ぶ。</p>",
        files: ["src-tauri/src/android_bridge.rs"],
      },
      {
        from: "main",
        to: "add",
        label: "startActivity(Intent, accountId)",
        detail:
          "<p><code>AddAccount</code> は <code>accountId</code> を Intent Extra で受け取る。この間メイン WebView は Android に suspend され、JS は動かない。Rust 側の tokio ループだけが生きている。</p>",
        files: [ANDROID_DIR + "AddAccount.kt"],
      },
      {
        from: "add",
        to: "add",
        label: "account-{id} プロファイルでログイン",
        detail:
          "<p><code>WebViewProfiles.apply</code> でアカウント専用プロファイルを適用し、<code>x.com/login</code> を表示。500ms ごとに <code>location.pathname</code> を JS 評価し、<code>/home</code> になればログイン完了とみなす（SPA の pushState は onPageStarted で検知できないため）。</p>",
        files: [
          ANDROID_DIR + "AddAccount.kt",
          ANDROID_DIR + "WebViewProfiles.kt",
        ],
      },
      {
        from: "add",
        to: "fs",
        label: "add_account_login_complete を書く",
        detail:
          "<p>Cookie スナップショット <code>x_cookies.txt</code> を保存し、twid Cookie から X ユーザー ID を取り出してセンチネルの本文に書く（<code>addAccountSentinelBody</code>）。キャンセル時は <code>add_account_login_cancelled</code>。</p>",
        files: [ANDROID_DIR + "AddAccount.kt", ANDROID_DIR + "TwidUtils.kt"],
      },
      {
        from: "add",
        to: "main",
        label: "startActivity(MainActivity) + finish()",
        detail:
          "<p>AddAccount 自身が MainActivity を前面に戻して終了する。</p>",
      },
      {
        from: "rs",
        to: "fs",
        label: "500ms ポーリングで検出",
        detail:
          '<p><code>open_add_account_window</code> は最大 10 分、センチネルの出現を待ってブロックする。見つけたらファイルを読んで削除し、<code>accountId / dataDirectory / xUserId</code> を JSON で返す。キャンセルならデータディレクトリを片付けて <code>Err("cancelled")</code>。</p>',
        files: ["src-tauri/src/commands/account.rs"],
      },
      {
        from: "rs",
        to: "ui",
        label: "invoke の結果を返す",
        kind: "return",
        detail:
          "<p>React は返った accountId で store にアカウントを登録する。</p>",
      },
    ],
  },

  "android.reauth": {
    title: "再認証（既存アカウントの Cookie 上書き）",
    description:
      "一時プロファイルで再ログインし、ユーザー ID が一致した時だけ本番プロファイルへ転記する",
    actors: [
      { id: "rs", label: "Rust reauth_account_window", layer: "rust" },
      { id: "main", label: "MainActivity", layer: "android" },
      { id: "add", label: "AddAccount（mode=reauth）", layer: "android" },
      { id: "fs", label: "app_data_dir（センチネル）", layer: "common" },
    ],
    steps: [
      {
        from: "rs",
        to: "main",
        label: "JNI: launchReauthAccount(accountId, expectedUserId)",
        detail:
          "<p><code>expectedUserId</code> は null 可（初回の場合）。Intent Extra に <code>mode=reauth</code> が付く。</p>",
        files: [
          "src-tauri/src/android_bridge.rs",
          ANDROID_DIR + "MainActivity.kt",
        ],
      },
      {
        from: "main",
        to: "add",
        label: "startActivity",
        detail:
          "<p>AddAccount は reauth モードでは対象アカウントのライブプロファイルを使わず、<code>reauth-tmp-{uuid}</code> の一時プロファイルでまっさらなログインをさせる。</p>",
        files: [ANDROID_DIR + "ReauthUtils.kt"],
      },
      {
        from: "add",
        to: "add",
        label: "/home 到達 → twid から xUserId 取得 → 照合",
        detail:
          "<p><code>reauthSentinelName</code> が判定: xUserId が取れない／expected と不一致なら <code>reauth_mismatch</code>、それ以外は <code>reauth_complete</code>。誤アカウントで上書きされる事故を防ぐ。</p>",
        files: [ANDROID_DIR + "ReauthUtils.kt"],
      },
      {
        from: "add",
        to: "add",
        label: "commitReauthCookies（一致時のみ）",
        detail:
          "<p>対象アカウントのライブプロファイルの CookieManager を <code>removeAllCookies</code> してから新 Cookie を注入。<code>x_cookies.txt</code> も更新（非対応端末のフォールバック用）。完了後、一時プロファイルを best-effort で削除。</p>",
      },
      {
        from: "add",
        to: "fs",
        label: "reauth_complete / reauth_mismatch / reauth_cancelled",
        detail:
          "<p>戻るキーでのキャンセルは <code>reauth_cancelled</code>。</p>",
      },
      {
        from: "rs",
        to: "fs",
        label: "ポーリングで結果を判定",
        detail:
          "<p>3 種類のセンチネルを監視し、結果に応じて React へ返す。</p>",
        files: ["src-tauri/src/commands/account.rs"],
      },
    ],
  },

  "android.video-download": {
    title: "動画ダウンロード（inject → Rust → Foreground Service → SAF）",
    description:
      "動画長押しメニューから保存までの経路と、バックグラウンド中断対策",
    actors: [
      { id: "js", label: "column WebView（inject）", layer: "inject" },
      {
        id: "kt",
        label: "MainActivity / VideoDownloadRequestBridge",
        layer: "android",
      },
      { id: "rs", label: "Rust video_download.rs", layer: "rust" },
      { id: "svc", label: "VideoDownloadForegroundService", layer: "android" },
      { id: "saf", label: "SAF 保存ダイアログ", layer: "android" },
    ],
    steps: [
      {
        from: "js",
        to: "kt",
        label:
          "__mcxVideoDownloadBridge.postMessage({type:'downloadVideo', payload})",
        kind: "call",
        detail:
          "<p><code>video_long_press_menu.ts</code> が variants と推奨ファイル名を JSON 文字列にして送る。<code>addWebMessageListener</code> のコールバックで、メインフレーム確認 → オリジン二重チェック → <code>parseBridgeMessage</code> の順に検証してから <code>VideoDownloadRequestBridge.handle</code> に渡る。</p>",
        files: [
          "src-tauri/src/inject/_src/video_long_press_menu.ts",
          ANDROID_DIR + "BridgeOrigins.kt",
          ANDROID_DIR + "BridgeMessage.kt",
          ANDROID_DIR + "VideoDownloadRequestBridge.kt",
        ],
      },
      {
        from: "kt",
        to: "rs",
        label: "JNI: AppBridge.onVideoDownloadRequest(payloadJson)",
        kind: "call",
        detail:
          "<p>JavaBridge スレッドを塞がないよう、Rust 側は <code>tauri::async_runtime::spawn</code> に逃がして即 return する。</p>",
        files: ["src-tauri/src/android_bridge.rs"],
      },
      {
        from: "rs",
        to: "svc",
        label: "notifyVideoDownloadStarted",
        kind: "call",
        detail:
          "<p>payload 解析・ダウンロード計画の成功後に呼ぶ。MainActivity が <code>ACTION_START</code> の Intent で <code>startForegroundService</code>。通知（進捗なし）を出してフォアグラウンド昇格する。</p>",
        files: [
          "src-tauri/src/commands/video_download.rs",
          ANDROID_DIR + "VideoDownloadForegroundService.kt",
        ],
      },
      {
        from: "rs",
        to: "svc",
        label:
          "notifyVideoDownloadProgress(fileIndex, fileCount, current, total)",
        kind: "call",
        detail:
          "<p>ダウンロード中に繰り返し呼ぶ。<code>total &lt;= 0</code> は「不明」を表し、通知は不確定プログレスになる。文言は文字列リソース（端末言語に従う）。</p>",
      },
      {
        from: "rs",
        to: "kt",
        label: "saveDownloadedVideo(tempPath, fileName, mime)",
        kind: "call",
        detail:
          "<p>ダウンロード済みの一時ファイルを渡す。Kotlin は <code>pendingVideoSaveRequest</code> に保持して SAF の <code>CreateDocument</code> を起動し、ユーザーが選んだ場所へコピーする。キャンセルはエラーにしない。コピー後（成否問わず）一時ファイルを削除する。</p>",
      },
      {
        from: "kt",
        to: "saf",
        label: "saveVideoLauncher.launch(fileName)",
        detail:
          "<p>ランチャは Activity 生成前（プロパティ初期化子）で登録する制約がある。</p>",
      },
      {
        from: "rs",
        to: "svc",
        label: "notifyVideoDownloadFinished（必ず呼ぶ）",
        kind: "call",
        detail:
          "<p>処理本体を <code>async {}</code> ブロックで包み、成否に関わらず終了通知を呼ぶ構造にして、通知が残り続ける不具合を防いでいる。<code>ACTION_FINISH</code> でフォアグラウンド解除・通知削除・<code>stopSelf()</code>。</p>",
        files: ["src-tauri/src/commands/video_download.rs"],
      },
    ],
  },

  "android.rust-to-kotlin": {
    title: "Rust から Kotlin メソッド呼び出し（カラム生成の例）",
    description:
      "Tauri コマンドから MainActivity のメソッドが呼ばれるまでと、UI スレッド同期",
    actors: [
      { id: "ui", label: "React", layer: "react" },
      { id: "cmd", label: "Rust column.rs", layer: "rust" },
      { id: "br", label: "Rust android_bridge.rs", layer: "rust" },
      {
        id: "main",
        label: "MainActivity（JNI スレッド→UI）",
        layer: "android",
      },
    ],
    steps: [
      {
        from: "ui",
        to: "cmd",
        label: "invoke('create_column_webview')",
        kind: "invoke",
        detail:
          "<p>メインウィンドウ専用。URL とカラム用 inject スクリプトを組み立てる。Android では <code>WebviewWindowBuilder</code> を使わず、ネイティブ WebView を Activity の content に重ねる方式。</p>",
        files: ["src-tauri/src/commands/webview/column.rs"],
      },
      {
        from: "cmd",
        to: "br",
        label: "android_bridge::create_column_webview(...)",
        detail:
          "<p>引数は id / url / widthDp / heightDp / initScript / visible / accountId。</p>",
      },
      {
        from: "br",
        to: "br",
        label: "call_activity_method",
        detail:
          "<p><code>MAIN_ACTIVITY</code>（JavaVM + GlobalRef）をロックし、現スレッドを JVM に attach。JNI 呼び出しの前後で pending exception をクリアする。メソッド名とシグネチャ文字列は手書き（<code>call_method</code>）なので、リネームやシグネチャ変更は ProGuard keep ルールとセットで直す必要がある。</p>",
        files: [
          "src-tauri/src/android_bridge.rs",
          "src-tauri/gen/android/app/proguard-rules.pro",
        ],
      },
      {
        from: "br",
        to: "main",
        label: "env.call_method(activity, 'createColumnWebView', sig, args)",
        kind: "call",
        detail:
          "<p>JNI スレッド（tokio のワーカー等）から MainActivity のメソッドが呼ばれる。</p>",
      },
      {
        from: "main",
        to: "main",
        label: "runOnUiThreadSync { WebView 生成〜loadUrl }",
        detail:
          "<p>View 操作は UI スレッド必須。<code>runSyncOnThread</code> が <code>CountDownLatch</code> で最大 5 秒待ち、呼び出し元は生成完了後に戻る。プロファイル適用 → 設定 → ブリッジ登録 → <code>addView</code> → <code>restoreOverlayOrder()</code> → URL ロード、の順。</p>",
        files: [
          ANDROID_DIR + "MainActivity.kt",
          ANDROID_DIR + "ThreadUtils.kt",
        ],
      },
      {
        from: "main",
        to: "br",
        label: "（戻り）",
        kind: "return",
        detail:
          "<p>戻り値が bool/String のメソッド（<code>reshowPopupWebView</code>, <code>isWebViewProfileSupported</code>, <code>detectXUserId</code>）は <code>call_activity_method</code> が使えず、Rust 側で attach を直接書く。</p>",
      },
    ],
  },

  "android.apk-update": {
    title: "APK 自己更新",
    description:
      "Release の APK を落として SHA-256 を検証し、システムのインストーラを起動する",
    actors: [
      { id: "ui", label: "React（更新 UI）", layer: "react" },
      { id: "rs", label: "Rust install_apk_update", layer: "rust" },
      { id: "main", label: "MainActivity", layer: "android" },
      { id: "os", label: "OS パッケージインストーラ", layer: "common" },
    ],
    steps: [
      {
        from: "ui",
        to: "rs",
        label: "invoke('install_apk_update', {url, expectedSha256})",
        kind: "invoke",
        detail:
          "<p>Rust が <code>validate_install_request</code> で呼び出し元（main のみ）・URL（自リポジトリの Releases のみ）・ハッシュ形式を検証。column/popup WebView には IPC が付いているため、任意 URL のインストールを防ぐ関門になっている。</p>",
        files: ["src-tauri/src/commands/update.rs"],
      },
      {
        from: "rs",
        to: "main",
        label: "JNI: downloadAndInstallApk(url, expectedSha256)",
        kind: "call",
        files: ["src-tauri/src/android_bridge.rs"],
      },
      {
        from: "main",
        to: "main",
        label: "canRequestPackageInstalls() を確認",
        detail:
          "<p>Android 8.0 以降で未許可なら、ダウンロードせず「不明なアプリのインストール」設定画面へ誘導して return。</p>",
      },
      {
        from: "main",
        to: "main",
        label: "別スレッドで DL → ApkHashVerifier.verify",
        detail:
          "<p><code>getExternalFilesDir/updates/update.apk</code> へ保存し、SHA-256 を照合。不一致ならファイルを削除してインストールしない。</p>",
        files: [ANDROID_DIR + "ApkHashVerifier.kt"],
      },
      {
        from: "main",
        to: "os",
        label: "FileProvider の content:// URI で ACTION_VIEW",
        detail:
          "<p>権限は <code>${applicationId}.fileprovider</code>。同一署名でなければ上書き更新は失敗する。</p>",
      },
    ],
  },

  "android.backup-export": {
    title: "バックアップのエクスポート（SAF 経由）",
    description:
      "Rust が書いた一時ファイルを、ユーザーが選んだ場所へコピーして結果を非同期に返す",
    actors: [
      { id: "rs", label: "Rust file_io.rs", layer: "rust" },
      { id: "main", label: "MainActivity", layer: "android" },
      { id: "saf", label: "SAF「名前を付けて保存」", layer: "android" },
    ],
    steps: [
      {
        from: "rs",
        to: "rs",
        label: "一時ファイルへ書き出し + register_bridge_waiter",
        detail:
          "<p>結果受け取り用の待受（oneshot 相当）を登録してから Kotlin を呼ぶ。</p>",
        files: ["src-tauri/src/commands/backup/file_io.rs"],
      },
      {
        from: "rs",
        to: "main",
        label: "JNI: startBackupExport(tempPath, fileName)",
        kind: "call",
        detail:
          "<p>UI スレッドで <code>backupExportLauncher.launch</code>。一時ファイルが無ければ即 <code>error</code> を返す。</p>",
      },
      {
        from: "main",
        to: "saf",
        label: "CreateDocument('application/json')",
        detail: "<p>コピーは別スレッドで実行（UI を止めない）。</p>",
      },
      {
        from: "main",
        to: "rs",
        label: "JNI: AppBridge.onBackupFileResult(status, detail)",
        kind: "call",
        detail:
          "<p>status は <code>saved / picked / cancelled / tooLarge / error</code>。Rust は <code>deliver_bridge_result</code> で待受に渡す。インポート側は Kotlin が上限バイト（<code>copyWithLimit</code>）で打ち切り、Rust も <code>read_limited</code> で再検査する二重防御。</p>",
        files: [
          "src-tauri/src/android_bridge.rs",
          ANDROID_DIR + "BackupFileCopy.kt",
        ],
      },
    ],
  },
});

Object.assign(window.MCX_DATA.catalogs, {
  "android.files": {
    title: "Kotlin ファイル一覧（手書きコード）",
    columns: [
      { key: "name", label: "ファイル", code: true },
      { key: "role", label: "役割" },
      { key: "caller", label: "呼び出し元 / 関連" },
    ],
    filters: [{ key: "kind", label: "種別" }],
    items: [
      {
        name: "MainActivity.kt",
        role: "Tauri の Activity を継承。Rust から JNI で呼ばれる WebView 管理 API の本体",
        caller: "Rust android_bridge.rs / AppBridge",
        kind: "Activity",
        detail:
          "<p>カラム・ポップアップ・常駐コンポーズ WebView の生成/表示/破棄、スワイプバー、APK 更新、動画保存、バックアップ SAF、ファイル選択、戻るキー処理を持つ。約 1000 行と大きい。メソッドを変えたら <code>proguard-rules.pro</code> も更新。</p>",
        files: [ANDROID_DIR + "MainActivity.kt"],
      },
      {
        name: "AddAccount.kt",
        role: "アカウント追加／再認証用の別 Activity（x.com/login を表示）",
        caller:
          "MainActivity.launchAddAccount / launchReauthAccount、Rust commands/account.rs",
        kind: "Activity",
        files: [ANDROID_DIR + "AddAccount.kt"],
      },
      {
        name: "AppBridge.kt",
        role: "Kotlin→Rust の JNI 宣言（external fun）の集約",
        caller: "MainActivity、各 Bridge ハンドラ → Rust android_bridge.rs",
        kind: "JNI",
        files: [
          ANDROID_DIR + "AppBridge.kt",
          "src-tauri/src/android_bridge.rs",
        ],
      },
      {
        name: "BridgeMessage.kt",
        role: "JS から届く JSON を型付きメッセージへパース（sealed class）。不正は null",
        caller: "MainActivity の addWebMessageListener コールバック",
        kind: "ブリッジ",
        files: [ANDROID_DIR + "BridgeMessage.kt"],
      },
      {
        name: "BridgeOrigins.kt",
        role: "許可オリジン規則と二重チェック、機能非対応時の公開抑止",
        caller: "MainActivity",
        kind: "ブリッジ",
        files: [ANDROID_DIR + "BridgeOrigins.kt"],
      },
      {
        name: "ApiRateLimitBridge.kt",
        role: "reportApiRateLimit を AppBridge.onApiRateLimitReport へ振り分け",
        caller: "inject api_rate_limit_monitor.ts → Rust report 経路",
        kind: "ブリッジ",
        files: [
          ANDROID_DIR + "ApiRateLimitBridge.kt",
          "src-tauri/src/inject/_src/api_rate_limit_monitor.ts",
        ],
      },
      {
        name: "PopupSessionBridge.kt",
        role: "switchPopupSession / reportOfficialSettings / closePopup の振り分け",
        caller: "inject popup_toolbar.ts",
        kind: "ブリッジ",
        files: [
          ANDROID_DIR + "PopupSessionBridge.kt",
          "src-tauri/src/inject/_src/popup_toolbar.ts",
        ],
      },
      {
        name: "VideoDownloadRequestBridge.kt",
        role: "downloadVideo を AppBridge.onVideoDownloadRequest へ振り分け",
        caller: "inject video_long_press_menu.ts → Rust video_download.rs",
        kind: "ブリッジ",
        files: [
          ANDROID_DIR + "VideoDownloadRequestBridge.kt",
          "src-tauri/src/inject/_src/video_long_press_menu.ts",
        ],
      },
      {
        name: "WebViewProfiles.kt",
        role: "WebView Profile API（アカウント別セッション分離）の判定・適用・Cookie 移行",
        caller: "MainActivity, AddAccount",
        kind: "セッション",
        files: [ANDROID_DIR + "WebViewProfiles.kt"],
      },
      {
        name: "ReauthUtils.kt",
        role: "再認証の一時プロファイル名と、結果センチネル名の判定（純粋関数）",
        caller: "AddAccount",
        kind: "セッション",
        files: [ANDROID_DIR + "ReauthUtils.kt"],
      },
      {
        name: "TwidUtils.kt",
        role: "twid Cookie から X ユーザー ID を抽出、アカウント追加センチネル本文の生成",
        caller:
          "AddAccount, MainActivity.detectXUserId。Rust 側 parse_twid_user_id と同一挙動",
        kind: "セッション",
        files: [
          ANDROID_DIR + "TwidUtils.kt",
          "src-tauri/src/commands/account.rs",
        ],
      },
      {
        name: "SwipeBarOverlayView.kt",
        role: "画面下部のスワイプ操作領域を描くネイティブ View（FrameLayout）",
        caller: "MainActivity.setSwipeBarOverlay / setSwipeBarFlash",
        kind: "UI",
        detail:
          "<p>配色は index.css のトークンの複製。<code>swipeBarColors.contract.test.ts</code> で一致を検査。</p>",
        files: [
          ANDROID_DIR + "SwipeBarOverlayView.kt",
          "src/lib/swipeBarColors.contract.test.ts",
        ],
      },
      {
        name: "SwipeGestureResolver.kt",
        role: "スワイプ方向・タップ・ダブルタップ判定の純粋関数",
        caller: "SwipeBarOverlayView",
        kind: "UI",
        files: [ANDROID_DIR + "SwipeGestureResolver.kt"],
      },
      {
        name: "FileChooserUtils.kt",
        role: "accept 属性の MIME 正規化、選択結果 URI の解決、コールバック保持",
        caller: "MainActivity.onShowFileChooser / fileChooserLauncher",
        kind: "UI",
        files: [ANDROID_DIR + "FileChooserUtils.kt"],
      },
      {
        name: "ColumnWebViewUtils.kt",
        role: "カラム WebView の初期 visibility（INVISIBLE を使う理由を含む）",
        caller: "MainActivity.createColumnWebView",
        kind: "UI",
        files: [ANDROID_DIR + "ColumnWebViewUtils.kt"],
      },
      {
        name: "UrlUtils.kt",
        role: "内部 URL／ログイン URL／コンポーズ URL の判定",
        caller: "MainActivity（ExternalLinkWebViewClient など）",
        kind: "UI",
        files: [ANDROID_DIR + "UrlUtils.kt"],
      },
      {
        name: "ThreadUtils.kt",
        role: "UI スレッドで実行し完了を待つ同期ヘルパー（最大 5 秒）",
        caller: "MainActivity.runOnUiThreadSync",
        kind: "共通",
        files: [ANDROID_DIR + "ThreadUtils.kt"],
      },
      {
        name: "VideoDownloadForegroundService.kt",
        role: "動画 DL 中のフォアグラウンドサービスと進捗通知",
        caller:
          "MainActivity.notifyVideoDownload*（Rust video_download.rs から）",
        kind: "動画",
        files: [ANDROID_DIR + "VideoDownloadForegroundService.kt"],
      },
      {
        name: "ApkHashVerifier.kt",
        role: "APK の SHA-256 照合（ストリーミング計算）",
        caller: "MainActivity.downloadAndInstallApk",
        kind: "更新",
        files: [ANDROID_DIR + "ApkHashVerifier.kt"],
      },
      {
        name: "MultiColumnXBackupAgent.kt",
        role: "Auto Backup のカスタムエージェント（onFullBackup のみ実装）",
        caller: "OS（AndroidManifest の android:backupAgent）",
        kind: "バックアップ",
        files: [ANDROID_DIR + "MultiColumnXBackupAgent.kt"],
      },
      {
        name: "BackupFileSelector.kt",
        role: "Auto Backup 対象ファイルの選別（キャッシュ・Service Worker 等を除外）",
        caller: "MultiColumnXBackupAgent",
        kind: "バックアップ",
        files: [ANDROID_DIR + "BackupFileSelector.kt"],
      },
      {
        name: "BackupFileCopy.kt",
        role: "上限バイト付きストリームコピー（バックアップ読込の打ち切り）",
        caller: "MainActivity.backupImportLauncher",
        kind: "バックアップ",
        files: [ANDROID_DIR + "BackupFileCopy.kt"],
      },
    ],
  },

  "android.rust-to-kotlin": {
    title: "Rust → Kotlin（MainActivity のメソッド）",
    columns: [
      { key: "name", label: "MainActivity のメソッド", code: true },
      { key: "summary", label: "概要" },
      { key: "rsfn", label: "Rust 側呼び出し元", code: true },
    ],
    filters: [{ key: "area", label: "領域" }],
    items: [
      {
        name: "createColumnWebView",
        summary: "カラム WebView を生成し content に重ねる",
        rsfn: "create_column_webview",
        area: "カラム",
      },
      {
        name: "showColumnWebView",
        summary: "位置・サイズを指定して表示（dp）",
        rsfn: "show_column_webview",
        area: "カラム",
      },
      {
        name: "hideColumnWebView",
        summary: "非表示にする",
        rsfn: "hide_column_webview",
        area: "カラム",
      },
      {
        name: "removeColumnWebView",
        summary: "破棄する",
        rsfn: "remove_column_webview",
        area: "カラム",
      },
      {
        name: "evalInColumnWebView",
        summary: "JS を評価する",
        rsfn: "eval_in_column_webview",
        area: "カラム",
      },
      {
        name: "setAccountCookies",
        summary: "Profile 非対応端末で CookieManager を切り替える",
        rsfn: "set_account_cookies",
        area: "セッション",
      },
      {
        name: "isWebViewProfileSupported",
        summary: "Profile API 対応可否（bool）",
        rsfn: "is_webview_profile_supported",
        area: "セッション",
      },
      {
        name: "createPopupWebView",
        summary: "全画面ポップアップを生成",
        rsfn: "create_popup_webview",
        area: "ポップアップ",
      },
      {
        name: "removePopupWebView",
        summary: "ポップアップを破棄（退避中の常駐コンポーズも）",
        rsfn: "remove_popup_webview",
        area: "ポップアップ",
      },
      {
        name: "hidePopupWebView",
        summary: "常駐コンポーズを破棄せず退避",
        rsfn: "hide_popup_webview",
        area: "ポップアップ",
      },
      {
        name: "reshowPopupWebView",
        summary: "退避中のコンポーズを再表示（bool 戻り）",
        rsfn: "reshow_popup_webview",
        area: "ポップアップ",
      },
      {
        name: "launchComposeTweet",
        summary: "X アプリのツイート画面を起動（無ければブラウザ）",
        rsfn: "launch_compose_tweet_intent",
        area: "ポップアップ",
      },
      {
        name: "launchAddAccount",
        summary: "AddAccount を起動",
        rsfn: "launch_add_account_activity",
        area: "アカウント",
      },
      {
        name: "launchReauthAccount",
        summary: "AddAccount を再認証モードで起動",
        rsfn: "launch_reauth_account_activity",
        area: "アカウント",
      },
      {
        name: "detectXUserId",
        summary: "プロファイルの twid から X ユーザー ID を返す（String 戻り）",
        rsfn: "detect_x_user_id",
        area: "アカウント",
      },
      {
        name: "setSwipeBarOverlay",
        summary: "スワイプバーの表示/位置/不透明度/テーマ",
        rsfn: "set_swipe_bar_overlay",
        area: "スワイプバー",
      },
      {
        name: "setSwipeBarFlash",
        summary: "遷移確定フラッシュ演出",
        rsfn: "set_swipe_bar_flash",
        area: "スワイプバー",
      },
      {
        name: "downloadAndInstallApk",
        summary: "APK を DL・検証・インストーラ起動",
        rsfn: "download_and_install_apk",
        area: "更新",
      },
      {
        name: "saveDownloadedVideo",
        summary: "一時ファイルを SAF で保存",
        rsfn: "save_downloaded_video",
        area: "動画",
      },
      {
        name: "notifyVideoDownloadStarted",
        summary: "Foreground Service 開始",
        rsfn: "notify_video_download_started",
        area: "動画",
      },
      {
        name: "notifyVideoDownloadProgress",
        summary: "進捗通知の更新",
        rsfn: "notify_video_download_progress",
        area: "動画",
      },
      {
        name: "notifyVideoDownloadFinished",
        summary: "Foreground Service 終了",
        rsfn: "notify_video_download_finished",
        area: "動画",
      },
      {
        name: "startBackupExport",
        summary: "SAF でバックアップを保存",
        rsfn: "start_backup_export",
        area: "バックアップ",
      },
      {
        name: "startBackupImport",
        summary: "SAF でバックアップを選択（上限付きコピー）",
        rsfn: "start_backup_import",
        area: "バックアップ",
      },
    ].map((x) => ({
      ...x,
      files: [
        ANDROID_DIR + "MainActivity.kt",
        "src-tauri/src/android_bridge.rs",
      ],
    })),
  },

  "android.kotlin-to-rust": {
    title: "Kotlin → Rust（AppBridge の JNI 関数）",
    columns: [
      { key: "name", label: "AppBridge.xxx", code: true },
      { key: "summary", label: "概要" },
      { key: "caller", label: "Kotlin 側の呼び出し元" },
    ],
    filters: [],
    items: [
      {
        name: "initContext",
        summary:
          "MainActivity を GlobalRef として Rust に保存（以後の JNI 呼び出しの起点）",
        caller: "MainActivity.onCreate",
      },
      {
        name: "onInsets",
        summary: "システムバー高さ（dp）を通知。get_mobile_insets の値になる",
        caller: "WindowInsets リスナー",
      },
      {
        name: "closeTopPopup",
        summary: "戻るキーでポップアップを閉じるイベントを emit（bool 戻り）",
        caller: "戻るキー処理",
      },
      {
        name: "onPopupSwitchSession",
        summary: "ポップアップのアカウント切替で再作成を依頼",
        caller: "PopupSessionBridge",
      },
      {
        name: "onOfficialSettingsReport",
        summary: "公式設定スナップショットを通知",
        caller: "PopupSessionBridge",
      },
      {
        name: "onPopupClosed",
        summary: "非常駐ポップアップの実破棄を通知",
        caller: "removePopupWebView / closeTopPopupWebView",
      },
      {
        name: "onApiRateLimitReport",
        summary: "API レート制限情報を通知",
        caller: "ApiRateLimitBridge",
      },
      {
        name: "onVideoDownloadRequest",
        summary: "動画 DL 要求（payload JSON）を通知",
        caller: "VideoDownloadRequestBridge",
      },
      {
        name: "onSwipeNavigate",
        summary: "スワイプ確定（left/right）。mobile-swipe-navigate を emit",
        caller: "SwipeBarOverlayView",
      },
      {
        name: "onSwipeProgress",
        summary:
          "スワイプ中の方向。mobile-swipe-progress を emit（空文字=なし）",
        caller: "SwipeBarOverlayView",
      },
      {
        name: "onSwipeDoubleTap",
        summary: "ダブルタップ確定。mobile-swipe-double-tap を emit",
        caller: "SwipeBarOverlayView",
      },
      {
        name: "onBackupFileResult",
        summary: "SAF 入出力の完了（saved/picked/cancelled/tooLarge/error）",
        caller: "backupExport/ImportLauncher",
      },
    ].map((x) => ({
      ...x,
      files: [ANDROID_DIR + "AppBridge.kt", "src-tauri/src/android_bridge.rs"],
    })),
  },

  "android.js-bridges": {
    title: "JS → Kotlin ブリッジ（addWebMessageListener）",
    columns: [
      { key: "jsname", label: "window.xxx", code: true },
      { key: "types", label: "type" },
      { key: "where", label: "公開先 WebView" },
      { key: "handler", label: "Kotlin ハンドラ" },
    ],
    filters: [],
    items: [
      {
        jsname: "__mcxVideoDownloadBridge",
        types: "downloadVideo",
        where: "カラム",
        handler: "VideoDownloadRequestBridge",
        files: [
          "src-tauri/src/inject/_src/video_long_press_menu.ts",
          ANDROID_DIR + "VideoDownloadRequestBridge.kt",
        ],
      },
      {
        jsname: "__mcxApiRateLimitBridge",
        types: "reportApiRateLimit",
        where: "カラム",
        handler: "ApiRateLimitBridge",
        files: [
          "src-tauri/src/inject/_src/api_rate_limit_monitor.ts",
          ANDROID_DIR + "ApiRateLimitBridge.kt",
        ],
      },
      {
        jsname: "__mcxPopupBridge",
        types: "switchPopupSession / reportOfficialSettings / closePopup",
        where: "ポップアップ",
        handler: "PopupSessionBridge",
        files: [
          "src-tauri/src/inject/_src/popup_toolbar.ts",
          ANDROID_DIR + "PopupSessionBridge.kt",
        ],
      },
    ],
  },

  "android.sentinels": {
    title: "センチネルファイル（Kotlin → Rust の完了通知）",
    columns: [
      { key: "name", label: "ファイル名（app_data_dir 直下）", code: true },
      { key: "meaning", label: "意味" },
      { key: "writer", label: "書く側" },
    ],
    filters: [],
    items: [
      {
        name: "add_account_login_complete",
        meaning: "アカウント追加成功。本文は X ユーザー ID（無ければ空）",
        writer: "AddAccount.finishWithResult",
      },
      {
        name: "add_account_login_cancelled",
        meaning: "アカウント追加キャンセル",
        writer: "AddAccount.finishWithResult",
      },
      {
        name: "reauth_complete",
        meaning: "再認証成功（Cookie 転記済み）。本文は xUserId",
        writer: "AddAccount.finishReauthWithSentinel",
      },
      {
        name: "reauth_mismatch",
        meaning: "ユーザー ID 不一致または取得不能（Cookie は転記しない）",
        writer: "AddAccount.finishReauthWithSentinel",
      },
      {
        name: "reauth_cancelled",
        meaning: "再認証キャンセル",
        writer: "AddAccount.finishReauthWithSentinel",
      },
    ].map((x) => ({
      ...x,
      files: [
        ANDROID_DIR + "AddAccount.kt",
        "src-tauri/src/commands/account.rs",
      ],
    })),
  },
});

Object.assign(window.MCX_DATA.details, {
  "android.rust": {
    title: "android_bridge.rs（Rust 側の相手方）",
    layer: "rust",
    summary:
      "JNI 経由で MainActivity を呼ぶ関数群と、Kotlin から呼ばれる JNI エントリポイントを持つ",
    body: '<p><code>MAIN_ACTIVITY</code>（JavaVM + GlobalRef）と <code>TAURI_APP</code> を静的に保持。Rust→Kotlin は <code>call_activity_method</code> ヘルパー、Kotlin→Rust は <code>Java_com_natsuyasai_multicolumnx_AppBridge_*</code> の <code>extern "C"</code> 関数。重い処理は spawn に逃がし、軽い処理（Mutex+emit）は同期で行う。</p>',
    files: ["src-tauri/src/android_bridge.rs"],
    docs: ["../development/android-notes.md"],
    related: ["android.appbridge", "android.mainactivity"],
  },
  "android.mainactivity": {
    title: "MainActivity",
    layer: "android",
    summary:
      "Tauri の WryActivity/TauriActivity を継承し、全 WebView と各種 SAF ランチャを管理する",
    body:
      "<p>メイン UI（React）の WebView は Tauri が管理し、その上に<b>カラム・ポップアップ・スワイプバー</b>をネイティブ View として重ねる。Z 順は <code>restoreOverlayOrder()</code> に集約（popup &gt; スワイプバー &gt; カラム &gt; メイン）。<code>registerForActivityResult</code> はプロパティ初期化子で登録する制約がある。</p>" +
      "<p>メソッドは Rust から文字列指定で呼ばれるため、シグネチャ変更は <code>proguard-rules.pro</code> と同時更新が必須。</p>",
    files: [
      ANDROID_DIR + "MainActivity.kt",
      "src-tauri/gen/android/app/proguard-rules.pro",
    ],
    docs: ["../development/android-notes.md"],
    related: [
      "android.rust",
      "android.appbridge",
      "android.profiles",
      "android.swipebar",
    ],
  },
  "android.appbridge": {
    title: "AppBridge",
    layer: "android",
    summary: "Kotlin→Rust の JNI 宣言を集約した object",
    body: '<p><code>System.loadLibrary("multi_column_x_lib")</code> で Rust の .so を読み、<code>external fun</code> が <code>android_bridge.rs</code> の同名 JNI 関数に対応する。</p>',
    files: [ANDROID_DIR + "AppBridge.kt", "src-tauri/src/android_bridge.rs"],
    related: ["android.rust"],
  },
  "android.bridges": {
    title: "BridgeMessage / BridgeOrigins / 各 Bridge ハンドラ",
    layer: "android",
    summary:
      "JS からの postMessage を検証し、型付きメッセージとして各ハンドラへ振り分ける",
    body: "<p>検証は 4 段: ① WebView が <code>WEB_MESSAGE_LISTENER</code> に対応しているか（非対応なら公開しない）② <code>allowedOriginRules</code>（x.com / twitter.com とそのサブドメイン）③ コールバック内でメインフレーム確認と <code>isAllowedBridgeOrigin</code> の二重チェック ④ <code>parseBridgeMessage</code>（不正 JSON・未知 type・必須欠落は null で無視）。</p>",
    files: [
      ANDROID_DIR + "BridgeMessage.kt",
      ANDROID_DIR + "BridgeOrigins.kt",
      ANDROID_DIR + "PopupSessionBridge.kt",
      ANDROID_DIR + "ApiRateLimitBridge.kt",
      ANDROID_DIR + "VideoDownloadRequestBridge.kt",
    ],
    related: ["android.appbridge"],
  },
  "android.addaccount": {
    title: "AddAccount Activity",
    layer: "android",
    summary:
      "ログイン専用の別 Activity。完了は センチネルファイルで Rust に伝える",
    body: "<p>add / reauth の 2 モード。500ms ごとの JS ポーリングで <code>/home</code> 到達を検出。Rust から <code>window.close()</code> しても閉じないため、Kotlin 側が自分で <code>finish()</code> する。</p>",
    files: [
      ANDROID_DIR + "AddAccount.kt",
      ANDROID_DIR + "ReauthUtils.kt",
      ANDROID_DIR + "TwidUtils.kt",
    ],
    docs: ["../development/android-notes.md"],
    related: ["android.mainactivity", "android.profiles"],
  },
  "android.profiles": {
    title: "WebViewProfiles",
    layer: "android",
    summary: "WebView Profile API でアカウントごとに Cookie を分離する",
    body: "<p>プロファイル名は <code>account-{accountId}</code>。<code>setProfile</code> は WebView 使用前に呼ぶ制約があり、<code>newConfiguredWebView</code> の最初の操作で適用。非対応端末は共有 CookieManager に<code>x_cookies.txt</code> から Cookie を流し込む（loadUrl の前に必ず完了させる）。</p>",
    files: [ANDROID_DIR + "WebViewProfiles.kt"],
    related: ["android.mainactivity", "android.addaccount"],
  },
  "android.swipebar": {
    title: "SwipeBarOverlayView / SwipeGestureResolver",
    layer: "android",
    summary: "カラム下端のスワイプ領域をネイティブ View で実装",
    body: "<p>タッチは View 自身が全て吸収（<code>onInterceptTouchEvent=true</code>）。判定ロジックは<code>SwipeGestureResolver</code>の純粋関数に分離して単体テストする。遷移の確定は Kotlin が判断せず、React の <code>navigateColumn</code> が決めた時のみ <code>setSwipeBarFlash</code> で演出する。配色は index.css のトークンの複製で、契約テストで一致を保証。</p>",
    files: [
      ANDROID_DIR + "SwipeBarOverlayView.kt",
      ANDROID_DIR + "SwipeGestureResolver.kt",
    ],
    related: ["android.mainactivity"],
  },
  "android.fgservice": {
    title: "VideoDownloadForegroundService",
    layer: "android",
    summary: "動画 DL 中にプロセスを kill されにくくする Foreground Service",
    body: "<p>1 つの Service が Intent の action（START/UPDATE/FINISH）で分岐。型は <code>dataSync</code>。通知文言は <code>res/values{,-ja}/strings.xml</code>（端末言語に従う）。</p>",
    files: [
      ANDROID_DIR + "VideoDownloadForegroundService.kt",
      "src-tauri/gen/android/app/src/main/AndroidManifest.xml",
    ],
    related: ["android.mainactivity"],
  },
  "android.backupagent": {
    title: "MultiColumnXBackupAgent / BackupFileSelector",
    layer: "android",
    summary: "Auto Backup から巨大な再生成可能データを除外する",
    body: '<p><code>android:fullBackupOnly="true"</code> が必須（無いと onFullBackup が呼ばれず空の復元になる）。</p>',
    files: [
      ANDROID_DIR + "MultiColumnXBackupAgent.kt",
      ANDROID_DIR + "BackupFileSelector.kt",
    ],
    docs: ["../development/android-notes.md"],
  },
  "android.generated": {
    title: "generated/（Tauri 自動生成）",
    layer: "android",
    summary: "編集不可。Tauri/wry が生成する Activity・WebView クライアント群",
    body: "<p>WryActivity、RustWebView、RustWebViewClient など。ktlint 対象外。ProGuard の keep が必要な呼び出しだけ <code>proguard-rules.pro</code> に追記している。</p>",
    files: [
      ANDROID_DIR + "generated/WryActivity.kt",
      ANDROID_DIR + "generated/RustWebView.kt",
    ],
  },
});
