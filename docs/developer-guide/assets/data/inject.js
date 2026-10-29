// inject ページ（X の画面に注入するスクリプト）のデータ
window.MCX_DATA = window.MCX_DATA || { flows: {}, catalogs: {}, details: {} };

const INJ = "src-tauri/src/inject/_src/";
const NOTES = "../development/inject-ipc-shortcuts-notes.md";

Object.assign(window.MCX_DATA.flows, {
  "inject.build-attach": {
    title: "ビルドから WebView への注入まで",
    description:
      "TypeScript で書いた inject が、どうやって X のページの中で動き出すか",
    actors: [
      { id: "dev", label: "開発者 / CI", layer: "common" },
      { id: "vite", label: "Vite (vite.inject.config.ts)", layer: "common" },
      { id: "mod", label: "inject/mod.rs", layer: "rust" },
      { id: "col", label: "column.rs / popup.rs", layer: "rust" },
      { id: "wv", label: "X の WebView", layer: "inject" },
    ],
    steps: [
      {
        from: "dev",
        to: "vite",
        label: "npm run build:inject",
        detail:
          "<p>通常エントリ用と <code>--mode react</code>（header_customizer 専用）の<b>2 パス</b>を順に実行します。tauri:dev / tauri:build / build は前段で自動実行します。</p>",
        files: ["package.json", "vite.inject.config.ts"],
      },
      {
        from: "vite",
        to: "vite",
        label: "_src/*.ts → inject/*.js を出力",
        detail:
          "<p>エントリごとに独立した 1 ファイルを <code>src-tauri/src/inject/</code> へ出力します。minify はしません（出力をそのまま読んでデバッグするため）。出力 .js は <b>gitignore 済み</b>で、リポジトリには入りません。</p>",
        files: ["vite.inject.config.ts"],
      },
      {
        from: "mod",
        to: "mod",
        label: "include_str! で .js を埋め込み",
        detail:
          '<p><code>cargo build</code> 時に <code>include_str!("auto_reload.js")</code> のようにビルド済み JS を<b>文字列としてバイナリへ焼き込み</b>ます。.js が無いとコンパイルエラーになるため、Rust のビルド・テストの前に build:inject が必要です。</p>',
        files: ["src-tauri/src/inject/mod.rs"],
      },
      {
        from: "col",
        to: "mod",
        label: "build_init_script(InitScriptParams)",
        kind: "call",
        detail:
          "<p>カラム WebView を作るとき、カラム個別設定とグローバル設定から <code>InitScriptParams</code> を組み立てて渡します。ポップアップ／コンポーズ窓は <code>build_popup_init_script</code> を使います。</p>",
        files: [
          "src-tauri/src/commands/webview/column.rs",
          "src-tauri/src/commands/webview/popup.rs",
        ],
      },
      {
        from: "mod",
        to: "col",
        label: "連結した 1 本のスクリプト文字列",
        kind: "return",
        detail:
          "<p>順序は <b>dom_observer → <code>window.__mcxLang</code> → i18n → <code>window.__multiColumnXConfig</code> → 各機能</b>。設定で不要な機能は空文字列にして含めません。</p>",
      },
      {
        from: "col",
        to: "wv",
        label: "initialization_script として登録",
        detail:
          "<p>desktop は Tauri の <code>initialization_script</code>、Android はネイティブ WebView の起動スクリプト（<code>newConfiguredWebView(initScript, …)</code>）。ページ遷移・再読み込みのたびに文書の読み込み開始時点で実行されます。</p>",
      },
      {
        from: "wv",
        to: "wv",
        label: "各 IIFE が初期化・自己無効化",
        detail:
          "<p>各スクリプトは即時関数で動き、<code>__multiColumnXConfig</code> を見て自分が不要なら何もしません（例: <code>hideAdEnabled</code> が false の hide_ad）。document.body がまだ無ければ <code>DOMContentLoaded</code> まで待ちます。</p>",
      },
    ],
  },

  "inject.settings-live": {
    title: "設定変更を開いている WebView へ反映する",
    description:
      "WebView を作り直さずに、eval で inject の設定とフックを書き換える流れ（NG ワードを例に）",
    actors: [
      { id: "ui", label: "React（設定適用処理）", layer: "react" },
      { id: "rs", label: "Rust (eval_in_webview)", layer: "rust" },
      { id: "wv", label: "カラム WebView の inject", layer: "inject" },
    ],
    steps: [
      {
        from: "ui",
        to: "ui",
        label: "WEBVIEW_SCRIPTS.applyNgWords(...) で JS 文字列を生成",
        detail:
          "<p><code>src/constants/ipc.ts</code> の <code>WEBVIEW_SCRIPTS</code> は『WebView の中で評価する JS 文字列』を返す関数・定数の集まりです。ここでは config の 4 配列を書き換え、<code>recheckNgWords</code> を呼ぶ文字列を作ります。</p>",
        files: ["src/constants/ipc.ts"],
      },
      {
        from: "ui",
        to: "rs",
        label: "invoke('eval_in_webview', { label, script })",
        kind: "invoke",
        detail:
          "<p>ラベルは <code>column-&lt;id&gt;</code>。このコマンドは<b>メインウィンドウ専用</b>で、呼び出し元を <code>require_main_caller</code> で検証します。X のページ内（inject）からは呼べません（column-webview の capability に含まれない）。</p>",
        files: [
          "src/services/columnWebview.ts",
          "src-tauri/src/commands/webview/mod.rs",
        ],
      },
      {
        from: "rs",
        to: "wv",
        label: "webview.eval(script)",
        detail:
          "<p>desktop は <code>webview.eval</code>。Android のカラムはネイティブ WebView のため <code>android_bridge::eval_in_column_webview</code> 経由で評価します。</p>",
      },
      {
        from: "wv",
        to: "wv",
        label: "config を書き換え → recheckNgWords()",
        detail:
          "<p>ng_word は設定を<b>毎回 <code>window.__multiColumnXConfig</code> から動的に読む</b>ため、書き換えるだけで以降の判定に効きます。<code>recheckNgWords</code> は画面に表示済みの投稿を再走査して即時に隠します。</p>",
        files: [INJ + "ng_word.ts"],
      },
      {
        from: "wv",
        to: "wv",
        label: "（参考）反映手段の無い設定",
        detail:
          '<p>WebView 生成時に埋め込んだ config を読むだけで、対応する <code>WEBVIEW_SCRIPTS</code> が無い設定は、設定適用では即時反映されず、WebView の再生成・再読み込みで反映されます（例: 写真閲覧後のスクロール復元 <code>scrollPosRestoreEnabled</code>）。<span class="badge warn">要確認</span> 項目ごとの反映可否は <code>WEBVIEW_SCRIPTS</code> の定義と呼び出し側で確認してください。</p>',
        files: ["src/hooks/useSettingsApplyHandlers.ts"],
      },
    ],
  },

  "inject.invoke-rust": {
    title: "inject から Rust コマンドを呼ぶ（画像クリック → ポップアップ）",
    description:
      "X のページ内 JS が Tauri IPC を通って Rust のコマンドに届き、ACL で許可される流れ",
    actors: [
      { id: "wv", label: "X ページ内 (image_popup)", layer: "inject" },
      { id: "acl", label: "Tauri ACL (capability)", layer: "common" },
      { id: "rs", label: "Rust (open_popup_window)", layer: "rust" },
      { id: "pop", label: "ポップアップ WebView", layer: "inject" },
    ],
    steps: [
      {
        from: "wv",
        to: "wv",
        label: "メディアリンクのクリックを capture で傍受",
        detail:
          "<p>href を <code>classifyMediaHref</code> で image / video に分類し、設定（<code>imagePopupEnabled</code> / <code>videoPopupEnabled</code>）が有効なら、document に登録したクリックリスナーで傍受してポップアップ表示へ振り替えます。</p>",
        files: [INJ + "image_popup.ts"],
      },
      {
        from: "wv",
        to: "acl",
        label: "window.__TAURI__.core.invoke('open_popup_window', { url })",
        kind: "invoke",
        detail:
          "<p><code>tauri.conf.json</code> の <code>withGlobalTauri: true</code> により注入されるグローバル <code>__TAURI__</code> を使います。送信元ラベルは JS から渡さず、Rust が <code>caller.label()</code> で判定します（なりすまし防止）。</p>",
      },
      {
        from: "acl",
        to: "acl",
        label: "column-webview.json の許可を確認",
        detail:
          "<p><code>remote.urls</code>（x.com / twitter.com 系）かつ <code>windows</code>（column-* / popup-* / compose-* など）に一致する WebView だけが、<code>allow-open-popup-window</code> などの許可済みコマンドを呼べます。許可に無いコマンドは実行時に拒否されます。</p>",
        files: ["src-tauri/capabilities/column-webview.json"],
      },
      {
        from: "acl",
        to: "rs",
        label: "許可 → コマンド実行",
        kind: "call",
        detail:
          "<p>Rust は <code>popup_session_for_caller</code> で呼び出し元 WebView のラベルから（データディレクトリ, アカウント ID）を引き、同じセッションでポップアップを作ります。</p>",
        files: ["src-tauri/src/commands/webview/popup.rs"],
      },
      {
        from: "rs",
        to: "pop",
        label: "build_popup_init_script を付けて生成",
        detail:
          "<p>ポップアップには popup_toolbar と popup_video_autoplay が注入されます（アカウント一覧・現在のアカウント・対象 href・Esc 設定・言語を window 変数として埋め込む）。</p>",
        files: ["src-tauri/src/inject/mod.rs"],
      },
    ],
  },

  "inject.dom-hide": {
    title: "X の DOM 変化を監視して投稿を隠す（ng_word）",
    description:
      "仮想リストで投稿が出入りするタイムラインを、MutationObserver で追って非表示にする",
    actors: [
      { id: "x", label: "X の画面 (DOM)", layer: "common" },
      { id: "ng", label: "ng_word.ts", layer: "inject" },
      { id: "cfg", label: "__multiColumnXConfig", layer: "inject" },
    ],
    steps: [
      {
        from: "ng",
        to: "ng",
        label: "1 秒後に main[role=main] を探して開始",
        detail:
          "<p>X は SPA で描画が遅れるため、<code>setTimeout</code> で待ち、タイムライン要素が見つかるまで 500ms ごとに再試行します。見つかったら既存の <code>article</code> を一度総チェックします。</p>",
        files: [INJ + "ng_word.ts"],
      },
      {
        from: "x",
        to: "ng",
        label: "MutationObserver: childList / subtree",
        kind: "event",
        detail:
          '<p>追加ノードのうち <code>article[role="article"]</code>（またはその子孫の article）だけを判定対象にします。スクロールで新しい投稿が描画されるたびに呼ばれます。</p>',
      },
      {
        from: "ng",
        to: "cfg",
        label:
          "ngWords + globalNgWords / whitelist / repostHiddenUserIds を毎回参照",
        detail:
          "<p>カラム個別とグローバルの設定を足し合わせます。判定の純粋関数は <code>ng_word_matcher.ts</code>（<code>/正規表現/</code> 形式にも対応）と <code>repost_hide_matcher.ts</code>（リポストした人の ID）に分離されており、DOM 無しでテストできます。</p>",
        files: [INJ + "ng_word_matcher.ts", INJ + "repost_hide_matcher.ts"],
      },
      {
        from: "ng",
        to: "x",
        label: "cellInnerDiv ごと remove / なければ display:none",
        detail:
          "<p>仮想リストのセル（<code>cellInnerDiv</code> で <code>transform</code> 付きの absolute）は、<b>セルごと取り除いて</b>空白が残らないようにします。それ以外は <code>display: none !important</code>。</p>",
      },
    ],
  },

  "inject.keyboard": {
    title: "カラム内のショートカットをメインへ転送する",
    description:
      "カラム WebView にフォーカスがあるとき、メインウィンドウの keydown は届かないため inject が代わりに捕捉する",
    actors: [
      { id: "wv", label: "keyboard_shortcut.ts", layer: "inject" },
      { id: "rs", label: "Rust (report_keyboard_shortcut)", layer: "rust" },
      { id: "ui", label: "React (useKeyboardShortcuts)", layer: "react" },
    ],
    steps: [
      {
        from: "wv",
        to: "wv",
        label: "window keydown → キー種別に変換",
        detail:
          "<p>Ctrl 併用（t / l / n / , / b、Ctrl+Shift+A、Ctrl+1〜9）と修飾無し（r / ?）を文字列に変換します。修飾無しキーは入力欄にフォーカス中は無視します。<b>desktop のみ</b>注入されます。</p>",
        files: [INJ + "keyboard_shortcut.ts"],
      },
      {
        from: "wv",
        to: "rs",
        label: "invoke('report_keyboard_shortcut', { key })",
        kind: "invoke",
        detail:
          "<p>column-webview の capability で許可された 10 コマンドのひとつです。</p>",
      },
      {
        from: "rs",
        to: "ui",
        label: "emit('webview-keyboard-shortcut', key)",
        kind: "event",
        detail:
          "<p>イベント名は <code>ipc_constants::events::WEBVIEW_KEYBOARD_SHORTCUT</code>。ペイロードはキー種別の文字列そのままです。</p>",
        files: [
          "src-tauri/src/commands/webview/mod.rs",
          "src-tauri/src/ipc_constants.rs",
        ],
      },
      {
        from: "ui",
        to: "ui",
        label: "listen → 同じ操作を実行",
        detail:
          "<p>メインウィンドウにフォーカスがあるときの keydown と同じ処理に合流します。<b>ショートカット追加は 3 箇所同期</b>（keydown ハンドラ・listen 側の switch・inject）が必要です。</p>",
        files: ["src/hooks/useKeyboardShortcuts.ts"],
      },
    ],
  },

  "inject.ratelimit": {
    title: "API レート制限ヘッダの報告（desktop と Android の分岐）",
    description:
      "XHR のレスポンスヘッダを読み、Tauri IPC があれば invoke、なければ Android ブリッジへ",
    actors: [
      { id: "wv", label: "api_rate_limit_monitor.ts", layer: "inject" },
      { id: "rs", label: "Rust (report_api_rate_limit)", layer: "rust" },
      { id: "kt", label: "Android (ApiRateLimitBridge)", layer: "android" },
      { id: "ui", label: "React（ツールバー）", layer: "react" },
    ],
    steps: [
      {
        from: "wv",
        to: "wv",
        label: "XMLHttpRequest を差し替えてヘッダを取得",
        detail:
          "<p>X の内部 API（GraphQL / v1.1）の <code>x-rate-limit-limit / remaining / reset</code> を読み、URL から bucketKey を決めます。fetch は使われていないことを実機で確認済みのため XHR のみ対象です。</p>",
        files: [INJ + "api_rate_limit_monitor.ts"],
      },
      {
        from: "wv",
        to: "rs",
        label: "desktop: invoke('report_api_rate_limit', …)",
        kind: "invoke",
        detail:
          "<p><code>__TAURI_INTERNALS__.invoke</code> → <code>__TAURI__.core.invoke</code> → <code>__TAURI__.invoke</code> の順で使える関数を探します。label は渡しません（Rust が <code>caller.label()</code> で判定）。</p>",
      },
      {
        from: "wv",
        to: "kt",
        label: "Android: __mcxApiRateLimitBridge.postMessage(JSON)",
        detail:
          "<p>Android のカラムはネイティブ WebView で Tauri IPC が無いため、<code>addWebMessageListener</code> で公開された専用ブリッジに <code>{ type: 'reportApiRateLimit', payload }</code> を送ります。オリジンは x.com / twitter.com 系に限定されます。</p>",
        files: [
          "src-tauri/gen/android/app/src/main/java/com/natsuyasai/multicolumnx/ApiRateLimitBridge.kt",
          "src-tauri/gen/android/app/src/main/java/com/natsuyasai/multicolumnx/BridgeOrigins.kt",
        ],
      },
      {
        from: "rs",
        to: "ui",
        label: "emit('webview-api-rate-limit')",
        kind: "event",
        detail:
          '<p>ペイロードは { label, bucketKey, limit, remaining, reset }。詳細は <a href="../development/api-rate-limit-operations-notes.md">api-rate-limit-operations-notes.md</a>。</p>',
      },
    ],
  },
});

Object.assign(window.MCX_DATA.catalogs, {
  "inject.scripts": {
    title: "inject 機能スクリプト一覧",
    columns: [
      { key: "name", label: "ファイル（_src/）", code: true },
      { key: "summary", label: "機能" },
      { key: "enable", label: "有効化条件" },
      { key: "target", label: "対象 WebView" },
      { key: "platform", label: "対象OS" },
      { key: "test", label: "テスト" },
    ],
    filters: [
      { key: "kind", label: "種別" },
      { key: "target", label: "対象 WebView" },
      { key: "platform", label: "対象OS" },
    ],
    items: [
      {
        name: "dom_observer.ts",
        summary:
          "document.body の変化を 1 つの MutationObserver で監視し、rAF で 1 フレーム 1 回にまとめて購読者へ配る共有ハブ。window.__mcxDomObserver.subscribe を公開。",
        enable:
          "常に（カラム・ポップアップ。external カラムを除く）。連結の最初",
        target: "カラム / ポップアップ / コンポーズ",
        platform: "共通",
        test: "あり",
        kind: "共通基盤",
        detail:
          "<p>sidebar_hide / mobile_area_hide / popup_toolbar / popup_video_autoplay / return_to_last_read / useHeaderCustomizer が購読します。ハブが無い環境（単体テストなど）でも動くよう、購読側は自前の MutationObserver にフォールバックする実装です。冪等（二重注入されても 1 つだけ）。</p>",
        files: [INJ + "dom_observer.ts", INJ + "dom_observer.test.ts"],
      },
      {
        name: "i18n.ts",
        summary:
          "inject 自前 UI の日本語・英語辞書と切替ハブ（window.__mcxI18n = { lang, t, setLang, apply, onChange }）。",
        enable: "常に（external カラムを除く）。dom_observer の直後",
        target: "カラム / ポップアップ / コンポーズ",
        platform: "共通",
        test: "あり（+ 契約テスト）",
        kind: "共通基盤",
        detail:
          "<p>初期言語は直前に Rust が埋める <code>window.__mcxLang</code>。<code>t</code> は 現在言語 → ja → キー文字列の順に引きます。カラムは設定適用時に <code>setInjectLanguage</code> で即時切替、ポップアップは作成時の言語で固定です。</p>",
        files: [
          INJ + "i18n.ts",
          INJ + "i18n.test.ts",
          INJ + "i18n.contract.test.ts",
        ],
      },
      {
        name: "constants.ts",
        summary:
          "inject が invoke するコマンド名の参照用一覧（INJECT_COMMANDS）。",
        enable: "ビルド対象外（import 不可。ドキュメント扱い）",
        target: "-",
        platform: "-",
        test: "なし",
        kind: "共通基盤",
        detail:
          "<p>各スクリプトの先頭にローカル const として同じ値を重複定義する決まりで、このファイルは値の一覧を残すためだけにあります。</p>",
        files: [INJ + "constants.ts"],
      },
      {
        name: "types.d.ts",
        summary:
          "Window 拡張（__multiColumnX, __multiColumnXConfig, __TAURI__, 各ブリッジ, __mcxI18n など）の型定義。",
        enable: "型のみ",
        target: "-",
        platform: "-",
        test: "なし",
        kind: "共通基盤",
        detail:
          "<p>メインアプリ側の Window 拡張とは別系統なので、同じインタフェースを両方で手動同期する必要があります。config のキーを増やしたら <code>MultiColumnXConfig</code> にも追記します。</p>",
        files: [INJ + "types.d.ts"],
      },
      {
        name: "tab_selector.ts",
        summary:
          "ホーム URL の ?<タブ名> クエリ（値なしの最初のキー）に一致するタブ名のタブを、タブが描画されるまで待って自動クリックする。",
        enable: "常に（カラム）",
        target: "カラム",
        platform: "共通",
        test: "あり",
        kind: "タイムライン",
        files: [INJ + "tab_selector.ts", INJ + "tab_selector.test.ts"],
      },
      {
        name: "header_customizer.ts",
        summary:
          "ヘッダー（ナビ）・投稿欄の非表示と、表示するリンクを選ぶ独自メニュー（showCustomMenu / visibleLinks）。React 製。applyAreaVisibility を公開。",
        enable:
          "hideHeaderEnabled または hideTweetInputEnabled が true（Rust 側で含めるか決定）",
        target: "カラム",
        platform: "共通",
        test: "あり",
        kind: "表示カスタマイズ",
        detail:
          "<p>React 本体を同梱するため生成 JS が約 587KB と他の数十倍になります。詳細設計の『header_customizer』を参照。</p>",
        files: [
          INJ + "header_customizer.ts",
          INJ + "HeaderCustomizer.tsx",
          INJ + "useHeaderCustomizer.ts",
          INJ + "headerCustomizerTypes.ts",
        ],
      },
      {
        name: "auto_reload.ts",
        summary:
          "自動更新・手動更新の実行（triggerReload）、新着投稿の検知と件数報告、通知・検索ページの常時監視。",
        enable: "常に（カラム）。更新の発火は React 側のタイマー/操作",
        target: "カラム",
        platform: "共通",
        test: "あり（+ プロパティ）",
        kind: "更新・新着",
        detail:
          '<p>window.__multiColumnX.triggerReload / disposeAutoReloadWatchers を公開。新着数は <code>report_new_posts_count</code> で Rust へ。<b>Android のカラムには Tauri IPC が無い</b>ため、この invoke は何もしません（Android の未読経路は <span class="badge warn">要確認</span>）。</p>',
        files: [
          INJ + "auto_reload.ts",
          INJ + "auto_reload.test.ts",
          INJ + "auto_reload.property.test.ts",
        ],
      },
      {
        name: "return_to_last_read.ts",
        summary:
          "ホームの『前回の境目へ戻る』ボタン（更新前の先頭付近を記録し、更新後に探して戻る）と、写真閲覧後のスクロール位置復元。",
        enable:
          "page_type が home のカラムだけ連結。ボタンは returnToLastReadEnabled、写真復元は scrollPosRestoreEnabled（縮小表示 ON が前提）",
        target: "カラム（ホーム）",
        platform: "共通",
        test: "あり（+ ロジック分離 + プロパティ）",
        kind: "更新・新着",
        detail:
          "<p>triggerReload をラップして更新を検知するので、<b>auto_reload より後ろに連結</b>する必要があります（Rust のテストで順序を検証）。純粋ロジックは return_to_last_read_logic.ts。</p>",
        files: [
          INJ + "return_to_last_read.ts",
          INJ + "return_to_last_read_logic.ts",
          INJ + "return_to_last_read.test.ts",
          INJ + "return_to_last_read_logic.property.test.ts",
        ],
      },
      {
        name: "video_control.ts",
        summary:
          "動画の自動再生を抑止（最初の play() だけ通して停止、ユーザー操作・mediaviewer では解除）。",
        enable: "グローバル設定 videoAutoPlayStopEnabled が true のとき連結",
        target: "カラム",
        platform: "共通",
        test: "あり（+ プロパティ）",
        kind: "メディア",
        detail:
          "<p>HTMLMediaElement.prototype.play を差し替える方式。X のプレイヤーは pause されると play() を再試行するため、毎回 pause で応じると無限ループになる点に配慮した設計です。</p>",
        files: [INJ + "video_control.ts", INJ + "video_control.test.ts"],
      },
      {
        name: "small_image.ts",
        summary:
          "ツイート画像の幅を縮小表示（tweetPhoto の親ルートの width を設定）。",
        enable: "smallImageEnabled（幅は smallImageWidth）",
        target: "カラム",
        platform: "共通",
        test: "あり",
        kind: "メディア",
        files: [INJ + "small_image.ts", INJ + "small_image.test.ts"],
      },
      {
        name: "blur_image.ts",
        summary: "画像にぼかしを掛け、クリックで解除/再ぼかし。",
        enable: "blurImageEnabled（量は blurImageAmount）",
        target: "カラム",
        platform: "共通",
        test: "あり",
        kind: "メディア",
        files: [INJ + "blur_image.ts", INJ + "blur_image.test.ts"],
      },
      {
        name: "hide_ad.ts",
        summary:
          "広告（placementTracking / 「広告」「Promoted」「Ad」表記）の投稿セルを除去。",
        enable: "hideAdEnabled（グローバル設定）",
        target: "カラム",
        platform: "共通",
        test: "あり",
        kind: "フィルタ",
        detail:
          "<p>AD_TEXTS は X の画面の文言と照合する値なので、日本語のまま i18n 契約テストの許可リストに載っています。</p>",
        files: [INJ + "hide_ad.ts", INJ + "hide_ad.test.ts"],
      },
      {
        name: "ng_word.ts",
        summary:
          "NG ワード・ホワイトリスト・リポスト非表示ユーザーに一致する投稿を除去/非表示。recheckNgWords を公開。",
        enable: "常に連結。設定が空なら実質何もしない",
        target: "カラム",
        platform: "共通",
        test: "あり（+ matcher プロパティ）",
        kind: "フィルタ",
        files: [
          INJ + "ng_word.ts",
          INJ + "ng_word_matcher.ts",
          INJ + "repost_hide_matcher.ts",
          INJ + "ng_word.test.ts",
        ],
      },
      {
        name: "custom_css.ts",
        summary:
          "カスタム CSS の style 要素を作成・差し替え。X の再描画で消えたら復元。applyCustomCSS を公開。",
        enable:
          "常に連結（external カラムではこれだけ）。値があると連結末尾で applyCustomCSS を呼ぶ",
        target: "カラム（external 含む）",
        platform: "共通",
        test: "あり",
        kind: "表示カスタマイズ",
        files: [INJ + "custom_css.ts", INJ + "custom_css.test.ts"],
      },
      {
        name: "sidebar_hide.ts",
        summary:
          "右サイドバー(sidebarColumn)を隠し、メイン列(primaryColumn)の最大幅を解除して横幅いっぱいに広げる。",
        enable: "常に（カラム）",
        target: "カラム",
        platform: "共通",
        test: "あり",
        kind: "表示カスタマイズ",
        files: [INJ + "sidebar_hide.ts", INJ + "sidebar_hide.test.ts"],
      },
      {
        name: "notification_header_hide.ts",
        summary: "通知ページの設定アプリバーを CSS(:has) で隠す。",
        enable: "常に（カラム）",
        target: "カラム",
        platform: "共通",
        test: "あり",
        kind: "表示カスタマイズ",
        detail:
          "<p>セレクタ中の aria-label=&quot;通知タイムライン&quot; は X の画面と照合する日本語で、許可リストに載っています。</p>",
        files: [
          INJ + "notification_header_hide.ts",
          INJ + "notification_header_hide.test.ts",
        ],
      },
      {
        name: "mobile_area_hide.ts",
        summary:
          "モバイル幅レイアウトの TopNavBar・#layers 配下の投稿ボタン/ヘッダー要素の個別非表示。applyLayersHide を公開。",
        enable:
          "is_mobile のとき連結。hideHeaderEnabled / hideTweetInputEnabled を参照",
        target: "カラム",
        platform: "Android のみ",
        test: "あり",
        kind: "表示カスタマイズ",
        files: [INJ + "mobile_area_hide.ts", INJ + "mobile_area_hide.test.ts"],
      },
      {
        name: "compose_only.ts",
        summary:
          "投稿カラム用。/home のインライン投稿フォーム以外をスポットライト CSS で隠す。モバイル狭幅ではコンポーズ FAB を自動タップして /compose/post へ。",
        enable: "page_type が compose のカラムだけ連結（compose_only_enabled）",
        target: "カラム（投稿カラム）",
        platform: "共通",
        test: "あり",
        kind: "表示カスタマイズ",
        detail:
          "<p>『投稿カラム』（page_type=compose のカラム）であり、別物の <code>compose-</code> ラベルのコンポーズ窓（popup_toolbar を使う）とは違います。</p>",
        files: [INJ + "compose_only.ts", INJ + "compose_only.test.ts"],
      },
      {
        name: "image_popup.ts",
        summary:
          "画像/動画リンクのクリックを傍受して open_popup_window でポップアップ表示。",
        enable: "imagePopupEnabled / videoPopupEnabled（undefined は有効扱い）",
        target: "カラム",
        platform: "desktop のみ",
        test: "あり（+ プロパティ）",
        kind: "ポップアップ・操作",
        files: [
          INJ + "image_popup.ts",
          INJ + "image_popup.test.ts",
          INJ + "image_popup.property.test.ts",
        ],
      },
      {
        name: "context_menu.ts",
        summary:
          "リンク右クリックで独自メニュー『ポップアップで開く』（open_link_popup_window）。",
        enable: "常に（desktop カラム）",
        target: "カラム",
        platform: "desktop のみ",
        test: "あり",
        kind: "ポップアップ・操作",
        files: [INJ + "context_menu.ts", INJ + "context_menu.test.ts"],
      },
      {
        name: "scroll_event.ts",
        summary:
          "横方向のホイール/Shift+ホイールを横スクロール量として Rust に報告（report_webview_scroll）。",
        enable: "常に（desktop カラム）",
        target: "カラム",
        platform: "desktop のみ",
        test: "あり",
        kind: "ポップアップ・操作",
        files: [INJ + "scroll_event.ts", INJ + "scroll_event.test.ts"],
      },
      {
        name: "keyboard_shortcut.ts",
        summary:
          "カラム内で押されたショートカットを report_keyboard_shortcut でメインへ転送。",
        enable: "常に（desktop カラム）",
        target: "カラム",
        platform: "desktop のみ",
        test: "あり",
        kind: "ポップアップ・操作",
        files: [
          INJ + "keyboard_shortcut.ts",
          INJ + "keyboard_shortcut.test.ts",
        ],
      },
      {
        name: "video_long_press_menu.ts",
        summary:
          "動画の長押し/右クリックで独自メニュー（動画をポップアップで表示、動画をダウンロード[Android]）。React Fiber から動画 variants を取得。",
        enable: "常に（カラム）。ポップアップ表示は videoPopupEnabled に従う",
        target: "カラム",
        platform: "共通（ダウンロードは Android）",
        test: "あり",
        kind: "メディア",
        files: [
          INJ + "video_long_press_menu.ts",
          INJ + "video_long_press_menu.test.ts",
        ],
      },
      {
        name: "api_rate_limit_monitor.ts",
        summary:
          "XHR のレート制限ヘッダを読み、Rust（Android はブリッジ）へ報告。",
        enable: "apiRateLimitMonitorEnabled !== false（undefined は有効）",
        target: "カラム",
        platform: "共通（経路は desktop/Android で異なる）",
        test: "あり（+ プロパティ）",
        kind: "更新・新着",
        files: [
          INJ + "api_rate_limit_monitor.ts",
          INJ + "api_rate_limit_monitor.test.ts",
          INJ + "api_rate_limit_monitor.property.test.ts",
        ],
      },
      {
        name: "popup_toolbar.ts",
        summary:
          "ポップアップ/コンポーズ窓のツールバー（アカウント切替、閉じる、動画ダウンロード、公式設定の送信と『カラムへ適用』ボタン、Esc で閉じる、targetHref の自動クリック）。",
        enable: "ポップアップ/コンポーズ窓の init script に常に含まれる",
        target: "ポップアップ / コンポーズ",
        platform: "共通（経路は desktop invoke / Android ブリッジ）",
        test: "あり（+ external_host）",
        kind: "ポップアップ専用",
        files: [
          INJ + "popup_toolbar.ts",
          INJ + "popup_toolbar.test.ts",
          INJ + "popup_toolbar.external_host.test.ts",
        ],
      },
      {
        name: "popup_video_autoplay.ts",
        summary:
          "動画ポップアップ（href に /video/ を含む）で動画を自動再生。音あり再生が拒否されたらミュートで再試行。",
        enable: "ポップアップ/コンポーズ窓の init script に常に含まれる",
        target: "ポップアップ",
        platform: "共通",
        test: "あり（+ プロパティ）",
        kind: "ポップアップ専用",
        files: [
          INJ + "popup_video_autoplay.ts",
          INJ + "popup_video_autoplay.test.ts",
        ],
      },
    ],
  },

  "inject.ipc": {
    title: "inject から呼ぶ Rust コマンドと Android 経路",
    columns: [
      { key: "name", label: "コマンド", code: true },
      { key: "from", label: "呼び出し元スクリプト", code: true },
      { key: "summary", label: "用途" },
      { key: "android", label: "Android での経路" },
    ],
    filters: [],
    items: [
      {
        name: "open_popup_window",
        from: "image_popup.ts / video_long_press_menu.ts",
        summary: "メディアをポップアップで開く",
        android: "（要確認）",
      },
      {
        name: "open_link_popup_window",
        from: "context_menu.ts",
        summary: "リンクをポップアップで開く",
        android: "context_menu は desktop のみ",
      },
      {
        name: "close_popup_window",
        from: "popup_toolbar.ts",
        summary: "ポップアップを閉じる（Esc 含む）",
        android: "__mcxPopupBridge（PopupSessionBridge）",
      },
      {
        name: "switch_popup_session",
        from: "popup_toolbar.ts",
        summary: "ポップアップのアカウント（セッション）切替",
        android: "__mcxPopupBridge",
      },
      {
        name: "download_video",
        from: "popup_toolbar.ts",
        summary: "ポップアップ内の動画をダウンロード",
        android: "（要確認）",
      },
      {
        name: "report_official_settings",
        from: "popup_toolbar.ts",
        summary: "X 公式設定のスナップショットを Rust→React へ",
        android: "__mcxPopupBridge",
      },
      {
        name: "report_webview_scroll",
        from: "scroll_event.ts",
        summary: "横スクロール量を報告",
        android: "scroll_event は desktop のみ",
      },
      {
        name: "report_new_posts_count",
        from: "auto_reload.ts",
        summary: "新着投稿数を報告（未読バッジ）",
        android: "経路なし（invoke が無いと何もしない）",
      },
      {
        name: "report_keyboard_shortcut",
        from: "keyboard_shortcut.ts",
        summary: "ショートカットをメインへ転送",
        android: "keyboard_shortcut は desktop のみ",
      },
      {
        name: "report_api_rate_limit",
        from: "api_rate_limit_monitor.ts",
        summary: "レート制限残量を報告",
        android: "__mcxApiRateLimitBridge",
      },
    ],
  },
});

Object.assign(window.MCX_DATA.details, {
  "inject.src": {
    title: "_src/*.ts（ソース）",
    layer: "inject",
    summary:
      "inject の唯一の編集対象。機能 1 つ 1 ファイルの TypeScript と、同じ場所に置くテスト。",
    body: "<p>機能スクリプトは多くが即時関数（IIFE）で、読み込み時に副作用（イベント登録・MutationObserver 開始）を起こします。純粋関数は export してテストしますが、<b>他のエントリから import してはいけません</b>（共有チャンクが生成され連結が壊れる）。</p><p>ロジックを分けたいときは、1 つのエントリからだけ import する別ファイルにします（例: return_to_last_read_logic.ts、ng_word_matcher.ts）。</p>",
    files: [
      "src-tauri/src/inject/_src/auto_reload.ts",
      "src-tauri/src/inject/_src/types.d.ts",
    ],
    docs: [NOTES],
    related: ["inject.vite", "inject.built"],
  },
  "inject.vite": {
    title: "vite.inject.config.ts / build:inject",
    layer: "common",
    summary:
      "各機能を独立ファイルとして出力する Vite 設定。通常エントリと React 版の 2 パス。",
    body: "<p><code>plainEntries</code> の配列に載っているものだけが出力されます。<b>新しい機能ファイルを足したら、この配列への追加を忘れない</b>こと（忘れると .js が生成されず include_str! が失敗）。</p><p>React を含む <code>header_customizer</code> だけは <code>--mode react</code> の別パスで、<code>inlineDynamicImports</code> により React 込みの単一ファイルになります。<code>safeHeadInjectPlugin</code> は、document.head がまだ無い時点で <code>document.head.appendChild</code> が呼ばれて落ちる問題を、DOMContentLoaded 待ちに書き換えて防ぎます。</p><p>minify は無効（出力をそのまま読むため）。</p>",
    files: ["vite.inject.config.ts", "tsconfig.inject.json", "package.json"],
    docs: [NOTES],
    related: ["inject.src", "inject.built"],
  },
  "inject.built": {
    title: "inject/*.js（ビルド成果物）",
    layer: "inject",
    summary:
      "build:inject の出力。gitignore 済みで直接編集禁止。Rust が include_str! で読む。",
    body: "<p><code>.gitignore</code> に <code>src-tauri/src/inject/**/*.js</code> があり、<b>コミットされません</b>。そのため、クローン直後や _src 変更後は <code>npm run build:inject</code> を実行しないと、Rust のビルド・テストが「ファイルが無い／古い JS を埋め込む」状態になります。</p>",
    files: ["src-tauri/src/inject/mod.rs"],
    related: ["inject.modrs", "inject.vite"],
  },
  "inject.modrs": {
    title: "inject/mod.rs",
    layer: "rust",
    summary:
      "設定（InitScriptParams）から WebView に注入する 1 本の JS 文字列を組み立てる。",
    body: "<p><b>build_init_script</b>（カラム）と <b>build_popup_init_script</b>（ポップアップ/コンポーズ窓）の 2 つが公開関数です。</p><ul><li>連結順は固定で、既存テストが検証しています（return_to_last_read は auto_reload より後ろ、dom_observer と i18n が先頭、など）。</li><li>機能の有効/無効は <code>include_if</code> で空文字列にして外す（desktop のみ・mobile のみ・設定 ON のみ）。</li><li>設定値は <code>config_script</code> が <code>window.__multiColumnXConfig = {…}</code> として埋め込む。<b>キー順・件数は既存テストが固定</b>しているので、言語のような新しい値は config に入れず別グローバル（<code>__mcxLang</code>）にしている。</li><li><code>minimal_injection</code>（page_type=external）では custom_css だけ注入。</li><li>文字列値は <code>js_string</code>（JSON エンコード）で埋め込み、Rust の Debug 書式は使わない（エスケープ互換性のため）。</li></ul>",
    files: ["src-tauri/src/inject/mod.rs", "src-tauri/src/ipc_constants.rs"],
    docs: [NOTES],
    related: ["inject.callers", "inject.config"],
  },
  "inject.callers": {
    title: "column.rs / popup.rs / compose.rs",
    layer: "rust",
    summary:
      "init script を作って WebView に渡す側。設定の読み出しと page_type による分岐を担う。",
    body: "<p><code>build_column_init_script</code> が desktop / mobile 両方の <code>create_column_webview</code> から呼ばれます。カラム個別設定は <code>column.settings.*</code> から、グローバル設定は <code>load_global_settings</code> → <code>column_script_settings_from</code> から取ります。page_type による分岐もここです（home → return_to_last_read を含める、compose → compose_only、external → 最小注入）。</p><p>ポップアップ／コンポーズ窓は <code>build_popup_init</code>（popup.rs）が <code>build_popup_init_script</code> を呼びます。</p>",
    files: [
      "src-tauri/src/commands/webview/column.rs",
      "src-tauri/src/commands/webview/popup.rs",
      "src-tauri/src/commands/webview/compose.rs",
      "src-tauri/src/commands/settings_store.rs",
    ],
    docs: [NOTES],
    related: ["inject.modrs", "inject.config"],
  },
  "inject.config": {
    title: "window.__multiColumnXConfig（設定の受け渡し）",
    layer: "inject",
    summary:
      "Rust が WebView 生成時に埋め込む設定オブジェクト。各 inject が読む。",
    body: "<p>キー: hideHeaderEnabled / hideTweetInputEnabled / showCustomMenu / visibleLinks / smallImageEnabled / smallImageWidth / blurImageEnabled / blurImageAmount / hideAdEnabled / apiRateLimitMonitorEnabled / imagePopupEnabled / videoPopupEnabled / ngWords / globalNgWords / repostHiddenUserIds / globalRepostHiddenUserIds / whitelistEnabled / whitelistWords / returnToLastReadEnabled / scrollPosRestoreEnabled / mobileSwipeAreaOffset（計 21 個）。</p><p>生成時の値なので、後から変えるには <code>WEBVIEW_SCRIPTS</code> で eval してオブジェクトを書き換える必要があります。新しい GlobalSettings フラグを追加するときは<b>7 箇所同期</b>（types, fixture, settings.rs, settings_store.rs, column.rs, inject/mod.rs, types.d.ts）です。</p>",
    files: [
      "src-tauri/src/inject/mod.rs",
      "src-tauri/src/inject/_src/types.d.ts",
      "src/constants/ipc.ts",
    ],
    docs: [NOTES, "../development/architecture-overview.md"],
    related: ["inject.modrs"],
  },
  "inject.hub-dom": {
    title: "dom_observer（共有 MutationObserver ハブ）",
    layer: "inject",
    summary:
      "多数のスクリプトが各自 document.body を監視していた無駄を 1 つにまとめた共有基盤。",
    body: "<p>以前は全スクリプトが各自 <code>{ childList, subtree }</code> の MutationObserver を持ち、X の DOM 変化のたびに全部が同期的に走っていました。ハブは MutationRecord を貯めて <code>requestAnimationFrame</code> で 1 フレーム 1 回にまとめ配信します（rAF はペイント前なので非表示処理がちらつかない）。購読者の例外は個別に握りつぶします。</p><p><b>ハブに移行できない</b>もの（attributes 監視、body 以外の監視、addedNodes を個別処理、自身で disconnect/reconnect する等）は独自の observer を持ち続けます。ng_word（main[role=main] を監視）、hide_ad、small_image、blur_image は独自の observer を持ち、auto_reload の常時監視は描画されないカラムでも動く必要があるため意図的にハブを使いません。</p>",
    files: ["src-tauri/src/inject/_src/dom_observer.ts"],
    docs: [NOTES],
    related: ["inject.ngword", "inject.autoreload"],
  },
  "inject.hub-i18n": {
    title: "i18n ハブ（window.__mcxI18n）",
    layer: "inject",
    summary:
      "inject 自前 UI の文言切替。ES import せずグローバル経由で参照する。",
    body: "<p>各エントリが独立した出力ファイルなので、同じモジュールを import すると共有チャンクが生成され連結が壊れます。このため文言は <code>window.__mcxI18n.t('key')</code> 経由です。辞書追加は i18n.ts の ja と en に同じキーを足し、契約テスト（キー集合・補間変数名の一致、日本語直書き検出）を通します。X の画面と照合する日本語は翻訳せず、テスト内の許可リスト（理由付き）に載せます。</p>",
    files: [
      "src-tauri/src/inject/_src/i18n.ts",
      "src-tauri/src/inject/_src/i18n.contract.test.ts",
    ],
    docs: ["../development/i18n-notes.md", NOTES],
    related: ["inject.config"],
  },
  "inject.autoreload": {
    title: "auto_reload（更新・新着検知）",
    layer: "inject",
    summary:
      "ページ種別ごとの更新方式の違いを吸収し、新着投稿を判定して件数を報告する。",
    body: "<p><b>更新方式</b>はページ種別で異なります: 検索・通知は『下へスクロール→60ms後に先頭へ戻す』往復、おすすめ/リストはタブの再クリック、フォロー中は focus + 新着ボタンのクリック、リスト詳細は対象外。距離・待ち時間は X の挙動に依存する実測値なので、変更時は再計測が必要です。</p><p><b>新着判定</b>は『見たことのある最大の status ID より新しい ID が現れたとき』（通知ページは time[datetime] の最大値）。おすすめのように表示が入れ替わるタイムラインの誤報告を避ける設計です。</p><p>通知・検索では scroll と DOM 変化を常時監視し、X のポーリングで先頭がずれたら補正します。共有ハブを使わないのは、描画されないカラムで止まるのを避けるためです。</p><p>公開 API: <code>triggerReload(scrollToTop?)</code>（自動更新は引数なし＝ユーザーがスクロール中は何もしない／手動更新は true）。</p>",
    files: ["src-tauri/src/inject/_src/auto_reload.ts"],
    docs: [NOTES],
    related: ["inject.rtlr", "inject.hub-dom"],
  },
  "inject.rtlr": {
    title: "return_to_last_read（前回の境目へ戻る）",
    layer: "inject",
    summary:
      "更新直前の先頭付近を基準として記録し、更新後に探索して戻れるようにする。",
    body: "<p>triggerReload と、x.com 上の直接の更新操作（新着ピルのクリック・選択中タブの再クリック・プルダウン・『.』キー）を検知して基準（先頭から広告等を除いた最大 5 件）を記録します。更新後に基準が下にあれば『戻る』ボタンを出し、押すと 1 画面ずつ下へ探索して該当位置を表示します。</p><p>設計判断: 純粋ロジックは <code>return_to_last_read_logic.ts</code> に分離（jsdom 無しでもテスト・プロパティテスト可能）、DOM グルー側は副作用の薄いラッパー。ボタンの有効/無効は <code>setReturnToLastReadEnabled</code> で即時切替できるよう、設定が OFF でもホームカラムには常に注入されます。描画は値が変わるときだけ代入し、自分の描画が DOM 監視に拾われる無限ループを避けます。</p>",
    files: [
      "src-tauri/src/inject/_src/return_to_last_read.ts",
      "src-tauri/src/inject/_src/return_to_last_read_logic.ts",
    ],
    docs: [NOTES],
    related: ["inject.autoreload"],
  },
  "inject.ngword": {
    title: "ng_word（NG ワード・リポスト非表示）",
    layer: "inject",
    summary:
      "追加された article を判定し、一致したら仮想リストのセルごと除去する。",
    body: "<p>判定は純粋関数（<code>shouldHideTweetText</code>, <code>shouldHideByRepostUser</code>）に分け、設定は毎回 <code>__multiColumnXConfig</code> から読みます（後から eval で書き換えても効く）。リポストした人の特定は socialContext の親 <code>&lt;a&gt;</code> の href から行います。</p><p>隠し方: 仮想リストのセル（cellInnerDiv + absolute + transform）は remove、それ以外は display:none !important。</p>",
    files: [
      "src-tauri/src/inject/_src/ng_word.ts",
      "src-tauri/src/inject/_src/ng_word_matcher.ts",
    ],
    related: ["inject.hub-dom"],
  },
  "inject.popuptoolbar": {
    title: "popup_toolbar（ポップアップ/コンポーズ窓のツールバー）",
    layer: "inject",
    summary:
      "アカウント切替・閉じる・動画ダウンロード・『カラムへ適用』（公式設定の送信）を提供する UI。",
    body: "<p>起動時に Rust が埋めた <code>__mcxAccounts</code> / <code>__mcxCurrentAccountId</code> / <code>__mcxTargetHref</code> / <code>__mcxEscCloseEnabled</code> を読みます。Rust への経路は desktop が <code>invoke</code>、Android が <code>__mcxPopupBridge.postMessage</code>。動画ダウンロード進捗は <code>listen('video-download-progress')</code> で受けます。公式設定のホワイトリストキーは <code>src/constants/ipc.ts</code> の <code>OFFICIAL_SETTINGS_WHITELIST_KEYS</code> と同値を保つ必要があります（import 不可のため重複定義）。</p>",
    files: [
      "src-tauri/src/inject/_src/popup_toolbar.ts",
      "src-tauri/gen/android/app/src/main/java/com/natsuyasai/multicolumnx/PopupSessionBridge.kt",
    ],
    related: ["inject.tauri-ipc", "inject.android-bridge"],
  },
  "inject.header": {
    title: "header_customizer（React 製で大きい理由）",
    layer: "inject",
    summary:
      "ヘッダー/投稿欄の非表示と独自メニューを React コンポーネントで描画する唯一の inject。",
    body: "<p>独自メニュー（visibleLinks によるリンクの表示切替など）が状態を持つ UI のため、React 本体（react / react-dom）を同梱した単一ファイルとしてビルドします。このため生成物は約 587KB で、他の inject（数 KB〜数十 KB）より桁違いに大きくなります。</p><p>設計判断: 全カラムに常に入れると重いので、<code>hideHeaderEnabled || hideTweetInputEnabled</code> のときだけ Rust 側で連結します。設定変更時の <code>applyAreaVisibility</code> は『常にアンマウントしてから必要なら再マウント』します（CSS 適用の useEffect が空依存で一度しか走らないため）。DOM 変化は dom_observer 経由で購読します。</p>",
    files: [
      "src-tauri/src/inject/_src/header_customizer.ts",
      "src-tauri/src/inject/_src/HeaderCustomizer.tsx",
      "src-tauri/src/inject/_src/useHeaderCustomizer.ts",
    ],
    related: ["inject.vite", "inject.hub-dom"],
  },
  "inject.video": {
    title:
      "動画関連（video_control / video_long_press_menu / popup_video_autoplay）",
    layer: "inject",
    summary:
      "自動再生の抑止、長押しメニュー、ポップアップでの自動再生を担う 3 つ。",
    body: "<p><b>video_control</b>: <code>HTMLMediaElement.prototype.play</code> を差し替え、最初の play() だけ通して playing 後に 1 度止める。mediaviewer（全画面）やユーザー操作済みの動画は止めない。</p><p><b>video_long_press_menu</b>: contextmenu（長押し/右クリック）で独自メニュー。動画 URL は X の React Fiber の props（variants）から取る（DOM に URL が無いため）。ダウンロードは Android ブリッジへ委譲。</p><p><b>popup_video_autoplay</b>: /video/ を含むポップアップで再生、拒否されたらミュートで再試行。</p>",
    files: [
      "src-tauri/src/inject/_src/video_control.ts",
      "src-tauri/src/inject/_src/video_long_press_menu.ts",
      "src-tauri/src/inject/_src/popup_video_autoplay.ts",
    ],
    related: ["inject.android-bridge"],
  },
  "inject.ratelimit": {
    title: "api_rate_limit_monitor",
    layer: "inject",
    summary:
      "XHR のレート制限ヘッダを読み、desktop は invoke、Android はブリッジで報告する。",
    body: "<p>バケット名の決定（<code>extractBucketKey</code>）とヘッダ解析（<code>parseRateLimitHeaders</code>）は純粋関数。有効判定は <code>apiRateLimitMonitorEnabled !== false</code>（未定義は有効＝後方互換）。</p>",
    files: ["src-tauri/src/inject/_src/api_rate_limit_monitor.ts"],
    docs: ["../development/api-rate-limit-operations-notes.md"],
    related: ["inject.tauri-ipc", "inject.android-bridge"],
  },
  "inject.tauri-ipc": {
    title: "Tauri IPC（inject → Rust）と capability",
    layer: "common",
    summary: "X のページ内 JS が Rust コマンドを呼ぶための経路と許可。",
    body: "<p>desktop では <code>window.__TAURI__.core.invoke</code>（一部は <code>__TAURI_INTERNALS__.invoke</code>）を使います。許可は <code>capabilities/column-webview.json</code> の <code>remote.urls</code>（X 系ドメイン）＋ <code>windows</code>（column-*, popup-*, compose-*, add-account, main）＋ <code>permissions</code>（allow-open-popup-window など 10 コマンド）で決まります。</p><p><b>許可集合は inject が実際に invoke するコマンド集合と厳密一致</b>で検証されます（<code>acl_contract.rs</code>）。コマンドを追加・削除したら build.rs の AppManifest・capability・この集合を同時に更新します。送信元の判定は JS の自己申告ではなく Rust の <code>caller.label()</code> で行い、メイン専用コマンドは <code>require_main_caller</code> で守ります。</p>",
    files: [
      "src-tauri/capabilities/column-webview.json",
      "src-tauri/src/acl_contract.rs",
      "src-tauri/build.rs",
    ],
    docs: [NOTES, "../development/tauri-commands.md"],
    related: ["inject.android-bridge"],
  },
  "inject.android-bridge": {
    title: "Android ブリッジ（addWebMessageListener）",
    layer: "android",
    summary:
      "Android のカラム/ポップアップは Tauri IPC が無いため、ネイティブが公開する postMessage ブリッジを使う。",
    body: "<p>公開名: <code>__mcxPopupBridge</code>（ポップアップのアカウント切替・閉じる・公式設定）、<code>__mcxVideoDownloadBridge</code>（動画ダウンロード）、<code>__mcxApiRateLimitBridge</code>（レート制限）。JS は <code>postMessage(JSON.stringify({ type, … }))</code> を送ります。</p><p>セキュリティ: <code>addJavascriptInterface</code> はオリジン制約が無く任意のオリジンから呼べるため使わず、オリジンを x.com / twitter.com 系に限定できる <code>addWebMessageListener</code> を使います（メインフレームのみ、コールバック内でもオリジンを二重チェック。端末が非対応ならブリッジ自体を公開しない）。</p>",
    files: [
      "src-tauri/gen/android/app/src/main/java/com/natsuyasai/multicolumnx/MainActivity.kt",
      "src-tauri/gen/android/app/src/main/java/com/natsuyasai/multicolumnx/BridgeOrigins.kt",
      "src-tauri/gen/android/app/src/main/java/com/natsuyasai/multicolumnx/PopupSessionBridge.kt",
      "src-tauri/gen/android/app/src/main/java/com/natsuyasai/multicolumnx/VideoDownloadRequestBridge.kt",
      "src-tauri/gen/android/app/src/main/java/com/natsuyasai/multicolumnx/ApiRateLimitBridge.kt",
    ],
    docs: ["../development/android-notes.md"],
    related: ["inject.tauri-ipc"],
  },
  "inject.x-dom": {
    title: "X の DOM（外部）",
    layer: "common",
    summary: "inject が依存する外部の描画結果。予告なく変わる。",
    body: "<p>data-testid（tweet / cellInnerDiv / sidebarColumn など）、role 属性、仮想リスト（transform 付き absolute のセル）、React Fiber の内部構造に依存します。jsdom の合成 DOM では保証できないため、DOM 依存ロジックの変更時は実 X での検証が要ります。</p>",
    files: [],
    docs: [NOTES],
  },
});
