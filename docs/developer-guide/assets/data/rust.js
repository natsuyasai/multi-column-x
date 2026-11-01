/* Rust 層（src-tauri/）ページ用データ。flows / catalogs / details を追記する。 */
window.MCX_DATA = window.MCX_DATA || { flows: {}, catalogs: {}, details: {} };

Object.assign(window.MCX_DATA.flows, {
  "rust.setup": {
    title: "起動 setup（復旧 → ストア登録 → ウィンドウ生成）",
    description:
      "lib.rs の run() が Builder を組み立て、setup クロージャで設定ファイルの検査・復旧とストア登録を行うまでの流れ",
    actors: [
      { id: "os", label: "OS / ランタイム", layer: "common" },
      { id: "rs", label: "lib.rs (run / setup)", layer: "rust" },
      { id: "sf", label: "settings_file.rs", layer: "rust" },
      { id: "st", label: "tauri-plugin-store", layer: "rust" },
      { id: "ui", label: "React (main)", layer: "react" },
    ],
    steps: [
      {
        from: "os",
        to: "rs",
        label:
          "run() 呼び出し（desktop: main.rs / Android: mobile_entry_point）",
        detail:
          "<p>main.rs は <code>run()</code> を呼ぶだけ。Android は <code>#[cfg_attr(mobile, tauri::mobile_entry_point)]</code> が JNI からの入口になる。Linux デスクトップでは最初に <code>linux_codec_env</code> が LD_LIBRARY_PATH / GStreamer 環境を整える（変更が必要なら自プロセスを再起動する）。</p>",
        files: ["src-tauri/src/main.rs", "src-tauri/src/lib.rs"],
      },
      {
        from: "rs",
        to: "rs",
        label: "tauri::Builder にプラグインと State を登録",
        detail:
          "<p>opener（デスクトップは自動クリック無効）、os、store、notification、log を登録し <code>.manage(AppState::new())</code> で共有状態を置く。desktop のみ updater / process / dialog プラグインを追加する（Android は APK 自己更新を別実装のため登録しない）。</p>",
        files: ["src-tauri/src/lib.rs", "src-tauri/src/state.rs"],
      },
      {
        from: "rs",
        to: "sf",
        label: "recover_settings_file(data_dir, now)",
        detail:
          "<p>プラグインが読み込み失敗を握りつぶす<b>前</b>（ストア生成前）に <code>settings.json</code> を検査する。壊れていれば壊れたファイルを退避し、直前世代 <code>settings.json.prev</code> から復元。結果（Healthy / Restored / Unrecoverable）は <code>SettingsRecoveryState</code> として manage され、最初の <code>load_settings</code> が 1 度だけ取り出して React に伝える。</p>",
        files: ["src-tauri/src/commands/settings_file.rs"],
      },
      {
        from: "rs",
        to: "st",
        label:
          "StoreBuilder::new(app, 'settings.json').disable_auto_save().build()",
        detail:
          '<p><b>自動保存を無効にしたストアを先に登録</b>する。以降の <code>app.store("settings.json")</code> はこの登録済みストアを返す。自動保存が生きているとアトミック書き込み（<code>save_store_atomically</code>）をすり抜けるため、この順序（復旧 → 自動保存無効のストア登録）は崩してはいけない。</p>',
        files: ["src-tauri/src/lib.rs"],
      },
      {
        from: "rs",
        to: "rs",
        label: "(desktop) 保存済み windowBounds をメインウィンドウへ適用",
        detail:
          "<p>ストアの <code>appSettings.globalSettings.windowBounds</code> を読み、いずれかのモニタ上に 100px 以上見える場合のみ位置を復元。サイズは最小 600x400 にクランプして適用する。Android には無い処理。</p>",
        files: ["src-tauri/src/lib.rs"],
      },
      {
        from: "rs",
        to: "rs",
        label: "(Android) store_app_handle(app.handle())",
        detail:
          "<p>JNI コールバック（Kotlin → Rust）から <code>emit</code> できるよう AppHandle を保持する。以降 android_bridge の各関数がこれを使う。</p>",
        files: ["src-tauri/src/android_bridge.rs"],
      },
      {
        from: "rs",
        to: "rs",
        label: "invoke_handler(generate_handler![...]) と run()",
        detail:
          "<p>全アプリ独自コマンドを登録して実行開始。cfg 付きの <code>download_and_enable_h264</code>（Linux desktop）/ <code>download_video</code>（desktop）も同じリストにある。メインウィンドウ（tauri.conf.json で定義）が生成され React が起動する。</p>",
        files: ["src-tauri/src/lib.rs"],
      },
      {
        from: "ui",
        to: "rs",
        label: "invoke('load_settings')",
        kind: "invoke",
        detail:
          "<p>React 起動後に設定を読み込む。復旧が走っていれば結果（復元済み / 復旧不能 + 退避パス）がここで 1 度だけ返る。ストアに <code>appSettings</code> が無ければ既定値（<code>AppSettingsData::default()</code>）。</p>",
        files: ["src-tauri/src/commands/settings.rs"],
      },
      {
        from: "rs",
        to: "ui",
        label: "LoadSettingsResult { settings, loadFailed, backupPath }",
        kind: "return",
        detail:
          "<p>パース不能な値が入っていた場合は、元の値を別ファイルへ退避して <code>loadFailed: true</code> と既定値を返す。</p>",
      },
    ],
  },

  "rust.column-webview": {
    title: "カラム WebView 生成 〜 inject 注入",
    description:
      "React の create_column_webview 呼び出しから、init script を載せた子 WebView が x.com を表示するまで（desktop 版）",
    actors: [
      { id: "ui", label: "React (main)", layer: "react" },
      { id: "cmd", label: "webview/column.rs", layer: "rust" },
      { id: "inj", label: "inject/mod.rs", layer: "rust" },
      { id: "wv", label: "カラム WebView (x.com)", layer: "inject" },
      { id: "reg", label: "AppState.registry", layer: "rust" },
    ],
    steps: [
      {
        from: "ui",
        to: "cmd",
        label: "invoke('create_column_webview', { args })",
        kind: "invoke",
        detail:
          "<p><code>args</code> は <code>CreateWebviewArgs</code>（column 設定・dataDirectory・x/y/width/height）。TS 側が gridLayout で計算した座標を渡す。</p>",
        files: ["src-tauri/src/commands/webview/column.rs"],
      },
      {
        from: "cmd",
        to: "cmd",
        label: "require_main_caller / URL とラベル解決",
        detail:
          "<p>呼び出し元が <code>main</code> でなければ <code>forbidden</code> エラー。カラム種別から表示 URL を決め、ラベルを <code>column-&lt;id&gt;</code> にする。</p>",
      },
      {
        from: "cmd",
        to: "inj",
        label: "build_column_init_script(app, column)",
        detail:
          "<p>ストアのグローバル設定（NG ワード・カスタム CSS・言語など）とカラム設定から <code>InitScriptParams</code> を組み立て、<code>build_init_script</code> で JS 文字列を生成する。同梱済みの inject .js（include_str!）に設定オブジェクト <code>window.__multiColumnXConfig</code> などを前置して連結する。</p>",
        files: [
          "src-tauri/src/inject/mod.rs",
          "src-tauri/src/commands/settings_store.rs",
        ],
      },
      {
        from: "cmd",
        to: "wv",
        label: "WebviewBuilder … add_child(main_window)",
        detail:
          "<p>desktop（Windows/macOS）はメインウィンドウの<b>子 WebView</b>として作成。builder には必須設定として <code>.initialization_script</code>、<code>.on_new_window(...)</code>、<code>.disable_drag_drop_handler()</code>、<code>.data_directory(アカウント別)</code>、Windows のみ <code>.browser_extensions_enabled(true)</code> が付く（契約テストが検査）。Linux は子 WebView が使えないため、親付きの独立 <code>WebviewWindow</code> として作る。</p>",
        files: ["src-tauri/src/commands/webview/column.rs"],
      },
      {
        from: "wv",
        to: "wv",
        label: "ページ読み込み時に initialization_script 実行",
        detail:
          "<p>x.com の各ドキュメント読み込み前に init script が走り、DOM 監視ハブ・i18n ハブ・各機能スクリプトが有効化される。詳細は inject ページ。</p>",
      },
      {
        from: "cmd",
        to: "reg",
        label: "registry.register(label, columnId, accountId, dataDirectory)",
        detail:
          "<p>ラベル → (カラム ID, アカウント ID, データディレクトリ) を保持。後で inject からの <code>report_*</code> を受けた際に caller ラベルからアカウントを逆引きするのに使う。</p>",
        files: ["src-tauri/src/state.rs"],
      },
      {
        from: "cmd",
        to: "ui",
        label: "Ok(())（Windows は別タスクで拡張機能を同期）",
        kind: "return",
        detail:
          "<p>Windows ではレスポンスを遅らせないよう別タスクで拡張機能の reconcile を実行し、差分があった場合だけカラムを reload する。外部 URL カラム（<code>pageType == external</code>）は同期対象外。</p>",
      },
      {
        from: "wv",
        to: "cmd",
        label: "invoke('report_new_posts_count') など",
        kind: "invoke",
        detail:
          "<p>inject が <code>window.__TAURI__</code> 経由で報告系コマンドを呼ぶ。Rust は caller のラベルを付けて <code>emit</code> し、React が <code>listen</code> する。</p>",
      },
    ],
  },

  "rust.acl": {
    title: "コマンド呼び出しと ACL 判定",
    description:
      "WebView からの invoke が実行される前に、Tauri の ACL と require_main_caller で二重に判定される流れ",
    actors: [
      { id: "caller", label: "呼び出し元 WebView", layer: "common" },
      { id: "ipc", label: "Tauri IPC / ACL", layer: "rust" },
      { id: "cmd", label: "コマンド関数", layer: "rust" },
    ],
    steps: [
      {
        from: "caller",
        to: "ipc",
        label: "invoke('xxx_command', args)",
        kind: "invoke",
        detail:
          "<p>呼び出し元は main（ローカルの React）か、x.com を表示するカラム/ポップアップ/コンポーズ WebView（remote capability により <code>window.__TAURI__</code> が注入される）。</p>",
      },
      {
        from: "ipc",
        to: "ipc",
        label: "AppManifest に定義されたコマンドか",
        detail:
          "<p><code>build.rs</code> の <code>AppManifest::commands</code> に無いコマンドは ACL 未定義として、capability の許可の有無に関わらず拒否される。</p>",
        files: ["src-tauri/build.rs"],
      },
      {
        from: "ipc",
        to: "ipc",
        label: "呼び出し元 WebView の capability に allow-xxx があるか",
        detail:
          "<p><code>default.json</code> は main 専用、<code>column-webview.json</code> は <code>column-*</code> / <code>popup-*</code> / <code>compose-*</code> / <code>add-account</code> / <code>main</code> かつ remote URL（x.com / twitter.com 系）限定。許可が無ければ 'not allowed by ACL' で拒否。</p>",
        files: [
          "src-tauri/capabilities/default.json",
          "src-tauri/capabilities/column-webview.json",
        ],
      },
      {
        from: "ipc",
        to: "cmd",
        label: "引数を serde でデシリアライズして呼び出し",
        detail:
          "<p>Tauri v2 は JS→Rust のケース変換をしない。camelCase の引数は <code>#[serde(rename)]</code> か <code>#[allow(non_snake_case)]</code> の引数名で受ける。</p>",
      },
      {
        from: "cmd",
        to: "cmd",
        label: "require_main_caller(&caller)（多くのコマンド）",
        detail:
          "<p>ACL で通っても、コマンド自身が caller の <code>webview.label()</code> を検査して main 以外を拒否する（多層防御）。popup 系・report_* 系は inject から呼ばれるため main 限定ではなく、個別の検査（<code>authorize_close_popup</code> など）を持つ。</p>",
        files: ["src-tauri/src/commands/mod.rs"],
      },
      {
        from: "cmd",
        to: "caller",
        label: "Result<T, E> を返す",
        kind: "return",
        detail:
          "<p>エラー型は <code>String</code>（古いコマンド）か、種別コードだけを持つ <code>AppError</code> / <code>BackupError</code>。文章は返さず、React 側が辞書で翻訳する。</p>",
      },
    ],
  },

  "rust.android-column": {
    title: "Android のカラム生成（JNI 経由）",
    description:
      "同じ create_column_webview でも Android では子 WebView ではなく Kotlin 側のネイティブ WebView を生成する",
    actors: [
      { id: "ui", label: "React (main)", layer: "react" },
      { id: "cmd", label: "column.rs (#[cfg(mobile)])", layer: "rust" },
      { id: "br", label: "android_bridge.rs", layer: "rust" },
      { id: "kt", label: "MainActivity.kt", layer: "android" },
    ],
    steps: [
      {
        from: "ui",
        to: "cmd",
        label: "invoke('create_column_webview')",
        kind: "invoke",
      },
      {
        from: "cmd",
        to: "br",
        label: "create_column_webview(id, url, init script, …)",
        detail:
          "<p>init script の生成までは desktop と共通。WebView 自体の生成は JNI 呼び出しに置き換わる。</p>",
        files: ["src-tauri/src/commands/webview/column.rs"],
      },
      {
        from: "br",
        to: "kt",
        label: "JNI: MainActivity のメソッドを呼ぶ",
        detail:
          "<p>Kotlin が content FrameLayout にオーバーレイとして Android WebView を追加する。<b>MainActivity のメソッドシグネチャを変えたら proguard-rules.pro も同時更新</b>（リリースビルドだけ NoSuchMethodException になる）。</p>",
        files: ["src-tauri/src/android_bridge.rs"],
      },
      {
        from: "kt",
        to: "br",
        label: "JNI コールバック（スワイプ・ポップアップ閉じる等）",
        kind: "event",
        detail:
          "<p>Kotlin → Rust のコールバックは保持済みの AppHandle で <code>emit</code>（<code>mobile-swipe-navigate</code> など）に変換され、React が listen する。</p>",
      },
    ],
  },
});

Object.assign(window.MCX_DATA.catalogs, {
  "rust.commands": {
    title: "Tauri コマンド一覧（build.rs の AppManifest 全件）",
    columns: [
      { key: "name", label: "コマンド", code: true },
      { key: "summary", label: "概要" },
      { key: "area", label: "領域" },
      { key: "platform", label: "対象" },
      { key: "caller", label: "呼び出し元" },
    ],
    filters: [
      { key: "area", label: "領域" },
      { key: "platform", label: "対象" },
      { key: "caller", label: "呼び出し元" },
    ],
    items: [
      {
        name: "load_settings",
        summary: "設定ファイルを読み込む（初回は復旧結果も返す）",
        area: "設定",
        platform: "共通",
        caller: "メイン",
        detail:
          "<p>引数なし。戻り値 <code>LoadSettingsResult { settings, loadFailed, backupPath }</code>。起動時の復旧結果（<code>SettingsRecoveryState</code>）が残っていれば 1 度だけ取り出して返す。パース失敗時は元の値を別ファイルへ退避し既定値で継続する。</p>",
        files: [
          "src-tauri/src/commands/settings.rs",
          "src-tauri/src/commands/settings_file.rs",
        ],
      },
      {
        name: "save_settings",
        summary: "設定をストアへ書き込み、アトミックに保存する",
        area: "設定",
        platform: "共通",
        caller: "メイン",
        detail:
          "<p>引数 <code>settings: AppSettingsData</code>。ストアの <code>appSettings</code> を置換して <code>save_store_atomically</code> で保存（一時ファイル → rename、直前世代を <code>.prev</code> に保持）。</p>",
        files: [
          "src-tauri/src/commands/settings.rs",
          "src-tauri/src/commands/settings_file.rs",
        ],
      },
      {
        name: "export_backup",
        summary: "現在の設定をバックアップファイルに書き出す",
        area: "バックアップ",
        platform: "共通",
        caller: "メイン",
        detail:
          "<p>戻り値 <code>bool</code>（保存ダイアログをキャンセルしたら false）。ホワイトリスト型 <code>BackupGlobalSettings</code> に変換して出力する。desktop は dialog + ファイル I/O、Android は Kotlin の SAF を JNI で呼ぶ。</p>",
        files: [
          "src-tauri/src/commands/backup/mod.rs",
          "src-tauri/src/commands/backup/file_io.rs",
        ],
      },
      {
        name: "read_backup",
        summary: "バックアップファイルを選択して検証する（ストアは触らない）",
        area: "バックアップ",
        platform: "共通",
        caller: "メイン",
        detail:
          "<p>戻り値 <code>Option&lt;BackupFile&gt;</code>（キャンセルは None）。サイズ → JSON → 形式識別子 → スキーマバージョン → 移行 → 上限・URL 検証の順で検証。</p>",
        files: ["src-tauri/src/commands/backup/format.rs"],
      },
      {
        name: "apply_restore",
        summary: "現在の設定を退避してから復元内容で置換する",
        area: "バックアップ",
        platform: "共通",
        caller: "メイン",
        detail:
          "<p>引数 <code>payload: RestorePayload</code>、戻り値は置換後の <code>AppSettingsData</code>。accounts / windowBounds / 削除待ち一覧は現在の値を保持。退避（snapshot）→ 置換 → アトミック保存 1 回。保存失敗時はメモリ上のストアも元に戻す。</p>",
        files: [
          "src-tauri/src/commands/backup/mod.rs",
          "src-tauri/src/commands/backup/restore.rs",
        ],
      },
      {
        name: "create_column_webview",
        summary: "カラム WebView を作成する",
        area: "WebView 管理",
        platform: "共通",
        caller: "メイン",
        detail:
          "<p>引数 <code>args: CreateWebviewArgs</code>。desktop は子 WebView（Linux は独立 WebviewWindow）、Android は JNI でネイティブ WebView を生成。init script を載せ、registry に登録する。Windows は拡張機能を別タスクで同期。</p>",
        files: ["src-tauri/src/commands/webview/column.rs"],
      },
      {
        name: "get_external_column_data_directory",
        summary: "外部 URL カラム用のデータ保存先を解決（作成）する",
        area: "WebView 管理",
        platform: "共通",
        caller: "メイン",
        detail:
          "<p>引数 <code>column_id</code>。安全な ID かを検査し、<code>app_data/…</code> 配下のカラム固有ディレクトリを作って文字列パスを返す。アカウントと分離したセッションになる。</p>",
        files: ["src-tauri/src/commands/webview/column.rs"],
      },
      {
        name: "delete_external_column_data",
        summary: "外部 URL カラムのデータディレクトリを削除する",
        area: "WebView 管理",
        platform: "共通",
        caller: "メイン",
        detail:
          "<p>引数 <code>column_id</code>。パスは Rust 側で組み立てるため、呼び出し側は任意パスを指定できない。存在しなければ何もしない。</p>",
        files: ["src-tauri/src/commands/webview/column.rs"],
      },
      {
        name: "remove_column_webview",
        summary: "カラム WebView を削除する",
        area: "WebView 管理",
        platform: "共通",
        caller: "メイン",
        detail:
          "<p>desktop は WebView / WebviewWindow を閉じて registry から除去、Android は JNI で破棄。</p>",
        files: ["src-tauri/src/commands/webview/column.rs"],
      },
      {
        name: "resize_column_webview",
        summary: "カラム WebView の位置・サイズを更新する",
        area: "WebView 管理",
        platform: "共通",
        caller: "メイン",
        detail:
          "<p>Linux は独立ウィンドウのため <code>linux_column_layout</code> で左右クリップを計算し、はみ出し時は幅を縮める/hide する（仕様は linux-column-spec.md）。ダイアログ表示中は x: -9999 へ退避する運用。</p>",
        files: ["src-tauri/src/commands/webview/column.rs"],
        docs: ["../development/linux-column-spec.md"],
      },
      {
        name: "open_popup_window",
        summary: "メディア（画像・動画）ポップアップを開く",
        area: "ポップアップ",
        platform: "共通",
        caller: "カラム WebView",
        detail:
          "<p>引数 <code>url</code>（https かつ X のホストのみ許可）。呼び出し元ラベルから registry を引いて同じアカウントのセッションで開く。main 限定ではない（inject の画像ポップアップから呼ばれる）。</p>",
        files: ["src-tauri/src/commands/webview/popup.rs"],
      },
      {
        name: "open_link_popup_window",
        summary: "任意 URL のリンクポップアップを開く",
        area: "ポップアップ",
        platform: "共通",
        caller: "メイン / カラム WebView",
        detail:
          "<p>引数 <code>accountId?</code>, <code>url</code>（http/https のみ）。呼び出し元が main で accountId 指定があればそれを使い、それ以外は呼び出し元ラベルから解決する。公式設定ページ（https://x.com/settings）の場合はポップアップ追跡ラベルを保持する。</p>",
        files: ["src-tauri/src/commands/webview/popup.rs"],
      },
      {
        name: "close_popup_window",
        summary: "ポップアップ / コンポーズを閉じる",
        area: "ポップアップ",
        platform: "共通",
        caller: "メイン / ポップアップ自身",
        detail:
          "<p>引数 <code>label</code>（<code>popup-</code> / <code>compose-</code> のみ対象）。呼び出し元は main か対象自身。常駐コンポーズは破棄せず hide する（Esc 経路）。</p>",
        files: ["src-tauri/src/commands/webview/popup.rs"],
      },
      {
        name: "switch_popup_session",
        summary: "ポップアップのアカウント（セッション）を切り替える",
        area: "ポップアップ",
        platform: "共通",
        caller: "ポップアップ / コンポーズ",
        detail:
          "<p>引数 <code>accountId</code>, <code>url</code>。caller ラベルそのものを対象にする（他ウィンドウのラベルを騙れない）。desktop はウィンドウ再作成、Android は JNI 経由で再生成。</p>",
        files: ["src-tauri/src/commands/webview/popup.rs"],
      },
      {
        name: "eval_in_webview",
        summary: "指定ラベルの WebView で JS を評価する",
        area: "WebView 管理",
        platform: "共通",
        caller: "メイン",
        detail:
          "<p>引数 <code>label</code>, <code>script</code>。Android のカラムは Tauri の get_webview で見つからないため android_bridge 経由で評価する。</p>",
        files: ["src-tauri/src/commands/webview/mod.rs"],
      },
      {
        name: "report_webview_scroll",
        summary: "WebView の横スクロール量を main へ中継する",
        area: "inject 中継",
        platform: "共通",
        caller: "カラム WebView",
        detail:
          "<p>引数 <code>delta: f64</code>。<code>webview-scroll</code> を emit するだけ。</p>",
        files: ["src-tauri/src/commands/webview/mod.rs"],
      },
      {
        name: "report_new_posts_count",
        summary: "カラムの新着投稿数を main へ中継する",
        area: "inject 中継",
        platform: "共通",
        caller: "カラム WebView",
        detail:
          "<p>引数 <code>count</code>。<code>webview-new-posts-count</code> を <code>{ label, count }</code> で emit。label は<b>引数ではなく</b> caller の実ラベルを使う（なりすまし防止）。</p>",
        files: ["src-tauri/src/commands/webview/mod.rs"],
      },
      {
        name: "report_official_settings",
        summary: "X 公式の表示設定スナップショットを中継する",
        area: "inject 中継",
        platform: "共通",
        caller: "ポップアップ WebView",
        detail:
          "<p>引数 <code>account_id</code>, <code>snapshot</code>。<code>webview-official-settings-captured</code> を emit。Android のポップアップ（Tauri IPC 非対応）は別途 <code>report_official_settings_from_android</code> が同じイベントを emit する。</p>",
        files: ["src-tauri/src/commands/webview/mod.rs"],
      },
      {
        name: "report_api_rate_limit",
        summary: "X 内部 API のレート制限ヘッダを中継する",
        area: "inject 中継",
        platform: "共通",
        caller: "カラム WebView",
        detail:
          "<p>引数 <code>bucket_key, limit, remaining, reset</code>。caller ラベルからアカウントを解決して <code>webview-api-rate-limit</code> を emit。</p>",
        files: ["src-tauri/src/commands/webview/mod.rs"],
        docs: ["../development/api-rate-limit-operations-notes.md"],
      },
      {
        name: "report_keyboard_shortcut",
        summary: "inject が検出したキーボードショートカットを中継する",
        area: "inject 中継",
        platform: "共通",
        caller: "カラム WebView",
        detail:
          "<p>引数 <code>key: String</code>（種別文字列）。<code>webview-keyboard-shortcut</code> を emit。</p>",
        files: ["src-tauri/src/commands/webview/mod.rs"],
      },
      {
        name: "get_mobile_insets",
        summary: "Android のシステムバー（上下）インセットを取得する",
        area: "モバイル UI",
        platform: "共通（Android のみ実値）",
        caller: "メイン",
        detail:
          "<p>戻り値 <code>{ top, bottom }</code>（dp）。Android は Kotlin の WindowInsetsCompat から JNI 経由で保持した値、それ以外は 0。呼び出し元の検査コードは無く、capability（default.json）で main に限定している。</p>",
        files: ["src-tauri/src/commands/webview/mod.rs"],
      },
      {
        name: "set_column_cookies",
        summary: "アクティブカラムのアカウントの Cookie に切り替える",
        area: "WebView 管理",
        platform: "共通（Android のみ実動作）",
        caller: "メイン",
        detail:
          "<p>引数 <code>accountId</code>。WebView Profile API 非対応端末で CookieManager を切り替える。desktop は no-op。</p>",
        files: ["src-tauri/src/commands/webview/column.rs"],
      },
      {
        name: "is_webview_profile_supported",
        summary: "Android の WebView Profile API 対応可否を返す",
        area: "モバイル UI",
        platform: "共通（desktop は常に false）",
        caller: "メイン",
        detail:
          "<p>戻り値 <code>bool</code>。複数カラム同時表示の可否判定に使う。取得失敗時は false（安全側）。</p>",
        files: ["src-tauri/src/commands/webview/mod.rs"],
      },
      {
        name: "update_mobile_swipe_bar",
        summary: "モバイルのスワイプ切替バーの表示設定を反映する",
        area: "モバイル UI",
        platform: "共通（Android のみ実動作）",
        caller: "メイン",
        detail:
          "<p>引数 <code>visible, y, height, opacity, darkTheme</code>。Android は JNI で SwipeBarOverlayView を更新、desktop は no-op。</p>",
        files: ["src-tauri/src/commands/webview/mod.rs"],
      },
      {
        name: "flash_mobile_swipe_bar",
        summary: "スワイプバーのフラッシュ演出を発火する",
        area: "モバイル UI",
        platform: "共通（Android のみ実動作）",
        caller: "メイン",
        detail:
          "<p>引数 <code>direction</code>（'left' | 'right'）。React が実際に遷移を決定したときのみ呼ぶ。</p>",
        files: ["src-tauri/src/commands/webview/mod.rs"],
      },
      {
        name: "open_add_account_window",
        summary: "アカウント追加（ログイン）を開始し完了を検出する",
        area: "アカウント",
        platform: "共通（検出方式が異なる）",
        caller: "メイン",
        detail:
          "<p>desktop: <code>add-account-&lt;uuid8&gt;</code> ウィンドウで https://x.com/login を開き、tokio タスクが URL を 500ms ごとにポーリングして <code>/home</code> 到達で <code>account-login-complete</code> を emit（最大 10 分）。戻り値は accountId / dataDirectory / windowLabel の JSON 文字列。<br>mobile: AddAccount Activity を JNI で起動し、<code>add_account_login_complete</code> センチネルファイルをポーリングしながら<b>コマンド自体がブロック</b>して結果（xUserId 付き）を返す。</p>",
        files: ["src-tauri/src/commands/account.rs"],
      },
      {
        name: "reauth_account_window",
        summary: "既存アカウントの再認証ウィンドウを開く",
        area: "アカウント",
        platform: "共通（検出方式が異なる）",
        caller: "メイン",
        detail:
          "<p>引数 <code>account_id, data_directory</code>（mobile は <code>expected_user_id?</code> も）。desktop は <code>account-reauth-complete</code> を emit、mobile は Activity + センチネル。新セッションのディレクトリを戻り値/ payload に含め、呼び出し元が対象アカウントへ上書きする。</p>",
        files: ["src-tauri/src/commands/account.rs"],
        docs: ["../development/release-theme-reauth-notes.md"],
      },
      {
        name: "delete_account_data",
        summary: "アカウントのデータディレクトリを削除する",
        area: "アカウント",
        platform: "共通",
        caller: "メイン",
        detail:
          "<p>引数 <code>data_directory</code>。<code>app_data/accounts</code> 配下であることを検証し、ファイルロックに備えて 200ms 間隔でリトライしながら削除。</p>",
        files: ["src-tauri/src/commands/account.rs"],
      },
      {
        name: "close_window",
        summary: "指定ラベルのウィンドウを閉じる",
        area: "アカウント",
        platform: "共通",
        caller: "メイン",
        detail:
          "<p>引数 <code>label</code>。<code>get_webview_window(label).close()</code>。prevent_close を握る常駐ウィンドウには効かない点に注意。</p>",
        files: ["src-tauri/src/commands/account.rs"],
      },
      {
        name: "detect_account_user_ids",
        summary: "X ユーザー ID 未設定アカウントの ID を後追いで取得する",
        area: "アカウント",
        platform: "共通（取得方式が異なる）",
        caller: "メイン",
        detail:
          "<p>引数 <code>targets</code>、戻り値 <code>Vec&lt;DetectedUserId&gt;</code>。desktop は各アカウントのセッションの <code>twid</code> Cookie から、Android は JNI（<code>detect_x_user_id</code>）で取得。取得できなければ None（エラーにしない）。</p>",
        files: ["src-tauri/src/commands/account.rs"],
      },
      {
        name: "open_compose_window",
        summary: "ツイート作成ウィンドウ（常駐）を開く",
        area: "WebView 管理",
        platform: "共通",
        caller: "メイン",
        detail:
          "<p>引数 <code>accountId, dataDirectory</code>。<code>AppState.compose</code> の状態で Reuse（再表示）/ Replace（アカウント変更で作り直し）/ CreateNew を決める。desktop の × は prevent_close + hide。</p>",
        files: [
          "src-tauri/src/commands/webview/compose.rs",
          "src-tauri/src/state.rs",
        ],
        docs: ["../development/compose-popup-topbar-notes.md"],
      },
      {
        name: "install_apk_update",
        summary: "APK をダウンロードしてインストーラを起動する",
        area: "更新",
        platform: "Android のみ（他 OS はエラー）",
        caller: "メイン",
        detail:
          "<p>引数 <code>url, expected_sha256</code>。<code>validate_install_request</code> が main 限定・GitHub Releases の .apk URL 限定・64 桁 hex を検査し、Kotlin 側がダウンロード後に SHA-256 照合してから OS インストーラを起動する。</p>",
        files: ["src-tauri/src/commands/update.rs"],
      },
      {
        name: "check_media_codec_support",
        summary: "H.264/AAC デコーダの有無を判定する",
        area: "コーデック",
        platform: "共通（Linux desktop のみ実判定）",
        caller: "メイン",
        detail:
          "<p>戻り値 <code>MediaCodecStatus { h264Available, aacAvailable, h264DownloadApplicable }</code>。Linux AppImage は同梱パーサ + OpenH264 の有無で判定、非 AppImage Linux は GStreamer エレメントの有無、その他 OS は常に利用可能を返す。</p>",
        files: ["src-tauri/src/commands/media_codec.rs"],
      },
      {
        name: "download_and_enable_h264",
        summary: "Cisco OpenH264 をダウンロードして有効化する",
        area: "コーデック",
        platform: "Linux desktop のみ",
        caller: "メイン",
        detail:
          "<p>戻り値 <code>Result&lt;(), AppError&gt;</code>。x86_64 のみ対応、Cisco 公式から取得 → SHA-256 検証 → bzip2 展開 → <code>openh264_lib_dir()</code> 配下へ配置 → GStreamer レジストリキャッシュ削除。呼び出し元は <code>validate_window_label</code> で main のみ。</p>",
        files: [
          "src-tauri/src/commands/openh264_fetch.rs",
          "src-tauri/src/commands/arch_support.rs",
        ],
      },
      {
        name: "download_video",
        summary: "カラム上の動画をダウンロードして保存する",
        area: "動画",
        platform: "desktop のみ（Android は別経路）",
        caller: "カラム WebView",
        detail:
          "<p>引数 <code>variants, suggestedFileName</code>。mp4 progressive があれば 1 ファイル、HLS のみなら映像・音声を別ファイルで保存。保存ダイアログはファイルごと独立にキャンセル可。進捗を <code>video-download-progress</code> として呼び出し元ウィンドウへ <code>emit_to</code>。URL は <code>video.twimg.com</code> 系のみ許可（SSRF 対策）。Android は <code>handle_android_video_download_request</code> がネイティブ通知付きで処理する。</p>",
        files: [
          "src-tauri/src/commands/video_download.rs",
          "src-tauri/src/video/mod.rs",
        ],
      },
      {
        name: "list_extensions",
        summary: "保存済み拡張機能の一覧を返す（missing を最新化）",
        area: "拡張機能",
        platform: "Windows のみ",
        caller: "メイン",
        detail:
          "<p>戻り値 <code>Vec&lt;ExtensionEntry&gt;</code>。Windows 以外は <code>extension.unsupported</code> の AppError。</p>",
        files: ["src-tauri/src/commands/extensions/mod.rs"],
      },
      {
        name: "detect_chrome_extensions",
        summary: "Chrome / Edge にインストール済みの拡張機能を検出する",
        area: "拡張機能",
        platform: "Windows のみ",
        caller: "メイン",
        detail:
          "<p>戻り値 <code>DetectResult { browserFound, items }</code>。同一 ID は Chrome 優先で 1 件にまとめ、候補は由来ブラウザ（chrome / edge）を持つ。追加済み ID は除外。</p>",
        files: [
          "src-tauri/src/commands/extensions/mod.rs",
          "src-tauri/src/commands/extensions/chrome.rs",
        ],
      },
      {
        name: "pick_extension_folder",
        summary: "拡張機能フォルダ選択ダイアログを Rust 側で開く",
        area: "拡張機能",
        platform: "Windows のみ",
        caller: "メイン",
        detail:
          "<p>戻り値 <code>Option&lt;String&gt;</code>。フロントに dialog 権限を与えないため Rust 側で開く。</p>",
        files: ["src-tauri/src/commands/extensions/mod.rs"],
      },
      {
        name: "add_extension_from_folder",
        summary: "展開済みフォルダを拡張機能として追加する",
        area: "拡張機能",
        platform: "Windows のみ",
        caller: "メイン",
        detail:
          "<p>引数 <code>path</code>。manifest を検証し、実パスを保存。<code>_</code> 始まりの予約名エントリがあればサニタイズコピーを作って読み込み、全稼働プロファイルへ反映する。</p>",
        files: [
          "src-tauri/src/commands/extensions/mod.rs",
          "src-tauri/src/commands/extensions/service.rs",
        ],
      },
      {
        name: "add_chrome_extension",
        summary: "Chrome / Edge の拡張機能を chromeId で追加する",
        area: "拡張機能",
        platform: "Windows のみ",
        caller: "メイン",
        detail:
          "<p>引数 <code>chromeId</code>（引数名は Edge 対応前から据え置き）。最新バージョンのフォルダを解決し、由来ブラウザを保存。二重追加はエラー。</p>",
        files: ["src-tauri/src/commands/extensions/mod.rs"],
      },
      {
        name: "set_extension_enabled",
        summary: "拡張機能の有効・無効を切り替える",
        area: "拡張機能",
        platform: "Windows のみ",
        caller: "メイン",
        detail:
          "<p>引数 <code>id, enabled</code>。状態更新後、全稼働プロファイルへ reconcile する。</p>",
        files: ["src-tauri/src/commands/extensions/mod.rs"],
      },
      {
        name: "remove_extension",
        summary: "拡張機能を削除する",
        area: "拡張機能",
        platform: "Windows のみ",
        caller: "メイン",
        detail:
          "<p>引数 <code>id</code>。元フォルダは削除せず、サニタイズコピーだけ削除する。</p>",
        files: ["src-tauri/src/commands/extensions/mod.rs"],
      },
      {
        name: "open_extension_page",
        summary: "拡張機能のポップアップ / オプションを別ウィンドウで開く",
        area: "拡張機能",
        platform: "Windows のみ",
        caller: "メイン",
        detail:
          "<p>指定アカウントのデータで <code>extension-&lt;uuid8&gt;</code> ラベルのウィンドウを開く。このラベルは capability の <code>windows</code> に含めない（リモートコンテンツに IPC を与えない）。</p>",
        files: ["src-tauri/src/commands/extensions/mod.rs"],
      },
    ],
  },

  "rust.events": {
    title: "Rust が発行するイベント（ipc_constants::events）",
    columns: [
      { key: "name", label: "イベント名", code: true },
      { key: "summary", label: "概要" },
      { key: "source", label: "発行元" },
      { key: "listener", label: "購読側" },
    ],
    filters: [{ key: "source", label: "発行元" }],
    items: [
      {
        name: "account-login-complete",
        summary: "アカウント追加のログイン完了（desktop）",
        source: "account.rs（URL ポーリング）",
        listener: "React",
        detail:
          "<p>payload は <code>{ xUserId? }</code>。mobile はセンチネル方式のため emit せず、コマンドの戻り値で返す。</p>",
        files: ["src-tauri/src/commands/account.rs"],
      },
      {
        name: "account-reauth-complete",
        summary: "再認証完了（desktop）",
        source: "account.rs",
        listener: "React",
        detail:
          "<p>payload <code>{ accountId, xUserId }</code>（新セッションのディレクトリも含む）。</p>",
        files: ["src-tauri/src/commands/account.rs"],
      },
      {
        name: "webview-scroll",
        summary: "横スクロール量の中継",
        source: "report_webview_scroll",
        listener: "React",
        detail: "<p>payload は delta（number）。</p>",
        files: ["src-tauri/src/commands/webview/mod.rs"],
      },
      {
        name: "webview-new-posts-count",
        summary: "新着投稿数",
        source: "report_new_posts_count",
        listener: "React",
        detail: "<p>payload <code>{ label, count }</code>。</p>",
        files: ["src-tauri/src/commands/webview/mod.rs"],
      },
      {
        name: "webview-keyboard-shortcut",
        summary: "inject が検出したショートカット",
        source: "report_keyboard_shortcut",
        listener: "React",
        detail: "<p>payload はキー種別文字列。</p>",
        files: ["src-tauri/src/commands/webview/mod.rs"],
      },
      {
        name: "webview-api-rate-limit",
        summary: "API レート制限の残量",
        source: "report_api_rate_limit",
        listener: "React",
        detail:
          "<p>payload <code>{ label, bucketKey, limit, remaining, reset, accountId? }</code>。</p>",
        files: ["src-tauri/src/commands/webview/mod.rs"],
      },
      {
        name: "webview-official-settings-captured",
        summary: "公式設定ページのスナップショット",
        source: "report_official_settings / Android JNI",
        listener: "React",
        detail: "<p>payload <code>{ accountId, snapshot }</code>。</p>",
        files: ["src-tauri/src/commands/webview/mod.rs"],
      },
      {
        name: "official-settings-popup-closed",
        summary: "公式設定ポップアップが実際に閉じられた",
        source: "popup.rs / lib.rs の CloseRequested / Android",
        listener: "React",
        detail:
          "<p>アカウント切替による内部的な閉じ直しは含まない（追跡ラベルの付け替えで区別）。アプリ終了時の誤発火を避けるため、main の CloseRequested で追跡を先にクリアする。</p>",
        files: [
          "src-tauri/src/commands/webview/popup.rs",
          "src-tauri/src/lib.rs",
        ],
      },
      {
        name: "column-webview-crashed",
        summary: "カラム WebProcess のクラッシュ（Linux）",
        source: "column.rs（WebKitGTK のシグナル）",
        listener: "React",
        detail:
          "<p>payload はカラム ID。React が当該カラムを再生成して復旧する。</p>",
        files: ["src-tauri/src/commands/webview/column.rs"],
      },
      {
        name: "column-webview-focused",
        summary: "カラム WebView がフォーカスを得た（Windows / Linux）",
        source: "column.rs",
        listener: "React",
        detail: "<p>payload はカラム ID。未読バッジの自動消去に使う。</p>",
        files: ["src-tauri/src/commands/webview/column.rs"],
      },
      {
        name: "video-download-progress",
        summary: "動画ダウンロード進捗（desktop）",
        source: "video_download.rs（emit_to）",
        listener: "React",
        detail:
          "<p>payload <code>{ fileIndex, fileCount, current, total, phase }</code>。間引き判定（should_emit_progress）つき。</p>",
        files: ["src-tauri/src/commands/video_download.rs"],
      },
      {
        name: "close-topmost-popup",
        summary: "最前面ポップアップを閉じる（Android）",
        source: "android_bridge.rs（JNI）",
        listener: "React",
        detail: "<p>戻るボタン等で Kotlin から通知される。</p>",
        files: ["src-tauri/src/android_bridge.rs"],
      },
      {
        name: "mobile-swipe-navigate",
        summary: "スワイプバーの遷移確定（Android）",
        source: "android_bridge.rs（JNI）",
        listener: "React",
        detail: "<p>payload は 'left' | 'right'。</p>",
        files: ["src-tauri/src/android_bridge.rs"],
      },
      {
        name: "mobile-swipe-progress",
        summary: "スワイプ中の進捗（Android）",
        source: "android_bridge.rs（JNI）",
        listener: "React",
        detail: "<p>payload は 'left' | 'right' | ''。</p>",
        files: ["src-tauri/src/android_bridge.rs"],
      },
      {
        name: "mobile-swipe-double-tap",
        summary: "スワイプバーのダブルタップ（Android）",
        source: "android_bridge.rs（JNI）",
        listener: "React",
        detail: "<p>payload なし。</p>",
        files: ["src-tauri/src/android_bridge.rs"],
      },
    ],
  },

  "rust.state": {
    title: "管理状態（State）と共有定数",
    columns: [
      { key: "name", label: "名前", code: true },
      { key: "summary", label: "役割" },
      { key: "kind", label: "種別" },
    ],
    filters: [{ key: "kind", label: "種別" }],
    items: [
      {
        name: "AppState.registry",
        summary:
          "WebView ラベル → (カラム ID, アカウント ID, データディレクトリ) の対応表",
        kind: "Mutex<WebviewRegistry>",
        detail:
          "<p>カラム/ポップアップ作成時に登録。report_* で caller ラベルからアカウントを解決する、ポップアップを同じセッションで開く、などに使う。</p>",
        files: ["src-tauri/src/state.rs"],
      },
      {
        name: "AppState.compose",
        summary: "常駐コンポーズ WebView の状態（ラベル・アカウント）",
        kind: "Mutex<Option<ComposeSession>>",
        detail:
          "<p><code>decide_compose_action</code> が Reuse / Replace / CreateNew を判定。<code>is_persistent_compose_label</code> で close 時に破棄か hide かを決める。</p>",
        files: ["src-tauri/src/state.rs"],
      },
      {
        name: "AppState.official_settings_popup_label",
        summary: "追跡中の公式設定ポップアップのラベル",
        kind: "Mutex<Option<String>>",
        detail:
          "<p>アカウント切替で新ラベルへ付け替え、実際に閉じられたとき一致すれば <code>official-settings-popup-closed</code> を emit する。</p>",
        files: ["src-tauri/src/state.rs"],
      },
      {
        name: "SettingsRecoveryState",
        summary: "起動時の設定ファイル復旧結果（1 度だけ取り出す）",
        kind: "Mutex<Option<SettingsRecovery>>",
        detail:
          "<p>setup で manage され、最初の <code>load_settings</code> が take する。</p>",
        files: ["src-tauri/src/commands/settings_file.rs"],
      },
      {
        name: "ipc_constants::{events, labels, globals}",
        summary:
          "イベント名・ウィンドウラベル接頭辞・inject 用 window グローバル名",
        kind: "定数",
        detail:
          "<p>TS 側 <code>src/constants/ipc.ts</code> と <code>contracts/ipc-constants.json</code> で同期。変更時は fixture も更新（契約テストが検査）。</p>",
        files: ["src-tauri/src/ipc_constants.rs"],
      },
      {
        name: "extensions::service の直列化 Mutex",
        summary: "拡張機能の状態読み書きと reconcile を直列化",
        kind: "tokio::sync::Mutex（static）",
        detail: "<p>古い状態での上書き競合を防ぐ。</p>",
        files: ["src-tauri/src/commands/extensions/service.rs"],
      },
    ],
  },
});

Object.assign(window.MCX_DATA.details, {
  "rust.main": {
    title: "main.rs / lib.rs",
    layer: "rust",
    summary:
      "エントリポイントとアプリ組み立て。プラグイン・State・setup・ウィンドウイベント・コマンド登録を担う。",
    body: "<p><code>main.rs</code> は <code>run()</code> を呼ぶだけ。<code>lib.rs::run()</code> が Builder にプラグイン（opener/os/store/notification/log、desktop は updater/process/dialog）と State を登録し、<code>setup</code> で設定復旧とストア登録、<code>on_window_event</code>（desktop）で終了時処理、<code>generate_handler!</code> でコマンドを登録する。</p><ul><li>メイン CloseRequested: windowBounds 保存 → 公式設定ポップアップ追跡停止 → 常駐コンポーズの destroy → Linux はカラム/ポップアップを close</li><li>popup- の CloseRequested: 公式設定ポップアップの閉じを検出して emit</li></ul>",
    files: ["src-tauri/src/main.rs", "src-tauri/src/lib.rs"],
    related: ["rust.settings", "rust.acl"],
  },
  "rust.settings": {
    title: "設定の永続化（settings.rs / settings_file.rs / settings_store.rs）",
    layer: "rust",
    summary:
      "settings.json をアトミックに書き、起動時に壊れていれば直前世代から復旧する。",
    body: "<p>設定の型（<code>AppSettingsData</code> 等）と既定値は <code>settings.rs</code>、ファイルの破損耐性は <code>settings_file.rs</code>、他モジュールから設定を読むヘルパーは <code>settings_store.rs</code>。保存は必ず <code>save_store_atomically</code>（<code>Store::save</code> 直呼び禁止）。</p>",
    files: [
      "src-tauri/src/commands/settings.rs",
      "src-tauri/src/commands/settings_file.rs",
      "src-tauri/src/commands/settings_store.rs",
    ],
    docs: ["../development/settings-file-crash-safety-notes.md"],
    related: ["rust.main"],
  },
  "rust.state": {
    title: "state.rs（AppState）",
    layer: "rust",
    summary:
      "WebView レジストリ・常駐コンポーズ・公式設定ポップアップ追跡の共有状態。",
    body: "<p>いずれも <code>Mutex</code> で保護。ロック順序は <b>registry → compose</b>（resolve_account_id の設計）。ロックを保持したまま await しない。</p>",
    files: ["src-tauri/src/state.rs"],
  },
  "rust.ipc": {
    title: "ipc_constants.rs",
    layer: "rust",
    summary:
      "イベント名・ラベル接頭辞・inject グローバル名の定数。TS と fixture で同期。",
    body: "<p><code>contracts/ipc-constants.json</code> と TS 側の対応定数を契約テストで照合する。定数の追加時は Rust / TS / fixture の 3 点を更新。</p>",
    files: ["src-tauri/src/ipc_constants.rs", "contracts/ipc-constants.json"],
  },
  "rust.acl": {
    title: "ACL（build.rs / capabilities / acl_contract.rs）",
    layer: "rust",
    summary:
      "アプリ独自コマンドの許可制御。AppManifest・capability・generate_handler! の 3 点同期が必須。",
    body: "<p><code>build.rs</code> の AppManifest に列挙されたコマンドだけが ACL 対象として定義される。<code>capabilities/default.json</code> は main 用、<code>column-webview.json</code> は x.com/twitter.com の remote URL 限定で inject が使うコマンドのみを許可、<code>updater.json</code> は desktop の更新。<code>acl_contract.rs</code> が 3 点の整合を <code>cargo test</code> で検査する。</p>",
    files: [
      "src-tauri/build.rs",
      "src-tauri/capabilities/default.json",
      "src-tauri/capabilities/column-webview.json",
      "src-tauri/capabilities/updater.json",
      "src-tauri/src/acl_contract.rs",
    ],
    docs: [
      "../development/tauri-commands.md",
      "../development/architecture-overview.md",
    ],
  },
  "rust.callers": {
    title: "require_main_caller（commands/mod.rs）",
    layer: "rust",
    summary: "呼び出し元 WebView のラベルが main でなければ拒否する関数。",
    body: "<p>ACL に加えたコード側の防御。x.com のリモートコンテンツが IPC を持つため、ドメイン限定だけに頼らない。</p>",
    files: ["src-tauri/src/commands/mod.rs"],
  },
  "rust.webview": {
    title: "WebView 管理（commands/webview/）",
    layer: "rust",
    summary:
      "カラム・ポップアップ・コンポーズの WebView 生成/破棄/配置と、inject からの中継コマンド。",
    body: "<p><code>column.rs</code>（カラム）、<code>popup.rs</code>（メディア/リンク/設定ポップアップ）、<code>compose.rs</code>（常駐コンポーズ）、<code>external_link.rs</code>（新規ウィンドウ要求を既定ブラウザへ）、<code>mod.rs</code>（report_* 中継・eval・モバイル UI）。全 builder に <code>on_new_window</code> / <code>disable_drag_drop_handler</code> / Windows の <code>browser_extensions_enabled</code> が必須。</p>",
    files: [
      "src-tauri/src/commands/webview/mod.rs",
      "src-tauri/src/commands/webview/column.rs",
      "src-tauri/src/commands/webview/popup.rs",
      "src-tauri/src/commands/webview/compose.rs",
      "src-tauri/src/commands/webview/external_link.rs",
    ],
    docs: [
      "../development/linux-webview-notes.md",
      "../development/external-link-new-window-notes.md",
    ],
  },
  "rust.account": {
    title: "アカウント（commands/account.rs）",
    layer: "rust",
    summary: "アカウント追加・再認証・削除と、X ユーザー ID の検出。",
    body: "<p>desktop は tokio タスクで URL を 500ms ポーリング（最大 10 分）、mobile は AddAccount.kt がセンチネルファイルを書き込むのを Rust 側でポーリングしてコマンドをブロックする。</p>",
    files: ["src-tauri/src/commands/account.rs"],
  },
  "rust.backup": {
    title: "バックアップ/リストア（commands/backup/）",
    layer: "rust",
    summary:
      "format（検証・変換）/ restore（置換）/ snapshot（退避）/ file_io（プラットフォーム差）の分担。",
    body: "<p>出力は <code>BackupGlobalSettings</code> のホワイトリスト。復元は退避 → 置換 → アトミック保存 1 回。</p>",
    files: [
      "src-tauri/src/commands/backup/mod.rs",
      "src-tauri/src/commands/backup/format.rs",
      "src-tauri/src/commands/backup/restore.rs",
      "src-tauri/src/commands/backup/snapshot.rs",
      "src-tauri/src/commands/backup/file_io.rs",
    ],
    docs: ["../development/backup-restore-notes.md"],
  },
  "rust.extensions": {
    title: "ブラウザ拡張機能（commands/extensions/、Windows のみ）",
    layer: "rust",
    summary:
      "WebView2 に Chrome 拡張を読み込む。純粋ロジックと WebView2 呼び出しを分離。",
    body: "<p>model/store（状態）、manifest/chrome/sanitize（検出・検証・コピー）、reconcile_plan（差分計画）、executor（計画実行）、service（直列化 Mutex と状態操作）、webview2（Windows 専用の COM ブリッジ）、hresult（失敗コード変換）。状態は <code>settings.json</code> の <code>browserExtensions</code> キー（バックアップ対象外）。</p>",
    files: [
      "src-tauri/src/commands/extensions/mod.rs",
      "src-tauri/src/commands/extensions/service.rs",
      "src-tauri/src/commands/extensions/reconcile_plan.rs",
      "src-tauri/src/commands/extensions/webview2.rs",
    ],
    docs: ["../development/browser-extensions-notes.md"],
  },
  "rust.update": {
    title: "更新（commands/update.rs）",
    layer: "rust",
    summary:
      "Android の APK 自己更新の検証入口。desktop の更新は tauri-plugin-updater。",
    body: "<p>呼び出し元 main 限定・URL 許可リスト・SHA-256 検証（Kotlin 側）の 3 層。desktop は minisign 署名で検証される。</p>",
    files: ["src-tauri/src/commands/update.rs"],
  },
  "rust.video": {
    title: "動画ダウンロード（video/ + video_download.rs）",
    layer: "rust",
    summary:
      "variant 選定・HLS 解析・URL 検証・HTTP I/O の純粋ロジックと、保存ダイアログ付きのコマンド本体。",
    body: "<p>mod.rs（選定・ファイル名・URL 検証）、hls.rs（プレイリスト解析）、http.rs（検証を経る公開 API と実 I/O の分離）。</p>",
    files: [
      "src-tauri/src/video/mod.rs",
      "src-tauri/src/video/hls.rs",
      "src-tauri/src/video/http.rs",
      "src-tauri/src/commands/video_download.rs",
    ],
  },
  "rust.codec": {
    title:
      "コーデック（media_codec.rs / openh264_* / linux_codec_env.rs / arch_support.rs）",
    layer: "rust",
    summary: "Linux AppImage で不足する H.264 を OpenH264 で補う。",
    body: "<p>linux_codec_env は起動時に LD_LIBRARY_PATH / GStreamer プラグインパスを整え、必要なら自プロセスを再起動する。</p>",
    files: [
      "src-tauri/src/commands/media_codec.rs",
      "src-tauri/src/commands/openh264_fetch.rs",
      "src-tauri/src/commands/openh264_http_client.rs",
      "src-tauri/src/commands/arch_support.rs",
      "src-tauri/src/linux_codec_env.rs",
    ],
  },
  "rust.errors": {
    title: "エラー（app_error.rs / ui_language.rs）",
    layer: "rust",
    summary: "Rust は文章を返さない。種別コード + 詳細を返し、翻訳は React。",
    body: "<p><code>AppError { code, detail? }</code>。code は <code>&lt;領域&gt;.&lt;camelCase&gt;</code>、辞書の <code>rustError.*</code> と対応。ウィンドウタイトルなど Rust が直接使う文言は <code>ui_language.rs</code> の <code>ui_text</code> で ja/en を持つ。</p>",
    files: [
      "src-tauri/src/commands/app_error.rs",
      "src-tauri/src/commands/ui_language.rs",
    ],
    docs: ["../development/i18n-notes.md"],
  },
  "rust.inject": {
    title: "inject/mod.rs",
    layer: "rust",
    summary:
      "inject 済み JS を include_str! で束ね、設定を前置した init script を組み立てる。",
    body: '<p>ビルド済み <code>inject/*.js</code> を埋め込み、<code>build_init_script</code>（カラム）/ <code>build_popup_init_script</code>（ポップアップ）が文字列を生成。設定値は JSON エンコードして window グローバルへ埋め込む。TS 実装の詳細は <a href="inject.html">inject ページ</a>。</p>',
    files: ["src-tauri/src/inject/mod.rs"],
    docs: ["../development/inject-ipc-shortcuts-notes.md"],
  },
  "rust.android_bridge": {
    title: "android_bridge.rs",
    layer: "rust",
    summary: "Rust ↔ Kotlin の JNI ブリッジ（Android のみ）。",
    body: '<p>Rust → Kotlin（WebView 生成・破棄・eval、スワイプバー、APK インストール等）と Kotlin → Rust コールバック（emit への変換）を担う。詳細は <a href="android.html">Android ページ</a>。</p>',
    files: ["src-tauri/src/android_bridge.rs"],
    docs: ["../development/android-notes.md"],
  },
  "rust.contracts": {
    title: "契約テスト群",
    layer: "rust",
    summary:
      "構造的な取り決め（登録漏れ・日本語ログ・fixture 一致）を cargo test で検査する。",
    body: "<p>acl_contract.rs、log_language_contract.rs、ipc_constants.rs、settings.rs（既定値 fixture）、webview/mod.rs（builder 必須設定）、extensions/mod.rs（capability に含めない）など。</p>",
    files: [
      "src-tauri/src/acl_contract.rs",
      "src-tauri/src/log_language_contract.rs",
      "src-tauri/src/ipc_constants.rs",
    ],
  },
});
