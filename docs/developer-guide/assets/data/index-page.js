// index ページ（全体像）の構成図詳細・フロー・一覧データ
window.MCX_DATA = window.MCX_DATA || { flows: {}, catalogs: {}, details: {} };
window.MCX_DATA.flows = window.MCX_DATA.flows || {};
window.MCX_DATA.catalogs = window.MCX_DATA.catalogs || {};
window.MCX_DATA.details = window.MCX_DATA.details || {};

Object.assign(window.MCX_DATA.details, {
  // ---- 構成図（共通・desktop）----
  "index.main-window": {
    title: "メインウィンドウ（React UI）",
    layer: "react",
    summary:
      "アプリ自身の画面（ツールバー・ダイアログ・設定）を描く WebView。カラム WebView の作成・配置を指揮する司令塔でもある。",
    body: "<p>Tauri ウィンドウラベル <code>main</code> の WebView に React 19 の SPA を表示します。ここが表示するのはツールバー、カラムヘッダー、各種ダイアログだけで、<b>X の画面そのものは描画しません</b>（X の画面は別の WebView が受け持つ）。</p><ul><li>状態は Zustand ストア（<code>useAppStore</code>）が一元管理し、変更のたびに <code>save_settings</code> で Rust へ保存</li><li>カラム WebView の作成・リサイズ・削除は <code>services/columnWebview.ts</code> 経由で Rust コマンドを invoke</li><li>多くの Rust コマンドは呼び出し元がこの <code>main</code> であることを検証（<code>require_main_caller</code>）</li></ul>",
    files: [
      "src/App.tsx",
      "src/store/useAppStore.ts",
      "src/hooks/useColumns.ts",
      "src/services/columnWebview.ts",
    ],
    docs: ["../development/project-structure.md"],
    related: ["index.column-webview", "index.rust-commands"],
  },
  "index.column-webview": {
    title: "カラム WebView（x.com を表示）",
    layer: "inject",
    summary:
      "1 カラム = 1 つの子 WebView。x.com を直接読み込み、アカウントごとに分けたデータディレクトリで Cookie を保持する。",
    body: "<p>カラムは <code>window.add_child()</code> で作られるメインウィンドウの<b>子 WebView</b>で、位置とサイズを Rust 側から指定して並べます。ラベルは <code>column-&lt;columnId&gt;</code>。</p><ul><li><b>セッション分離</b>: <code>data_directory</code>（<code>accounts/account-&lt;id&gt;</code>）をアカウントごとに分け、Cookie を混ぜない</li><li><b>inject スクリプト</b>: 作成時に <code>initialization_script</code> として埋め込まれ、ページ読み込みごとに先に実行される</li><li>子 WebView は OS ネイティブ部品なので CSS の <code>z-index</code> が効かない（ダイアログ表示中は画面外へ退避）</li><li>Linux のみ構成が特殊（独立 <code>WebviewWindow</code>）。詳細は <code>linux-column-spec.md</code></li></ul>",
    files: [
      "src-tauri/src/commands/webview/column.rs",
      "src-tauri/src/state.rs",
    ],
    docs: [
      "../development/column-layout-notes.md",
      "../development/linux-column-spec.md",
    ],
    related: ["index.inject", "index.main-window"],
  },
  "index.popup-compose": {
    title: "ポップアップ / コンポーズウィンドウ",
    layer: "rust",
    summary:
      "メディアやリンクを別窓で開くポップアップと、ツイート作成用の常駐ウィンドウ。",
    body: "<p>カラムとは別の WebView として Rust が生成します。</p><ul><li><b>ポップアップ</b>（<code>popup-</code>）: 画像・動画・任意 URL を表示。ツールバーでアカウント切替が可能（<code>switch_popup_session</code>）</li><li><b>コンポーズ</b>（<code>compose-</code>）: 投稿画面。<code>prevent_close</code> + <code>hide</code> で常駐させ再利用するため、破棄には明示 <code>destroy()</code> が必要</li><li>いずれも新規ウィンドウ要求は <code>on_new_window</code> で既定ブラウザへ回す</li></ul><p>Android ではポップアップはネイティブ WebView、コンポーズは X 公式アプリを起動する Intent（<code>launch_compose_tweet_intent</code>）が中心です。</p>",
    files: [
      "src-tauri/src/commands/webview/popup.rs",
      "src-tauri/src/commands/webview/compose.rs",
      "src-tauri/src/commands/webview/external_link.rs",
    ],
    docs: [
      "../development/compose-popup-topbar-notes.md",
      "../development/external-link-new-window-notes.md",
    ],
    related: ["index.rust-commands"],
  },
  "index.inject": {
    title: "inject スクリプト",
    layer: "inject",
    summary:
      "X の画面に注入する JS。NG ワード・広告非表示・自動更新・新着数報告などの“X 側の加工”を担う。",
    body: "<p><code>src-tauri/src/inject/_src/*.ts</code> を Vite でバンドルした <code>*.js</code> を、Rust の <code>build_init_script</code> が設定値（フラグ・NG ワードなど）と一緒に 1 本の文字列へ連結し、WebView 作成時に埋め込みます。</p><ul><li>desktop: x.com 上で <code>window.__TAURI__</code> が <code>column-webview</code> capability の remote 設定により注入され、<code>invoke</code> で Rust コマンドを呼べる</li><li>Android: ネイティブ WebView には Tauri IPC が無いため、<code>addWebMessageListener</code> で公開した JS ブリッジ経由でのみ Kotlin → Rust へ届く</li><li>設定は<b>作成時に埋め込まれる</b>ため、反映には WebView 再作成か <code>eval_in_webview</code> による差分適用が必要</li></ul>",
    files: [
      "src-tauri/src/inject/mod.rs",
      "src-tauri/src/inject/_src/auto_reload.ts",
      "src-tauri/capabilities/column-webview.json",
    ],
    docs: ["../development/inject-ipc-shortcuts-notes.md"],
    related: ["index.column-webview", "index.android-bridge-kt"],
  },
  "index.rust-commands": {
    title: "Rust バックエンド（Tauri コマンド・状態）",
    layer: "rust",
    summary:
      "WebView の生成、設定ファイルの永続化、ウィンドウ管理、ネイティブ機能を担当する層。",
    body: "<p><code>lib.rs</code> が Tauri ビルダーにプラグインとコマンド（<code>generate_handler!</code>）を登録します。</p><ul><li><b>コマンド</b>: React / inject から <code>invoke</code> される関数。追加時は <code>build.rs</code>・capability・<code>generate_handler!</code> の同時更新（ACL）が必須</li><li><b>状態</b>: <code>AppState</code>（WebView レジストリ: label → accountId / dataDir、コンポーズ常駐状態）</li><li><b>設定</b>: <code>settings.json</code> を <code>tauri-plugin-store</code> で扱い、<code>save_store_atomically</code> でアトミックに保存</li><li><code>#[cfg(desktop)]</code> / <code>#[cfg(mobile)]</code> で同名コマンドの実装が分かれる</li></ul>",
    files: [
      "src-tauri/src/lib.rs",
      "src-tauri/src/state.rs",
      "src-tauri/src/commands/settings.rs",
      "src-tauri/src/commands/settings_file.rs",
      "src-tauri/build.rs",
    ],
    docs: [
      "../development/tauri-commands.md",
      "../development/settings-file-crash-safety-notes.md",
    ],
    related: ["index.main-window", "index.settings-file"],
  },
  "index.settings-file": {
    title: "settings.json（永続化）",
    layer: "common",
    summary:
      "アカウント・カラム・全体設定を 1 ファイルに保存。破損耐性のためアトミック書き込みと世代バックアップを持つ。",
    body: "<p><code>app_data_dir</code> 直下の <code>settings.json</code>（<code>appSettings</code> キー）に <code>{ accounts, columns, globalSettings }</code> を保存します。起動時の <code>setup</code> で<b>先に</b>検査・復旧し、その後に自動保存を無効にしたストアを登録する順序が重要です。ブラウザ拡張機能の状態は別キー <code>browserExtensions</code>。</p>",
    files: [
      "src-tauri/src/commands/settings_file.rs",
      "src-tauri/src/commands/settings.rs",
      "src-tauri/src/commands/settings_store.rs",
    ],
    docs: ["../development/settings-file-crash-safety-notes.md"],
    related: ["index.rust-commands"],
  },
  // ---- 構成図（Android）----
  "index.android-main": {
    title: "MainActivity（Android）",
    layer: "android",
    summary:
      "Tauri の WryActivity を継承する単一 Activity。React のメイン WebView の上に、カラム用ネイティブ WebView を重ねる。",
    body: "<p><code>MainActivity</code> が <code>contentRoot</code>（FrameLayout）にカラム / ポップアップ WebView を<b>オーバーレイとして追加</b>し、ID → WebView の対応表（<code>columnWebViews</code>）で管理します。React の WebView は背後に残るのでタブバーなどの UI が下部に常時表示されます。</p><ul><li><code>createColumnWebView</code> / <code>removeColumnWebView</code> / <code>showColumnWebView</code> / <code>hideColumnWebView</code> / <code>evalInColumnWebView</code> などを Rust が JNI 経由で呼ぶ</li><li>同じ ID の WebView が既にあれば再作成せずスキップ（React がリロードされても残るため）</li><li>外部 URL はシステムブラウザへ転送</li></ul>",
    files: [
      "src-tauri/gen/android/app/src/main/java/com/natsuyasai/multicolumnx/MainActivity.kt",
    ],
    docs: ["../development/android-notes.md"],
    related: ["index.android-bridge-rs", "index.android-profile"],
  },
  "index.android-bridge-rs": {
    title: "android_bridge.rs（Rust → Kotlin / JNI）",
    layer: "rust",
    summary:
      "Rust から MainActivity のメソッドを文字列指定で呼ぶ JNI ブリッジ。逆方向（Kotlin → Rust）の JNI エントリポイントも持つ。",
    body: '<p>起動時に <code>AppBridge.initContext</code> が Activity を渡し、Rust 側が <code>GlobalRef</code> として保持します。以降 <code>create_column_webview</code>・<code>eval_in_column_webview</code> 等が <code>env.call_method(activity, "createColumnWebView", シグネチャ…)</code> で呼び出します。</p><div class=\'callout warn\'><b>落とし穴</b><p>メソッド名とシグネチャを文字列で指定するため、<code>MainActivity.kt</code> を変更したら <code>proguard-rules.pro</code> の keep ルールも同時に更新すること。リリースビルド（R8）でのみ <code>NoSuchMethodException</code> になります。</p></div><p>逆方向には <code>Java_..._AppBridge_closeTopPopup</code>・<code>onInsets</code>・<code>onApiRateLimitReport</code> 等の <code>extern "C"</code> 関数があります。</p>',
    files: [
      "src-tauri/src/android_bridge.rs",
      "src-tauri/gen/android/app/src/main/java/com/natsuyasai/multicolumnx/AppBridge.kt",
      "src-tauri/gen/android/app/proguard-rules.pro",
    ],
    docs: ["../development/android-notes.md"],
    related: ["index.android-main"],
  },
  "index.android-profile": {
    title: "WebView Profile（アカウント分離）",
    layer: "android",
    summary:
      "アカウントごとに Cookie を分離するため、WebView の Profile API（account-<id>）を適用する。非対応端末は Cookie 切替で代替。",
    body: "<p><code>WebViewProfiles</code> が <code>WebViewFeature.MULTI_PROFILE</code> の対応を判定し、対応端末では <code>account-&lt;accountId&gt;</code> プロファイルを WebView 生成直後に適用します。非対応端末ではグローバル <code>CookieManager</code> にアクティブカラムのアカウントの Cookie を設定する方式になり、複数カラム同時表示は制限されます（<code>is_webview_profile_supported</code> が可否判定に使われる）。</p>",
    files: [
      "src-tauri/gen/android/app/src/main/java/com/natsuyasai/multicolumnx/WebViewProfiles.kt",
    ],
    docs: ["../development/android-notes.md"],
    related: ["index.android-main"],
  },
  "index.android-bridge-kt": {
    title: "JS ブリッジ（inject ⇄ Android）",
    layer: "android",
    summary:
      "ネイティブ WebView には Tauri IPC が無いので、X 系オリジンに限定した addWebMessageListener で JS → Kotlin → Rust の経路を作る。",
    body: "<p>カラム WebView 作成時に <code>__mcxVideoDownloadBridge</code>（動画ダウンロード要求）と <code>__mcxApiRateLimitBridge</code>（レート制限報告）を公開し、ポップアップには <code>__mcxPopupBridge</code> を公開します。受信側は <code>isAllowedBridgeOrigin</code> でオリジン（x.com / twitter.com とそのサブドメイン）を二重チェックし、端末が <code>WEB_MESSAGE_LISTENER</code> 非対応ならブリッジを公開しません。受け取った内容は <code>AppBridge.on…</code>（JNI）で Rust へ渡されます。</p>",
    files: [
      "src-tauri/gen/android/app/src/main/java/com/natsuyasai/multicolumnx/BridgeOrigins.kt",
      "src-tauri/gen/android/app/src/main/java/com/natsuyasai/multicolumnx/BridgeMessage.kt",
      "src-tauri/gen/android/app/src/main/java/com/natsuyasai/multicolumnx/ApiRateLimitBridge.kt",
      "src-tauri/gen/android/app/src/main/java/com/natsuyasai/multicolumnx/VideoDownloadRequestBridge.kt",
      "src-tauri/gen/android/app/src/main/java/com/natsuyasai/multicolumnx/PopupSessionBridge.kt",
    ],
    docs: ["../development/android-notes.md"],
    related: ["index.inject", "index.android-bridge-rs"],
  },
  "index.android-add-account": {
    title: "AddAccount Activity（ログイン用）",
    layer: "android",
    summary:
      "アカウント追加用の別 Activity。ログイン完了をセンチネルファイルで Rust に知らせる。",
    body: "<p>Android の Tauri では <code>add_child()</code> が使えず、ログイン画面は別 Activity で表示します。完了時に <code>add_account_login_complete</code> ファイルを書き込み、Rust 側（<code>open_add_account_window</code> mobile 版）がそれを 500ms ごとにポーリングして検知します。</p>",
    files: [
      "src-tauri/gen/android/app/src/main/java/com/natsuyasai/multicolumnx/AddAccount.kt",
      "src-tauri/src/commands/account.rs",
    ],
    docs: ["../development/android-notes.md"],
    related: ["index.android-bridge-rs"],
  },
});

Object.assign(window.MCX_DATA.flows, {
  "index.startup": {
    title: "アプリ起動〜カラム表示",
    description:
      "Rust の setup から、設定の読み込み、カラム WebView の生成まで。",
    actors: [
      { id: "rs", label: "Rust (lib.rs / commands)", layer: "rust" },
      { id: "st", label: "settings.json", layer: "common" },
      { id: "ui", label: "React (useAppBootstrap)", layer: "react" },
      { id: "col", label: "カラム WebView (x.com)", layer: "inject" },
    ],
    steps: [
      {
        from: "rs",
        to: "rs",
        label: "setup: 設定ファイルの検査・復旧",
        detail:
          "<p>プラグインが読み込み失敗を握りつぶす前に <code>recover_settings_file</code> で壊れた設定を検出・復旧します。続けて<b>自動保存を無効にしたストア</b>を登録します（順序が重要）。desktop はここでウィンドウ位置・サイズも復元し、Android は <code>store_app_handle</code> で AppHandle を保存します。</p>",
        files: [
          "src-tauri/src/lib.rs",
          "src-tauri/src/commands/settings_file.rs",
        ],
      },
      {
        from: "ui",
        to: "ui",
        label: "platform() で isMobile を判定",
        detail:
          "<p><code>useAppBootstrap</code> の最初の effect。<code>restoreColumns</code> が <code>isMobile</code> を読むため、設定ロードより先に同期的に確定させます。Android では <code>is_webview_profile_supported</code> も invoke します。effect の宣言順を変えてはいけません。</p>",
        files: ["src/hooks/useAppBootstrap.ts"],
      },
      {
        from: "ui",
        to: "rs",
        label: "invoke('load_settings')",
        kind: "invoke",
        detail:
          "<p>Zustand の <code>loadSettings</code> が呼びます。失敗してもアプリは起動し、その場合は上書き保存を止める（<code>settingsSaveBlocked</code>）。</p>",
        files: ["src/store/useAppStore.ts"],
      },
      {
        from: "rs",
        to: "st",
        label: "settings.json を読み取り",
        detail:
          "<p>古い形式の設定は <code>parse_stored_settings</code> で移行されます。読み込めなかった場合は破損ファイルを退避し <code>loadFailed</code> を返します。</p>",
        files: ["src-tauri/src/commands/settings.rs"],
      },
      {
        from: "rs",
        to: "ui",
        label: "{ settings, loadFailed, backupPath }",
        kind: "return",
        detail:
          "<p>ストアに accounts / columns / globalSettings が入り <code>isLoaded = true</code> になります。</p>",
      },
      {
        from: "ui",
        to: "ui",
        label: "restoreColumns（desktop / mobile で分岐）",
        detail:
          "<p><code>isLoaded</code> が true になったタイミングで一度だけ実行。desktop は <code>restoreDesktopColumns</code>（グリッド座標を計算して全カラムを作成）、Android は <code>restoreMobileColumns</code>（アクティブカラムを表示し他は画面外）。</p>",
        files: [
          "src/hooks/useColumns.ts",
          "src/hooks/useDesktopColumns.ts",
          "src/hooks/useMobileColumns.ts",
        ],
      },
      {
        from: "ui",
        to: "rs",
        label: "invoke('create_column_webview') × カラム数",
        kind: "invoke",
        detail:
          "<p>引数は カラム情報・データディレクトリ・位置とサイズ。呼び出し元が <code>main</code> であることを検証してから処理します。</p>",
        files: ["src/services/columnWebview.ts"],
      },
      {
        from: "rs",
        to: "rs",
        label: "build_column_init_script で inject を組み立て",
        detail:
          "<p>全体設定とカラム設定から <code>InitScriptParams</code> を作り、必要な inject スクリプトを 1 本に連結します。ここで NG ワードや各種フラグが WebView に<b>埋め込まれる</b>ため、設定変更の反映方法に影響します。</p>",
        files: [
          "src-tauri/src/commands/webview/column.rs",
          "src-tauri/src/inject/mod.rs",
        ],
      },
      {
        from: "rs",
        to: "col",
        label: "WebView を生成（desktop: add_child / Android: JNI）",
        detail:
          "<p>desktop は <code>window.add_child()</code>（Linux は独立 WebviewWindow）、Android は <code>android_bridge::create_column_webview</code> → <code>MainActivity.createColumnWebView</code>。生成後 <code>WebviewRegistry</code> に label → accountId / dataDir を登録します。</p>",
        files: [
          "src-tauri/src/commands/webview/column.rs",
          "src-tauri/src/android_bridge.rs",
        ],
      },
      {
        from: "col",
        to: "col",
        label: "x.com 読み込み → inject 実行",
        detail:
          "<p>ページ読み込みごとに init script が先に走り、DOM 監視や表示加工が始まります。</p>",
      },
      {
        from: "ui",
        to: "col",
        label: "eval_in_webview（表示サイズの適用）",
        kind: "invoke",
        detail:
          "<p><code>columnScale</code> を IndexedDB 経由で x.com に設定する JS を各カラムで評価します（<code>isLoaded</code> 後のみ）。</p>",
        files: ["src/hooks/useAppBootstrap.ts"],
      },
    ],
  },
  "index.add-account-desktop": {
    title: "アカウント追加（desktop）",
    description:
      "ログイン用ウィンドウを開き、Rust が URL をポーリングして完了を検出する。",
    actors: [
      { id: "ui", label: "React (useAccounts)", layer: "react" },
      { id: "rs", label: "Rust (account.rs)", layer: "rust" },
      { id: "win", label: "ログインウィンドウ (x.com/login)", layer: "inject" },
    ],
    steps: [
      {
        from: "ui",
        to: "rs",
        label: "invoke('open_add_account_window')",
        kind: "invoke",
        detail:
          "<p>追加の二重実行や復元中は <code>startAddAccount</code> が弾きます。</p>",
        files: ["src/hooks/useAccounts.ts"],
      },
      {
        from: "rs",
        to: "rs",
        label: "accountId 採番・データディレクトリ作成",
        detail:
          "<p>UUID から <code>accounts/account-&lt;uuid&gt;</code> を作成。ここがそのアカウント専用の Cookie 保管場所になります。</p>",
        files: ["src-tauri/src/commands/account.rs"],
      },
      {
        from: "rs",
        to: "win",
        label: "WebviewWindowBuilder で /login を表示",
        detail:
          "<p>専用 <code>data_directory</code> 付きの別ウィンドウ（500x700）。</p>",
      },
      {
        from: "rs",
        to: "ui",
        label: "{ accountId, dataDirectory, windowLabel }",
        kind: "return",
        detail:
          "<p>この時点ではまだログイン前。React は <code>ACCOUNT_LOGIN_COMPLETE</code> の listen とウィンドウ破棄の監視を始めます。</p>",
      },
      {
        from: "rs",
        to: "win",
        label: "tokio タスクが URL を 500ms ごとに確認",
        detail:
          '<p>JS 注入に頼らず、<code>url.path() == "/home"</code> になったらログイン完了とみなします。最大 10 分で打ち切り。</p>',
      },
      {
        from: "rs",
        to: "ui",
        label: "emit('account-login-complete')",
        kind: "event",
        detail:
          "<p>ペイロードは <code>xUserId</code>（<code>twid</code> Cookie から取得できた場合）。</p>",
      },
      {
        from: "ui",
        to: "ui",
        label: "名前入力ダイアログ → addAccount",
        detail:
          "<p>名前と識別色を決めてストアに追加し保存。完了後 <code>close_window</code> でログインウィンドウを閉じます。キャンセル時は <code>delete_account_data</code> でディレクトリを削除。</p>",
      },
    ],
  },
  "index.add-account-mobile": {
    title: "アカウント追加（Android）",
    description: "別 Activity でログインし、センチネルファイルで完了を伝える。",
    actors: [
      { id: "ui", label: "React (useAccounts)", layer: "react" },
      { id: "rs", label: "Rust (account.rs)", layer: "rust" },
      { id: "kt", label: "AddAccount.kt (Activity)", layer: "android" },
    ],
    steps: [
      {
        from: "ui",
        to: "rs",
        label: "invoke('open_add_account_window')",
        kind: "invoke",
        detail:
          "<p>この invoke は<b>ログイン完了までブロック</b>します（desktop と違い戻り値が完了の合図）。</p>",
        files: ["src/hooks/useAccounts.ts"],
      },
      {
        from: "rs",
        to: "kt",
        label: "JNI: launch_add_account_activity(accountId)",
        detail:
          "<p>Android では別ウィンドウ生成が使えないため Activity を起動。accountId は WebView Profile の分離に使われます。</p>",
        files: ["src-tauri/src/android_bridge.rs"],
      },
      {
        from: "kt",
        to: "kt",
        label: "ユーザーが x.com にログイン",
        detail:
          "<p>x.com は SPA で pushState 遷移のため URL 監視では検知できず、Activity 内の JS ポーリングで完了を判定します。この間メインの WebView は suspend されます。</p>",
        files: [
          "src-tauri/gen/android/app/src/main/java/com/natsuyasai/multicolumnx/AddAccount.kt",
        ],
      },
      {
        from: "kt",
        to: "rs",
        label: "add_account_login_complete ファイルを書き込み",
        kind: "event",
        detail:
          "<p><code>app_data_dir</code> 直下のセンチネルファイル。キャンセル時は <code>add_account_login_cancelled</code>。</p>",
      },
      {
        from: "rs",
        to: "rs",
        label: "センチネルを 500ms ごとにポーリング",
        detail:
          "<p>JS は suspend されていても tokio ランタイムは動くので、このループで待てます。最大 10 分。</p>",
        files: ["src-tauri/src/commands/account.rs"],
      },
      {
        from: "rs",
        to: "ui",
        label: "{ accountId, dataDirectory, xUserId }",
        kind: "return",
        detail:
          "<p>キャンセル・タイムアウトは Err になり、作成済みディレクトリは削除されます。</p>",
      },
      {
        from: "ui",
        to: "ui",
        label: "名前入力ダイアログ → addAccount",
        detail: "<p>以降は desktop と同じ。</p>",
      },
    ],
  },
  "index.settings-apply": {
    title: "設定変更が各カラムに反映されるまで",
    description:
      "全体設定の「適用」を例に、保存・即時反映・再作成の 3 段階を追う。",
    actors: [
      { id: "ui", label: "React (useSettingsApplyHandlers)", layer: "react" },
      { id: "rs", label: "Rust (commands)", layer: "rust" },
      { id: "col", label: "カラム WebView", layer: "inject" },
    ],
    steps: [
      {
        from: "ui",
        to: "ui",
        label: "updateGlobalSettings（ストア更新）",
        detail:
          "<p>ストアが更新されると同時に <code>saveSettings</code> が走ります（直列化されたチェーンで最新状態を保存）。</p>",
        files: [
          "src/hooks/useSettingsApplyHandlers.ts",
          "src/store/useAppStore.ts",
        ],
      },
      {
        from: "ui",
        to: "rs",
        label: "invoke('save_settings')",
        kind: "invoke",
        detail:
          "<p><code>Store::save</code> を直接呼ばず <code>save_store_atomically</code> を使い、書き込み中の電源断などでも壊れないようにします。</p>",
        files: ["src-tauri/src/commands/settings.rs"],
      },
      {
        from: "ui",
        to: "rs",
        label: "invoke('eval_in_webview') × 対象カラム",
        kind: "invoke",
        detail:
          "<p>NG ワード・テーマ（nightMode Cookie）・言語など<b>実行時に差し替え可能な項目</b>は、JS を評価して即時反映します。Android のカラムは <code>android_bridge::eval_in_column_webview</code> 経由。</p>",
        files: [
          "src/services/columnWebview.ts",
          "src-tauri/src/commands/webview/mod.rs",
        ],
      },
      {
        from: "rs",
        to: "col",
        label: "webview.eval(script)",
        detail:
          "<p>desktop は <code>webview.eval</code>、Android は <code>evaluateJavascript</code>。</p>",
      },
      {
        from: "ui",
        to: "rs",
        label: "recreateStaleColumns → remove / create",
        kind: "invoke",
        detail:
          "<p>init script に<b>埋め込み済みの値が古くなった</b>カラムだけを、<code>remove_column_webview</code> → <code>create_column_webview</code> で作り直します。無関係な項目なら対象は 0 件です。</p>",
      },
      {
        from: "rs",
        to: "col",
        label: "新しい init script で再生成",
        detail:
          "<p>これで最新の設定が埋め込まれた状態になります。カラム個別設定の「適用」は無条件に当該カラムを再構築します。</p>",
      },
    ],
  },
  "index.inject-report": {
    title: "inject → Rust → React の通知（新着数の例）",
    description:
      "x.com 側で検出した出来事を、IPC とイベントで UI に届ける典型パターン。",
    actors: [
      { id: "col", label: "inject (auto_reload.ts)", layer: "inject" },
      { id: "rs", label: "Rust (webview/mod.rs)", layer: "rust" },
      { id: "ui", label: "React (useWebviewEvents)", layer: "react" },
    ],
    steps: [
      {
        from: "col",
        to: "col",
        label: "自動更新後に新着数を算出",
        detail:
          "<p>DOM の差分から新着の件数を数えます。<code>invoke</code> が取得できない環境（IPC 未注入）では何もせず終了する作りです。</p>",
        files: ["src-tauri/src/inject/_src/auto_reload.ts"],
      },
      {
        from: "col",
        to: "rs",
        label: "invoke('report_new_posts_count', { count })",
        kind: "invoke",
        detail:
          "<p>capability <code>column-webview</code> が許可したコマンドだけ呼べます（ACL）。x.com / twitter.com 以外では IPC 自体が注入されません。</p>",
        files: ["src-tauri/capabilities/column-webview.json"],
      },
      {
        from: "rs",
        to: "ui",
        label: "emit('webview-new-posts-count', { label, count })",
        kind: "event",
        detail:
          "<p>送信元ラベルは JS の自己申告ではなく <code>caller.label()</code> から取ります（なりすまし防止）。</p>",
        files: ["src-tauri/src/commands/webview/mod.rs"],
      },
      {
        from: "ui",
        to: "ui",
        label: "listen → カラムの未読バッジ更新",
        detail:
          "<p><code>useWebviewEvents</code> が listen してストア / UI を更新します。</p>",
        files: ["src/hooks/useWebviewEvents.ts"],
      },
    ],
  },
});

Object.assign(window.MCX_DATA.catalogs, {
  "index.interfaces": {
    title: "層間インターフェースの種類",
    columns: [
      { key: "name", label: "種類" },
      { key: "direction", label: "方向" },
      { key: "mechanism", label: "仕組み" },
      { key: "example", label: "代表例", code: true },
      { key: "page", label: "詳細" },
    ],
    filters: [{ key: "direction", label: "方向" }],
    items: [
      {
        name: "invoke（コマンド呼び出し）",
        direction: "React → Rust",
        mechanism:
          "Tauri IPC。<code>@tauri-apps/api/core</code> の invoke が Rust の <code>#[tauri::command]</code> を呼び、Promise で結果を受け取る。コマンド名は <code>src/constants/ipc.ts</code> に集約。",
        example: "create_column_webview",
        page: "react.html / rust.html",
        detail:
          "<p>JS 側の camelCase フィールドは Rust 側 <code>#[serde(rename)]</code> が必要（Tauri はケース変換しない）。多くのコマンドは <code>require_main_caller</code> で呼び出し元を <code>main</code> に限定。コマンドの追加・削除は <code>build.rs</code> の AppManifest と capability の同時更新（ACL 契約テストが検出）。</p>",
        files: [
          "src/constants/ipc.ts",
          "src-tauri/src/lib.rs",
          "src-tauri/build.rs",
          "src-tauri/capabilities/default.json",
        ],
      },
      {
        name: "emit / listen（イベント）",
        direction: "Rust → React",
        mechanism:
          "Rust が <code>app.emit()</code> で全体にイベントを発行し、React が <code>listen()</code> で購読。イベント名は <code>ipc_constants.rs</code> と <code>ipc.ts</code> で同期。",
        example: "webview-new-posts-count",
        page: "rust.html / react.html",
        detail:
          "<p>名前の食い違いは <code>contracts/ipc-constants.json</code> を使う契約テスト（<code>ipc.contract.test.ts</code>）が検出します。</p>",
        files: [
          "src-tauri/src/ipc_constants.rs",
          "contracts/ipc-constants.json",
        ],
      },
      {
        name: "eval_in_webview（JS 評価）",
        direction: "React → カラム WebView",
        mechanism:
          "React が <code>eval_in_webview</code> を invoke し、Rust が対象 WebView で任意 JS を評価。実行時に設定を差し替える手段。",
        example: "eval_in_webview",
        page: "react.html / inject.html",
        detail:
          "<p>メインウィンドウ専用コマンド。Android のカラムは <code>android_bridge::eval_in_column_webview</code>（<code>evaluateJavascript</code>）へ振り分けられる。</p>",
        files: ["src-tauri/src/commands/webview/mod.rs"],
      },
      {
        name: "inject の IPC",
        direction: "inject → Rust（desktop）",
        mechanism:
          "x.com 上のページで <code>window.__TAURI__</code> が使える（<code>column-webview</code> capability の remote 設定）。許可されたコマンドだけ invoke 可能。",
        example: "report_webview_scroll",
        page: "inject.html / rust.html",
        detail:
          "<p>許可は x.com / twitter.com 系のみ。許可コマンドの集合は inject が実際に使うものと厳密一致で検証される。ドメインを広げると外部サイトにコマンドを開放してしまうため厳禁。</p>",
        files: ["src-tauri/capabilities/column-webview.json"],
      },
      {
        name: "初期化スクリプト埋め込み",
        direction: "Rust → inject",
        mechanism:
          "<code>build_init_script</code> が設定値と inject JS を連結し、WebView 作成時の <code>initialization_script</code> に渡す。",
        example: "InitScriptParams",
        page: "inject.html / rust.html",
        detail:
          "<p>値は作成時に固定される。変更を反映するには WebView の再作成か <code>eval_in_webview</code>。</p>",
        files: ["src-tauri/src/inject/mod.rs"],
      },
      {
        name: "JNI（android_bridge）",
        direction: "Rust ⇄ Kotlin",
        mechanism:
          "Rust → Kotlin は <code>env.call_method</code> で MainActivity のメソッドを文字列指定で呼ぶ。Kotlin → Rust は <code>AppBridge</code> の <code>external fun</code> に対応する <code>Java_..._AppBridge_*</code>。",
        example: "createColumnWebView",
        page: "android.html / rust.html",
        detail:
          "<p>メソッドのシグネチャを変えたら ProGuard keep ルールも更新（リリースビルドのみ症状が出る）。</p>",
        files: [
          "src-tauri/src/android_bridge.rs",
          "src-tauri/gen/android/app/src/main/java/com/natsuyasai/multicolumnx/AppBridge.kt",
          "src-tauri/gen/android/app/proguard-rules.pro",
        ],
      },
      {
        name: "JS ブリッジ（addWebMessageListener）",
        direction: "inject → Kotlin（Android）",
        mechanism:
          "ネイティブ WebView に <code>__mcxVideoDownloadBridge</code> 等を公開。X 系オリジンに限定し、受信後 JNI で Rust へ。",
        example: "__mcxApiRateLimitBridge",
        page: "android.html / inject.html",
        detail:
          "<p>Android のカラムには Tauri IPC が無いため、inject から Rust へ届けたい情報はこの経路を使う。</p>",
        files: [
          "src-tauri/gen/android/app/src/main/java/com/natsuyasai/multicolumnx/BridgeOrigins.kt",
        ],
      },
      {
        name: "センチネルファイル",
        direction: "Kotlin → Rust（Android）",
        mechanism:
          "AddAccount Activity が <code>app_data_dir</code> 直下のファイルを書き、Rust が 500ms ポーリングで検知。",
        example: "add_account_login_complete",
        page: "android.html / rust.html",
        detail:
          "<p>JS が suspend される間でも動く tokio ランタイムを利用した完了通知。</p>",
        files: ["src-tauri/src/commands/account.rs"],
      },
      {
        name: "永続化（settings.json）",
        direction: "Rust ⇄ ファイル",
        mechanism:
          "tauri-plugin-store + アトミック書き込み。React は <code>load_settings</code> / <code>save_settings</code> を invoke して間接的に読み書きする。",
        example: "save_store_atomically",
        page: "rust.html / react.html",
        detail:
          "<p>起動時の復旧、<code>.prev</code> 世代、読み込み失敗時の保存ガード（<code>settingsSaveBlocked</code>）がある。</p>",
        files: [
          "src-tauri/src/commands/settings_file.rs",
          "src/store/useAppStore.ts",
        ],
      },
    ],
  },
  "index.directories": {
    title: "主要ディレクトリ",
    columns: [
      { key: "name", label: "パス", code: true },
      { key: "summary", label: "役割" },
      { key: "layer", label: "層" },
    ],
    filters: [{ key: "layer", label: "層" }],
    items: [
      {
        name: "src/",
        summary: "React フロントエンド。",
        layer: "React",
        detail:
          "<p><code>App.tsx</code>（ルート・イベント配線）、<code>store/</code>（Zustand）、<code>hooks/</code>（機能別ロジック）、<code>components/</code>（UI。同じ場所に <code>.stories.tsx</code>）、<code>lib/</code>（純粋関数）、<code>services/</code>（IPC 呼び出し）、<code>constants/ipc.ts</code>（IPC 名）、<code>locales/</code>（辞書）。</p>",
        files: [
          "src/App.tsx",
          "src/store/useAppStore.ts",
          "src/constants/ipc.ts",
        ],
      },
      {
        name: "src-tauri/src/",
        summary: "Rust バックエンド。lib.rs が入口。",
        layer: "Rust",
        detail:
          "<p><code>commands/</code>（Tauri コマンド。<code>webview/</code>・<code>backup/</code>・<code>extensions/</code> などサブ構成）、<code>state.rs</code>、<code>ipc_constants.rs</code>、<code>android_bridge.rs</code>、契約テスト（<code>acl_contract.rs</code>、<code>log_language_contract.rs</code>）。</p>",
        files: ["src-tauri/src/lib.rs", "src-tauri/src/state.rs"],
      },
      {
        name: "src-tauri/src/inject/",
        summary: "X の画面に注入する JS。_src が TypeScript ソース。",
        layer: "inject",
        detail:
          "<p><code>_src/*.ts</code> を <code>npm run build:inject</code>（Vite）で <code>*.js</code> にバンドル。成果物は gitignore 対象で直接編集禁止。<code>mod.rs</code> が連結して init script を生成。</p>",
        files: ["src-tauri/src/inject/mod.rs", "vite.inject.config.ts"],
      },
      {
        name: "src-tauri/capabilities/",
        summary: "Tauri の権限定義（ACL）。",
        layer: "Rust",
        detail:
          "<p><code>default.json</code>（メイン）、<code>column-webview.json</code>（x.com 側 remote）、<code>updater.json</code>。</p>",
        files: [
          "src-tauri/capabilities/default.json",
          "src-tauri/capabilities/column-webview.json",
        ],
      },
      {
        name: "src-tauri/gen/android/",
        summary: "Android プロジェクト（Kotlin / Gradle）。",
        layer: "Android",
        detail:
          "<p><code>app/src/main/java/com/natsuyasai/multicolumnx/</code> に MainActivity 等。<code>generated/</code> は Tauri 自動生成で編集禁止。</p>",
        files: [
          "src-tauri/gen/android/app/src/main/java/com/natsuyasai/multicolumnx/MainActivity.kt",
          "src-tauri/gen/android/app/proguard-rules.pro",
        ],
      },
      {
        name: "contracts/",
        summary: "Rust と TS で一致させる値の正本（JSON）。",
        layer: "共通",
        detail:
          "<p><code>default-settings.json</code>（設定の既定値）、<code>ipc-constants.json</code>（IPC 名）。契約テストが両言語の定義と照合する。</p>",
        files: [
          "contracts/default-settings.json",
          "contracts/ipc-constants.json",
        ],
      },
      {
        name: "docs/development/",
        summary: "開発ノート（設計判断・落とし穴）。",
        layer: "文書",
        detail:
          "<p>機能領域ごとのノート群。一覧は <a href='../development/README.md'>README</a>。</p>",
        files: ["docs/development/README.md"],
      },
      {
        name: "docs/guide/",
        summary: "利用者向けガイド（VitePress、GitHub Pages 公開）。",
        layer: "文書",
        detail:
          "<p>正本は <code>docs/guide/</code>。ページ追加時は <code>docs/.vitepress/config.mts</code> のサイドバーも更新。</p>",
        files: ["docs/.vitepress/config.mts"],
      },
      {
        name: "docs/developer-guide/",
        summary: "このガイド（file:// で開ける静的 HTML）。",
        layer: "文書",
        detail:
          "<p>コード変更に追従するための手順は <code>.claude/skills/developer-guide-maintenance</code>。</p>",
        files: [".claude/skills/developer-guide-maintenance/SKILL.md"],
      },
      {
        name: "docs/specs/",
        summary: "Gherkin 仕様（.feature）。",
        layer: "文書",
        detail:
          "<p>機能追加・挙動変更・バグ修正で仕様を日本語 Gherkin で定義する運用の置き場。テストやコミットからは参照しない。</p>",
        files: ["docs/specs"],
      },
      {
        name: ".claude/skills/",
        summary: "開発フローのスキル定義。",
        layer: "文書",
        detail:
          "<p>feature-development-flow、tdd、gherkin-spec、inject-script-dev など。</p>",
        files: [".claude/skills/feature-development-flow/SKILL.md"],
      },
      {
        name: ".storybook/",
        summary: "Storybook 設定。",
        layer: "React",
        detail: "<p>Story は各コンポーネントと同じディレクトリに置く。</p>",
        files: [".storybook/main.ts", ".storybook/preview.tsx"],
      },
      {
        name: ".github/workflows/",
        summary:
          "CI（ci.yml）・リリース（release.yml）・ドキュメント公開（pages.yml）。",
        layer: "共通",
        detail:
          "<p>Actions はコミット SHA にピン留め。署名鍵を扱うジョブは <code>environment: release</code>。</p>",
        files: [".github/workflows/ci.yml", ".github/workflows/release.yml"],
      },
    ],
  },
  "index.tests": {
    title: "テスト体系",
    columns: [
      { key: "name", label: "種類" },
      { key: "command", label: "コマンド", code: true },
      { key: "target", label: "対象" },
    ],
    filters: [{ key: "area", label: "領域" }],
    items: [
      {
        name: "Vitest 単体テスト",
        command: "npm test",
        target: "React / TS の関数・フック・コンポーネント（jsdom）",
        area: "TS",
        detail:
          "<p><code>vitest.config.ts</code> の <code>unit</code> プロジェクト。テストケース名は日本語。</p>",
        files: ["vitest.config.ts"],
      },
      {
        name: "Storybook play function",
        command: "npm run test:story",
        target: "UI の操作・表示（chromium ブラウザ実行）",
        area: "TS",
        detail: "<p>Story はコンポーネントと同じディレクトリに置く。</p>",
        files: [".storybook/main.ts"],
      },
      {
        name: "プロパティテスト",
        command: "npm run test:property",
        target: "fast-check（TS）/ proptest（Rust）/ kotest-property（Kotlin）",
        area: "共通",
        detail:
          "<p>ファイル名は <code>*.property.test.ts</code>。Rust は <code>mod properties</code>。</p>",
      },
      {
        name: "契約テスト（TS）",
        command: "npm test",
        target: "二重定義の同期・規約の機械的な保証",
        area: "TS",
        detail:
          "<p>例: <code>ipc.contract.test.ts</code>（IPC 名と contracts の一致）、<code>defaults.contract.test.ts</code>（設定既定値）、<code>gridLayout.contract.test.ts</code>（SCSS と rem 定数）、<code>themeContrast.contract.test.ts</code>（配色コントラスト）、<code>swipeBarColors.contract.test.ts</code>（Android の色同期）、<code>unusedKeys.contract.test.ts</code>・<code>resources.contract.test.ts</code>（辞書）、<code>capabilities.contract.test.ts</code>、<code>csp.contract.test.ts</code>、<code>i18nLint.contract.test.ts</code>。</p>",
        files: [
          "src/constants/ipc.contract.test.ts",
          "src/types/defaults.contract.test.ts",
          "src/lib/gridLayout.contract.test.ts",
        ],
      },
      {
        name: "契約テスト（Rust）",
        command: "cargo test --manifest-path src-tauri/Cargo.toml",
        target: "ACL 許可漏れ・ログ言語・WebView builder 規約",
        area: "Rust",
        detail:
          "<p><code>acl_contract.rs</code>（コマンドと capability/AppManifest の整合）、<code>log_language_contract.rs</code>（開発者向けメッセージが英語）。WebView builder の <code>on_new_window</code> / <code>disable_drag_drop_handler</code> / 拡張機能フラグの付け忘れも契約テストで検査される。</p>",
        files: [
          "src-tauri/src/acl_contract.rs",
          "src-tauri/src/log_language_contract.rs",
        ],
      },
      {
        name: "Rust 単体テスト",
        command: "cargo test --manifest-path src-tauri/Cargo.toml",
        target: "Rust のロジック",
        area: "Rust",
        detail:
          "<p><b>事前に <code>npm run build:inject</code> が必要</b>（inject の <code>*.js</code> を <code>include_str!</code> で取り込むため）。テスト関数名に ASCII 大文字を含めない。</p>",
      },
      {
        name: "Rust 静的解析",
        command: "npm run lint:rust",
        target: "cargo clippy --all-targets -- -D warnings",
        area: "Rust",
        detail: "<p>警告もエラー扱い。CI でも実行。</p>",
      },
      {
        name: "Android 単体テスト",
        command:
          "cd src-tauri/gen/android && ./gradlew.bat :app:testUniversalDebugUnitTest",
        target: "Kotlin のロジック",
        area: "Kotlin",
        detail:
          "<p>variant が universal フレーバー付きのため <code>testDebugUnitTest</code> では app のテストが走らない。</p>",
        files: ["docs/development/android-notes.md"],
      },
      {
        name: "ESLint / 型チェック",
        command: "npm run lint / npm run typecheck",
        target: "src の TS/TSX",
        area: "TS",
        detail: "<p>import 順や日本語直書き禁止（i18n）も ESLint で検出。</p>",
        files: ["eslint.config.js"],
      },
    ],
  },
  "index.glossary": {
    title: "用語集",
    columns: [
      { key: "name", label: "用語" },
      { key: "summary", label: "説明" },
      { key: "page", label: "関連ページ" },
    ],
    filters: [],
    items: [
      {
        name: "Tauri",
        summary:
          "Rust 製のデスクトップ / モバイルアプリ基盤。UI は OS の WebView で描画し、Rust と JS が IPC で通信する。本プロジェクトは v2。",
        page: "rust.html",
      },
      {
        name: "WebView",
        summary:
          "アプリに埋め込まれたブラウザ部品。本アプリではメイン UI 用 1 つと、カラムごとの子 WebView がある。",
        page: "index.html",
      },
      {
        name: "IPC / invoke",
        summary:
          "JS から Rust 関数を呼ぶ仕組み。<code>invoke('コマンド名', 引数)</code> が Promise を返す。",
        page: "rust.html",
      },
      {
        name: "emit / listen",
        summary: "イベントの発行と購読。Rust → JS の通知に使う。",
        page: "react.html",
      },
      {
        name: "capability / ACL",
        summary:
          "どのウィンドウがどのコマンドを呼べるかを定義する Tauri の権限設定。",
        page: "rust.html",
      },
      {
        name: "remote capability",
        summary:
          "外部 URL（x.com）のページにも IPC を許可する設定。<code>column-webview.json</code> で対象ドメインを限定。",
        page: "inject.html",
      },
      {
        name: "inject スクリプト",
        summary: "WebView 作成時に埋め込み、X のページ上で動かす JS。",
        page: "inject.html",
      },
      {
        name: "カラム",
        summary:
          "1 つの表示列。ホーム・通知・検索・リスト・カスタム URL・投稿専用・外部 URL などの種類があり、gridRow / gridCol で配置。",
        page: "react.html",
      },
      {
        name: "data_directory",
        summary:
          "WebView の Cookie 等の保存先。アカウントごとに分けてセッションを分離する。",
        page: "rust.html",
      },
      {
        name: "Zustand",
        summary:
          "軽量な React 状態管理ライブラリ。<code>useAppStore</code> がアプリの中心。",
        page: "react.html",
      },
      {
        name: "JNI",
        summary:
          "Java/Kotlin と Rust（ネイティブコード）が相互に関数を呼ぶ仕組み。",
        page: "android.html",
      },
      {
        name: "センチネルファイル",
        summary:
          "プロセス/スレッド間の完了通知用に書き込む目印ファイル。アカウント追加（Android）で使用。",
        page: "android.html",
      },
      {
        name: "WebView Profile",
        summary:
          "Android WebView の Cookie 等をプロファイル単位で分離する機能。",
        page: "android.html",
      },
      {
        name: "契約テスト",
        summary:
          "二重定義された値や規約が食い違っていないかを機械的に検査するテスト。",
        page: "index.html#build-test",
      },
      {
        name: "cfg(desktop) / cfg(mobile)",
        summary:
          "Rust の条件コンパイル属性。同名コマンドでもプラットフォームで実装が異なる。",
        page: "rust.html",
      },
      {
        name: "AppError",
        summary:
          "Rust がフロントへ返すエラー。種別コード＋詳細で、文章は返さず React 側で翻訳する。",
        page: "rust.html",
      },
      {
        name: "Gherkin",
        summary:
          "Given/When/Then で書く仕様記法。本プロジェクトは日本語で <code>docs/specs/*.feature</code> に置く。",
        page: "index.html#workflow",
      },
      {
        name: "常駐ウィンドウ",
        summary:
          "閉じる操作を握って hide するウィンドウ（コンポーズ）。破棄は明示 destroy。",
        page: "rust.html",
      },
    ],
  },
  "index.notes": {
    title: "開発ノート案内（docs/development）",
    columns: [
      { key: "name", label: "ノート", code: true },
      { key: "summary", label: "内容" },
    ],
    filters: [],
    items: [
      {
        name: "project-structure.md",
        summary: "src / src-tauri / Kotlin のファイル構成と役割。",
      },
      {
        name: "tauri-commands.md",
        summary: "独自コマンド一覧と ACL 更新ルール。",
      },
      {
        name: "architecture-overview.md",
        summary:
          "z-index・remote capability・更新セキュリティ・serde・条件コンパイルなど。",
      },
      {
        name: "column-layout-notes.md",
        summary: "グリッドレイアウト、カラム並べ替え、モバイルのスワイプ切替。",
      },
      {
        name: "linux-column-spec.md",
        summary: "Linux カラム WebView の配置・クリッピング正式仕様。",
      },
      {
        name: "inject-ipc-shortcuts-notes.md",
        summary: "inject のビルド、IPC 定数の同期箇所、ショートカット。",
      },
      {
        name: "android-notes.md",
        summary: "Android のアカウント追加、タブバー、APK 更新、ProGuard。",
      },
      {
        name: "compose-popup-topbar-notes.md",
        summary: "投稿ポップアップ、セッション切替、TopBar、close と destroy。",
      },
      {
        name: "settings-file-crash-safety-notes.md",
        summary: "settings.json のアトミック保存と復旧。",
      },
      {
        name: "backup-restore-notes.md",
        summary: "バックアップ／リストア仕様。",
      },
      {
        name: "browser-extensions-notes.md",
        summary: "ブラウザ拡張機能（Windows のみ）。",
      },
      { name: "i18n-notes.md", summary: "多言語対応の規約と追加手順。" },
      {
        name: "ui-scale-notes.md",
        summary: "UI 表示サイズ（rem 規約、Android 全画面ダイアログ）。",
      },
      {
        name: "release-theme-reauth-notes.md",
        summary: "リリース CI、テーマ切替、再認証、更新進捗。",
      },
      {
        name: "external-link-new-window-notes.md",
        summary: "on_new_window による外部リンク処理。",
      },
      {
        name: "api-rate-limit-operations-notes.md",
        summary: "API レート制限モニターの仕様。",
      },
      {
        name: "linux-webview-notes.md",
        summary: "Linux WebView の実装ノート。",
      },
      {
        name: "topbar-column-reorder-notes.md",
        summary: "TopBar のカラム並べ替え（dnd-kit）。",
      },
    ].map(function (n) {
      n.detail =
        '<p><a href="../development/' +
        n.name +
        '">../development/' +
        n.name +
        "</a> を参照。</p>";
      n.files = ["docs/development/" + n.name];
      return n;
    }),
  },
});
