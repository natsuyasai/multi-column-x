// React 層（src/）ページのデータ: 構成図の詳細・フロー・一覧
window.MCX_DATA = window.MCX_DATA || { flows: {}, catalogs: {}, details: {} };

Object.assign(window.MCX_DATA.details, {
  "react.main": {
    title: "main.tsx",
    layer: "react",
    summary:
      "React の起点。i18n と全体 CSS を読み込み、App を StrictMode で描画する。",
    body: "<p><code>./i18n</code>（i18next 初期化）と <code>./index.css</code>（配色トークン）を import してから <code>&lt;App /&gt;</code> を <code>React.StrictMode</code> でマウントするだけの薄いファイル。StrictMode は開発時に effect を二重実行するため、effect の後始末（listen の解除など）が必須になる。</p>",
    files: ["src/main.tsx"],
    related: ["react.app"],
  },
  "react.app": {
    title: "App.tsx",
    layer: "react",
    summary:
      "全フックを束ね、ダイアログ・TopBar・ColumnHeader を描画するルートコンポーネント（約 740 行）。",
    body:
      "<p>状態は <code>useAppStore</code>、カラム操作は <code>useColumns</code>、アカウントは <code>useAccounts</code>、ダイアログ開閉は <code>useDialogState</code> から受け取り、子コンポーネントへ props で配る「配線役」。</p>" +
      "<ul><li><b>anyDialogOpen</b>: ダイアログ系の表示状態を OR した値。変化時のみ effect が走り、カラム WebView を画面外へ退避／復元する（z-index が効かないため）。</li>" +
      "<li><b>effect の宣言順</b>が意味を持つ（useUiScale → useAppBootstrap の順など）。並べ替えない。</li>" +
      "<li>新しいダイアログを足したら <code>anyDialogOpen</code> に条件を足す。</li></ul>",
    files: ["src/App.tsx", "src/App.module.scss"],
    docs: [
      "../development/column-layout-notes.md",
      "../development/ui-scale-notes.md",
    ],
    related: ["react.hooks", "react.store", "react.components"],
  },
  "react.components": {
    title: "components/",
    layer: "react",
    summary:
      "画面部品。1 コンポーネント 1 ディレクトリ（tsx + module.scss + stories）。",
    body: "<p>props で受けた値を描画し、操作はコールバック props で親（主に App.tsx）へ返すプレゼンテーション寄りの部品。<b>invoke は直接呼ばず</b>、フック／サービス経由が基本。同じディレクトリに <code>*.module.scss</code>（CSS Modules）と <code>*.stories.tsx</code> を置く。一覧は下の「コンポーネント一覧」。</p>",
    files: [
      "src/components/TopBar/TopBar.tsx",
      "src/components/ColumnHeader/ColumnHeader.tsx",
    ],
    related: ["react.app"],
  },
  "react.hooks": {
    title: "hooks/",
    layer: "react",
    summary:
      "副作用と状態の取りまとめ。カラム操作・起動・イベント購読・テーマなどの実体。",
    body: "<p>ロジックの大半はここ。<code>useColumns</code> は desktop／mobile 実装（<code>useDesktopColumns</code> / <code>useMobileColumns</code>）を束ねるファサード。イベント購読は <code>useWebviewEvents.ts</code> に集約。一覧は下の「フック一覧」。</p>",
    files: [
      "src/hooks/useColumns.ts",
      "src/hooks/useDesktopColumns.ts",
      "src/hooks/useMobileColumns.ts",
      "src/hooks/useWebviewEvents.ts",
    ],
    related: ["react.store", "react.services", "react.lib"],
  },
  "react.store": {
    title: "store/useAppStore.ts",
    layer: "react",
    summary:
      "Zustand の単一ストア。アカウント・カラム・全体設定を持ち、変更のたびに settings.json へ自動保存する。",
    body:
      "<p>永続化対象は <code>accounts</code> / <code>columns</code> / <code>globalSettings</code> の 3 つ（<code>save_settings</code> に丸ごと渡す）。それ以外（<code>unreadCounts</code>、<code>apiRateLimits</code>、<code>topBarExpanded</code>、<code>isMobile</code> など）は揮発状態。</p>" +
      "<ul><li>更新アクション（addColumn / updateColumn / updateGlobalSettings など）は <code>set</code> の直後に <code>saveSettings()</code> を呼ぶ＝<b>自動保存</b>。</li>" +
      "<li>保存はモジュール変数 <code>saveChain</code>（Promise チェーン）に連結して直列化。最後に要求した保存が最後に書かれる。<code>flushPendingSaves()</code> は現在のチェーンを返す。</li>" +
      "<li><code>restoreInProgress</code> が true の間は保存を発行しない（バックアップ復元と競合するため）。</li>" +
      "<li>読み込み失敗時は <code>settingsSaveBlocked</code> を立て、既定値で保存済み設定を上書きしないようにする。</li>" +
      "<li><code>migrateColumn</code> が旧データを補完（gridRow/gridCol・repostHiddenUserIds）。</li></ul>",
    files: ["src/store/useAppStore.ts", "src/types/index.ts"],
    docs: ["../development/settings-file-crash-safety-notes.md"],
    related: ["react.services"],
  },
  "react.services": {
    title: "services/",
    layer: "react",
    summary:
      "Tauri invoke を包む薄いラッパー層。コマンド名は constants/ipc.ts の IPC_COMMANDS を使う。",
    body: "<p><code>columnWebview.ts</code>（作成・リサイズ・削除・eval）、<code>externalColumn.ts</code>、<code>columnReload.ts</code>、<code>backup.ts</code>、<code>updater.ts</code>、<code>extensions.ts</code>。UI から Rust を呼ぶ入口を一箇所に集め、呼び出し前後の共通処理（保存待ち、構築署名の記録など）をここに置く。</p>",
    files: [
      "src/services/columnWebview.ts",
      "src/services/externalColumn.ts",
      "src/services/columnReload.ts",
      "src/services/backup.ts",
      "src/services/updater.ts",
      "src/services/extensions.ts",
    ],
    docs: ["../development/tauri-commands.md"],
    related: ["react.constants", "react.rust"],
  },
  "react.lib": {
    title: "lib/",
    layer: "react",
    summary:
      "Tauri／React 非依存の純粋関数群。テストしやすく、ロジックの置き場の第一候補。",
    body: "<p>グリッド座標計算（<code>gridLayout.ts</code>）、署名（<code>columnBuildSignature.ts</code>）、並び順（<code>columnOrder.ts</code>）、テーマ・UI 倍率・言語の解決、バックアップ復元ロジック、入力検証などを置く。プロパティテスト（<code>*.property.test.ts</code>）の主対象。一覧は「lib 主要関数一覧」。</p>",
    files: [
      "src/lib/gridLayout.ts",
      "src/lib/columnBuildSignature.ts",
      "src/lib/columnOrder.ts",
    ],
    related: ["react.services"],
  },
  "react.constants": {
    title: "constants/",
    layer: "react",
    summary:
      "IPC コマンド名・イベント名・WebView ラベル・eval スクリプトの定義元。",
    body: "<p><code>ipc.ts</code> が <code>IPC_COMMANDS</code>（invoke するコマンド名）、<code>IPC_EVENTS</code>（listen するイベント名）、<code>WEBVIEW_LABELS</code>、<code>WEBVIEW_SCRIPTS</code>（<code>eval_in_webview</code> に渡す JS 文字列の生成関数）、<code>STORAGE_KEYS</code>、<code>OFFSCREEN</code>（退避座標）を持つ。名前の食い違いは <code>ipc.contract.test.ts</code> などの契約テストで検出する。</p>",
    files: [
      "src/constants/ipc.ts",
      "src/constants/accountColors.ts",
      "src/constants/apiRateLimitLabels.ts",
      "src/constants/ipc.contract.test.ts",
    ],
    related: ["react.services"],
  },
  "react.i18n": {
    title: "i18n/ と locales/",
    layer: "react",
    summary: "i18next の初期化と、ja／en の名前空間別 JSON 辞書。",
    body: '<p>辞書は <code>src/locales/{ja,en}/&lt;名前空間&gt;.json</code>。参照は <code>t("ns:key")</code> の完全キー。ja と en のキー集合・補間変数は契約テストで一致を保証し、未使用キーも失敗扱い。</p>',
    files: [
      "src/i18n/index.ts",
      "src/i18n/resources.ts",
      "src/locales/ja/common.json",
    ],
    docs: ["../development/i18n-notes.md"],
  },
  "react.styles": {
    title: "styles/ と index.css",
    layer: "react",
    summary: "配色トークン（index.css）と SCSS の共有ミキシン（styles/）。",
    body: "<p><code>index.css</code> に配色トークン（<code>--mcx-*</code>）。パネル型ダイアログの Android 全画面化は <code>styles/_dialog-fullscreen.scss</code> のミキシンを使う。寸法は <code>rem</code> で書く。</p>",
    files: ["src/index.css", "src/styles/_dialog-fullscreen.scss"],
    docs: ["../development/ui-scale-notes.md"],
  },
  "react.types": {
    title: "types/index.ts",
    layer: "react",
    summary:
      "Account / Column / GlobalSettings などのドメイン型と、設定の既定値。",
    body: "<p><code>DEFAULT_GLOBAL_SETTINGS</code> / <code>DEFAULT_COLUMN_SETTINGS</code> は Rust の <code>impl Default</code> と <code>contracts/default-settings.json</code> の 3 点で同期が必要（契約テストで検査）。JS 側 camelCase のフィールドは Rust 側 <code>#[serde(rename)]</code> と対応する。</p>",
    files: ["src/types/index.ts"],
  },
  "react.rust": {
    title: "Rust バックエンド",
    layer: "rust",
    summary:
      "invoke の受け口（#[tauri::command]）と emit するイベントの送り手。詳細は Rust 層ページ。",
    body: '<p>このページの境界の向こう側。コマンド一覧は <a href="rust.html">Rust 層ページ</a> と <a href="../development/tauri-commands.md">tauri-commands.md</a> を参照。</p>',
    files: ["src-tauri/src/lib.rs"],
    docs: ["../development/tauri-commands.md"],
  },
  "react.column-webview": {
    title: "カラム WebView（x.com）",
    layer: "inject",
    summary:
      "OS ネイティブの子 WebView。React の DOM の外にあり、CSS では重なりを制御できない。",
    body: "<p>desktop では Rust が <code>add_child()</code> 等で生成、Android では Kotlin のネイティブ WebView。React は <code>create_column_webview</code> / <code>resize_column_webview</code> で位置を指示するだけ。注入スクリプトは別ページ（inject）を参照。</p>",
    files: ["src/services/columnWebview.ts"],
    docs: ["../development/column-layout-notes.md"],
  },
});

Object.assign(window.MCX_DATA.flows, {
  "react.startup": {
    title: "起動時の初期化（useAppBootstrap）",
    description:
      "プラットフォーム検出 → 設定ロード → カラム復元までの effect の流れ。宣言順が意味を持つ。",
    actors: [
      { id: "app", label: "App / useAppBootstrap", layer: "react" },
      { id: "st", label: "useAppStore", layer: "react" },
      { id: "svc", label: "services/columnWebview", layer: "react" },
      { id: "rs", label: "Rust", layer: "rust" },
    ],
    steps: [
      {
        from: "app",
        to: "app",
        label: "platform() で isMobile を確定",
        detail:
          "<p>loadSettings より先に同期的に完了させる。復元処理が isMobile を読むため。Android のときは <code>is_webview_profile_supported</code> も invoke。</p>",
        files: ["src/hooks/useAppBootstrap.ts"],
      },
      {
        from: "app",
        to: "st",
        label: "loadSettings()",
        detail: "<p>マウント時 1 回のみ。</p>",
        files: ["src/store/useAppStore.ts"],
      },
      {
        from: "st",
        to: "rs",
        label: "invoke('load_settings')",
        kind: "invoke",
        detail:
          "<p>戻り値 <code>{ settings, loadFailed, backupPath }</code>。失敗時は <code>settingsSaveBlocked</code> を立て、空設定での上書きを防ぐ。</p>",
      },
      {
        from: "rs",
        to: "st",
        label: "settings / loadFailed",
        kind: "return",
        detail:
          "<p>columns は <code>migrateColumn</code> で補完し order 昇順に並べる。<code>isLoaded=true</code> になる。</p>",
      },
      {
        from: "app",
        to: "app",
        label: "isLoaded 遷移で restoreColumns()",
        detail:
          "<p>desktop は <code>restoreDesktopColumns</code>、mobile は <code>restoreMobileColumns</code>。完了後（成功・失敗とも）<code>columnsRestored=true</code> にし、更新チェック等を解放する。</p>",
        files: ["src/hooks/useColumns.ts"],
      },
      {
        from: "app",
        to: "svc",
        label: "createColumnWebview(各カラム)",
        detail:
          "<p>カラムごとに <code>resolveColumnDataDirectory</code> で保存先を解決してから作成。</p>",
        files: ["src/services/columnWebview.ts"],
      },
      {
        from: "svc",
        to: "rs",
        label: "invoke('create_column_webview')",
        kind: "invoke",
        detail:
          "<p>作成前に <code>flushPendingSaves()</code> を待つ（全体設定は Rust が settings.json から読むため）。</p>",
      },
      {
        from: "app",
        to: "app",
        label: "recalculateAllBounds()",
        detail:
          "<p>全作成後に正確な座標で再配置・表示（Linux は非表示で作成するため）。</p>",
      },
    ],
  },
  "react.add-column": {
    title: "カラム追加 → WebView 生成 → 配置",
    description:
      "AddColumnDialog の「追加」から、子 WebView の作成までの流れ（desktop 中心。mobile の差分は各ステップに記載）。",
    actors: [
      { id: "dlg", label: "AddColumnDialog / App", layer: "react" },
      { id: "col", label: "useColumns.handleAddColumn", layer: "react" },
      { id: "st", label: "useAppStore", layer: "react" },
      { id: "svc", label: "services/columnWebview", layer: "react" },
      { id: "rs", label: "Rust", layer: "rust" },
    ],
    steps: [
      {
        from: "dlg",
        to: "col",
        label: "onAdd(column)",
        detail:
          "<p>App.tsx の <code>onAdd</code> が <code>handleAddColumn(column)</code> を呼び、ダイアログを閉じる。</p>",
        files: ["src/App.tsx"],
      },
      {
        from: "col",
        to: "col",
        label: "データディレクトリ解決",
        detail:
          "<p><code>resolveColumnDataDirectory</code>。external カラムは Rust コマンド <code>get_external_column_data_directory</code>、それ以外は紐づくアカウントの <code>dataDirectory</code>。見つからなければ何もせず <code>false</code>。</p>",
        files: ["src/services/externalColumn.ts"],
      },
      {
        from: "col",
        to: "st",
        label: "addColumn(column)",
        detail:
          "<p>store に追加。直後に <code>saveSettings()</code> が走る。</p>",
      },
      {
        from: "st",
        to: "rs",
        label: "invoke('save_settings')",
        kind: "invoke",
        detail: "<p><code>saveChain</code> で直列化された自動保存。</p>",
      },
      {
        from: "col",
        to: "col",
        label: "bounds 計算",
        detail:
          "<p>desktop: <code>desktopGridBounds</code>（内部で <code>calculateGridBounds</code>）→ <code>setColumnBounds</code>。mobile: 画面外 bounds で作成し、あとで <code>setActiveColumn</code> を呼ぶ。</p>",
        files: ["src/hooks/useDesktopColumns.ts", "src/lib/gridLayout.ts"],
      },
      {
        from: "col",
        to: "svc",
        label: "createColumnWebview(...)",
        detail: "<p>失敗は <code>logError</code> で記録して続行。</p>",
      },
      {
        from: "svc",
        to: "rs",
        label: "invoke('create_column_webview')",
        kind: "invoke",
        detail:
          "<p>引数は <code>{ column, dataDirectory, x, y, width, height }</code>。成功後に構築署名を <code>columnBuildRegistry</code> へ記録。</p>",
      },
      {
        from: "col",
        to: "dlg",
        label: "true を返す → 新カラムへスクロール",
        detail:
          "<p>desktop のみ <code>jumpToColumnWhenReady(column.id)</code> で横スクロール。mobile は追加時にアクティブ化済み。</p>",
      },
    ],
  },
  "react.settings-apply": {
    title: "全体設定の変更 → 保存 → 各カラムへ反映",
    description:
      "AppSettingsPanel の「適用」から、保存と各 WebView への反映まで（useSettingsApplyHandlers）。",
    actors: [
      { id: "ui", label: "AppSettingsPanel", layer: "react" },
      { id: "hd", label: "handleApplyGlobalSettings", layer: "react" },
      { id: "st", label: "useAppStore", layer: "react" },
      { id: "svc", label: "services/columnWebview", layer: "react" },
      { id: "rs", label: "Rust", layer: "rust" },
      { id: "wv", label: "カラム WebView", layer: "inject" },
    ],
    steps: [
      {
        from: "ui",
        to: "hd",
        label: "onApply(patch)",
        detail:
          "<p>変更した項目だけの <code>Partial&lt;GlobalSettings&gt;</code> を渡す。</p>",
        files: ["src/hooks/useSettingsApplyHandlers.ts"],
      },
      {
        from: "hd",
        to: "st",
        label: "updateGlobalSettings(patch)",
        detail: "<p>set → <code>saveSettings()</code>（自動保存）。</p>",
      },
      {
        from: "st",
        to: "rs",
        label: "invoke('save_settings')",
        kind: "invoke",
        detail:
          "<p>Rust 側は <code>save_store_atomically</code> でアトミックに書き込む。</p>",
      },
      {
        from: "hd",
        to: "svc",
        label: "NG ワード差分を eval",
        detail:
          "<p><code>buildGlobalNgScripts</code> が patch に ngWords / repostHiddenUserIds があるときだけ全カラム分の <code>applyNgWords</code> スクリプトを作る。</p>",
        files: ["src/services/columnWebview.ts"],
      },
      {
        from: "svc",
        to: "rs",
        label: "invoke('eval_in_webview')",
        kind: "invoke",
        detail:
          "<p>label は <code>column-&lt;id&gt;</code>。呼び出し元は main に限定される。</p>",
      },
      {
        from: "rs",
        to: "wv",
        label: "スクリプト実行",
        kind: "call",
        detail:
          "<p><code>window.__multiColumnX</code> が無ければ何もしない形のスクリプト。</p>",
      },
      {
        from: "hd",
        to: "svc",
        label: "theme / language も eval",
        detail:
          "<p>theme 変更なら <code>applyNightModeCookie</code>、language 変更なら <code>setInjectLanguage</code> を全カラムへ。</p>",
      },
      {
        from: "hd",
        to: "svc",
        label: "recreateStaleColumns()",
        detail:
          "<p>構築時に埋め込まれる設定（ぼかし・カスタム CSS 等）は eval では変わらない。署名比較で<b>古くなったカラムだけ</b>を直列に再構築する（無関係な項目なら 0 件）。</p>",
        files: [
          "src/lib/columnBuildSignature.ts",
          "src/lib/columnBuildRegistry.ts",
        ],
      },
    ],
  },
  "react.resize": {
    title: "ウィンドウリサイズ → bounds 再計算",
    description:
      "メインウィンドウの大きさが変わったとき、子 WebView の位置・サイズを追従させる流れ（desktop）。",
    actors: [
      { id: "win", label: "window resize", layer: "common" },
      { id: "dk", label: "useDesktopColumns", layer: "react" },
      { id: "lib", label: "lib/gridLayout", layer: "react" },
      { id: "svc", label: "services/columnWebview", layer: "react" },
      { id: "rs", label: "Rust", layer: "rust" },
    ],
    steps: [
      {
        from: "win",
        to: "dk",
        label: "resize イベント",
        detail:
          "<p><code>handleResize</code> は 100ms デバウンス。<code>dialogOpenRef</code> が true（ダイアログ表示中）なら無視する（仮想キーボード起因のリサイズ対策）。</p>",
        files: ["src/hooks/useDesktopColumns.ts"],
      },
      {
        from: "dk",
        to: "dk",
        label: "recalculateAllBounds()",
        detail:
          "<p>mobile ならアクティブカラムの再配置に委譲。desktop は container の clientHeight・scrollLeft・topBarHeight を読む。</p>",
      },
      {
        from: "dk",
        to: "lib",
        label: "calculateGridBounds(...)",
        detail:
          "<p>gridCol ごとにグループ化し、縦積みと heightMode（auto/fixed）から各カラムの絶対座標を算出する純粋関数。ヘッダー・スクロールバー・TopBar の高さは rem 定数を px 化した値を渡す。</p>",
        files: ["src/lib/gridLayout.ts"],
      },
      {
        from: "lib",
        to: "dk",
        label: "Record<columnId, ColumnBounds>",
        kind: "return",
        detail:
          "<p><code>setColumnBounds</code> で state に反映し、ColumnHeader の絶対配置にも使う。</p>",
      },
      {
        from: "dk",
        to: "svc",
        label: "resizeColumnWebview(各カラム)",
        detail: "<p><code>Promise.all</code> で並列。失敗は logError。</p>",
      },
      {
        from: "svc",
        to: "rs",
        label: "invoke('resize_column_webview')",
        kind: "invoke",
        detail:
          "<p>Linux は WebviewWindow の再配置になり負荷が高いため、スクロール起因の呼び出しは <code>rafThrottle</code> で 1 フレーム 1 回に間引く。</p>",
      },
    ],
  },
  "react.dialog-hide": {
    title: "ダイアログ表示 → WebView 退避 → 復元",
    description:
      "子 WebView は z-index が効かないため、ダイアログ中は画面外へ逃がす。",
    actors: [
      { id: "app", label: "App.tsx (anyDialogOpen effect)", layer: "react" },
      { id: "col", label: "useColumns", layer: "react" },
      { id: "svc", label: "services/columnWebview", layer: "react" },
      { id: "rs", label: "Rust", layer: "rust" },
    ],
    steps: [
      {
        from: "app",
        to: "app",
        label: "anyDialogOpen が true に変化",
        detail:
          "<p>ダイアログ・更新通知・アカウント名入力・レート制限ポップオーバー等の OR。この値の変化<b>だけ</b>で effect が走る設計。</p>",
        files: ["src/App.tsx"],
      },
      {
        from: "app",
        to: "col",
        label: "setDialogOpen(true) / hideColumnWebviews()",
        detail:
          "<p><code>dialogOpenRef</code> を立て（リサイズ抑制）、全カラムを退避。</p>",
      },
      {
        from: "col",
        to: "svc",
        label: "resizeColumnWebview(x=-9999)",
        detail:
          "<p>desktop は <code>OFFSCREEN.DESKTOP_X</code>、高さは直近の値を維持（極小にすると X 側の仮想リストが復元後に再描画されなくなるため）。mobile は非アクティブ用レイアウト。</p>",
        files: ["src/constants/ipc.ts"],
      },
      {
        from: "svc",
        to: "rs",
        label: "invoke('resize_column_webview')",
        kind: "invoke",
        detail: "<p>退避は座標を動かすだけで WebView は破棄しない。</p>",
      },
      {
        from: "app",
        to: "app",
        label: "anyDialogOpen が false に変化",
        detail: "<p>ダイアログを閉じる。</p>",
      },
      {
        from: "app",
        to: "col",
        label: "recalculateAllBounds()",
        detail:
          "<p>通常座標へ復元。mobile はスワイプバーの同期（syncMobileSwipeBar）も行う。</p>",
      },
    ],
  },
  "react.webview-event": {
    title: "WebView からのイベント受信（新着バッジ）",
    description:
      "inject スクリプト → Rust → React のイベント経路の一例（useNewPostsNotification）。",
    actors: [
      { id: "wv", label: "カラム WebView (inject)", layer: "inject" },
      { id: "rs", label: "Rust", layer: "rust" },
      { id: "hk", label: "useWebviewEvents", layer: "react" },
      { id: "st", label: "useAppStore", layer: "react" },
    ],
    steps: [
      {
        from: "wv",
        to: "rs",
        label: "invoke('report_new_posts_count')",
        kind: "invoke",
        detail: "<p>inject は remote capability 経由で IPC を呼ぶ。</p>",
      },
      {
        from: "rs",
        to: "hk",
        label: "emit('webview-new-posts-count')",
        kind: "event",
        detail: "<p>payload は <code>{ label, count }</code>。</p>",
        files: ["src/constants/ipc.ts"],
      },
      {
        from: "hk",
        to: "hk",
        label: "label から columnId を復元",
        detail:
          "<p><code>column-</code> プレフィックスを除去。desktopNotifyEnabled が無効なカラムは無視。</p>",
        files: ["src/hooks/useWebviewEvents.ts"],
      },
      {
        from: "hk",
        to: "st",
        label: "setUnreadCount(columnId, count)",
        detail:
          "<p>ColumnHeader の未読バッジに反映。autoReloadEnabled かつ count&gt;0 なら OS 通知も送る。</p>",
      },
    ],
  },
});

Object.assign(window.MCX_DATA.catalogs, {
  "react.components": {
    title: "コンポーネント一覧（src/components/）",
    columns: [
      { key: "name", label: "コンポーネント", code: true },
      { key: "summary", label: "役割" },
      { key: "kind", label: "種別" },
    ],
    filters: [{ key: "kind", label: "種別" }],
    items: [
      {
        name: "TopBar",
        summary:
          "上部ツールバー。カラム追加・アカウント管理・設定・ドラッグでの並べ替え等のボタン群。展開／折りたたみで高さが変わる。",
        kind: "常設UI",
        detail:
          "<p>props: <code>columns / accounts / expanded / onToggleExpand / onAddColumn …</code>。高さは rem 定数（折りたたみ 2rem・展開 4rem）で、SCSS と <code>gridLayout.ts</code> の値を一致させる必要がある。内部に <code>SortableColumnGroups.tsx</code>（並べ替え）と <code>columnDisplay.tsx</code>。</p>",
        files: [
          "src/components/TopBar/TopBar.tsx",
          "src/components/TopBar/SortableColumnGroups.tsx",
        ],
        docs: ["../development/topbar-column-reorder-notes.md"],
      },
      {
        name: "ColumnHeader",
        summary:
          "各カラムの上に絶対配置されるヘッダー（再読み込み・先頭へ・設定・閉じる・未読バッジ）。",
        kind: "常設UI",
        detail:
          "<p>props: <code>column / account / onReload / onReloadPage / onScrollTop / onSettings / onClose / unreadCount / onClearUnread</code>。位置は <code>columnBounds</code> から算出されるため、<code>recalculateAllBounds</code> と更新がセット。</p>",
        files: ["src/components/ColumnHeader/ColumnHeader.tsx"],
      },
      {
        name: "MobileTabBar",
        summary:
          "Android 用の下部タブバー。タップで切替、長押しで操作ダイアログ、ダブルタップで先頭＋更新。",
        kind: "常設UI",
        detail:
          "<p>props: <code>columns / accounts / activeColumnId / swipeState …</code>。スワイプ検知自体はネイティブ（Kotlin）側のオーバーレイが担う。</p>",
        files: ["src/components/MobileTabBar/MobileTabBar.tsx"],
        docs: ["../development/column-layout-notes.md"],
      },
      {
        name: "ApiRateLimitIndicator",
        summary:
          "ツールバーの API レート制限モニター（ポップオーバー）。バケット別の残量と severity を表示。",
        kind: "常設UI",
        detail:
          "<p>props: <code>accounts / apiRateLimits / onOpenChange / isMobile</code>。開閉は App の anyDialogOpen に含まれる（子 WebView を退避するため）。バケット名の表示は <code>constants/apiRateLimitLabels.ts</code>。</p>",
        files: [
          "src/components/ApiRateLimitIndicator/ApiRateLimitIndicator.tsx",
          "src/constants/apiRateLimitLabels.ts",
          "src/lib/apiRateLimit.ts",
        ],
        docs: ["../development/api-rate-limit-operations-notes.md"],
      },
      {
        name: "AddColumnDialog",
        summary:
          "カラム追加ダイアログ（アカウント・ページ種別・URL 等を選ぶ）。",
        kind: "ダイアログ",
        detail:
          "<p>props: <code>accounts / globalSettings / existingColumns / onAdd / onCancel</code>。新規カラムは既存の最大 gridCol + 1 に置かれる。</p>",
        files: ["src/components/AddColumnDialog/AddColumnDialog.tsx"],
      },
      {
        name: "AccountManager",
        summary: "アカウントの追加・削除・名前／色変更・既定指定・再認証。",
        kind: "ダイアログ",
        detail:
          "<p>props: <code>accounts / onAddAccount / onRemoveAccount / onSetDefault / onUpdateAccount / onReauthAccount / onClose</code>。ロジックは <code>useAccounts</code> 側。</p>",
        files: [
          "src/components/AccountManager/AccountManager.tsx",
          "src/hooks/useAccounts.ts",
        ],
      },
      {
        name: "AccountNameDialog",
        summary: "ログイン完了後のアカウント名入力。",
        kind: "ダイアログ",
        detail:
          "<p>props: <code>defaultValue / title / onSubmit / onCancel</code>。表示中は WebView 退避の対象。</p>",
        files: ["src/components/AccountNameDialog/AccountNameDialog.tsx"],
      },
      {
        name: "SettingsPanel",
        summary:
          "カラム個別設定パネル。適用時は当該カラムの WebView を再構築。",
        kind: "ダイアログ",
        detail:
          "<p>props: <code>column / onApply / onClose / onReload / isMobile</code>。<code>SettingsSections.tsx</code>、<code>lineListInputs.ts</code>（NG ワード等の行入力）を内包。</p>",
        files: [
          "src/components/SettingsPanel/SettingsPanel.tsx",
          "src/components/SettingsPanel/SettingsSections.tsx",
        ],
      },
      {
        name: "AppSettingsPanel",
        summary:
          "アプリ全体設定パネル（一般・カラムレイアウト・既定値・プリセット・バックアップ・拡張機能・情報）。",
        kind: "ダイアログ",
        detail:
          "<p>props: <code>settings / columns / accounts / onApply / onApplyLayout / onApplyColumnDefaults …</code>。タブ単位のファイル（<code>ColumnLayoutTab / PresetsTab / BackupTab / ExtensionsTab</code>）と、セクション分割（<code>GeneralSettingsSections</code> など）。下書き管理は <code>settingsDraft.ts</code> / <code>columnLayoutDraft.ts</code>。</p>",
        files: [
          "src/components/AppSettingsPanel/AppSettingsPanel.tsx",
          "src/components/AppSettingsPanel/BackupTab.tsx",
          "src/components/AppSettingsPanel/ExtensionsTab.tsx",
        ],
      },
      {
        name: "TabActionDialog",
        summary: "モバイルのタブ長押しメニュー（再読み込み・設定・削除）。",
        kind: "ダイアログ",
        detail:
          "<p>props: <code>columnLabel / onReload / onSettings / onRemove / onClose</code>。</p>",
        files: ["src/components/TabActionDialog/TabActionDialog.tsx"],
      },
      {
        name: "LinkPopupDialog",
        summary:
          "URL をポップアップウィンドウで開くダイアログ（公式設定を開く用途で fixedUrl も使う）。",
        kind: "ダイアログ",
        detail:
          "<p>props: <code>accounts / defaultAccountId / onSubmit / onClose / fixedUrl / title</code>。URL 補正は <code>lib/linkPopupUrl.ts</code>。</p>",
        files: [
          "src/components/LinkPopupDialog/LinkPopupDialog.tsx",
          "src/lib/linkPopupUrl.ts",
        ],
      },
      {
        name: "ShortcutHelpDialog",
        summary: "キーボードショートカット一覧。",
        kind: "ダイアログ",
        detail: "<p>props: <code>onClose</code>。</p>",
        files: ["src/components/ShortcutHelpDialog/ShortcutHelpDialog.tsx"],
      },
      {
        name: "ConfirmDialog",
        summary: "汎用の確認ダイアログ（アカウント削除確認・通知表示など）。",
        kind: "ダイアログ",
        detail:
          "<p>props: <code>title / message / confirmLabel / cancelLabel / onConfirm / onCancel / singleButton</code>。</p>",
        files: ["src/components/ConfirmDialog/ConfirmDialog.tsx"],
      },
      {
        name: "UpdateDialog",
        summary: "アプリ更新の案内と進捗表示。",
        kind: "ダイアログ",
        detail:
          "<p>props: <code>update / installing / progress / installError / onInstall / onLater</code>。<code>useAppUpdater</code> が状態を供給。</p>",
        files: [
          "src/components/UpdateDialog/UpdateDialog.tsx",
          "src/hooks/useAppUpdater.ts",
        ],
        docs: ["../development/release-theme-reauth-notes.md"],
      },
      {
        name: "WhatsNewDialog",
        summary: "更新後初回起動時のリリースノート表示。",
        kind: "ダイアログ",
        detail:
          "<p>props: <code>version / notes / onClose</code>。<code>useWhatsNew</code> が表示要否を判定。</p>",
        files: [
          "src/components/WhatsNewDialog/WhatsNewDialog.tsx",
          "src/hooks/useWhatsNew.ts",
        ],
      },
      {
        name: "H264SetupDialog",
        summary: "Linux の動画再生（H.264）有効化の案内。",
        kind: "ダイアログ",
        detail:
          "<p>props: <code>downloadState / downloadError / onDownload / onDismiss / onClose / onRelaunch</code>。<code>useH264Setup</code> と連動。</p>",
        files: [
          "src/components/H264SetupDialog/H264SetupDialog.tsx",
          "src/hooks/useH264Setup.ts",
        ],
      },
      {
        name: "NoAccountsPrompt",
        summary: "アカウント未登録時にアカウント管理へ誘導する案内。",
        kind: "部品",
        detail: "<p>props: <code>onOpenAccountManager</code>。</p>",
        files: ["src/components/NoAccountsPrompt/NoAccountsPrompt.tsx"],
      },
      {
        name: "HelpPopover",
        summary: "設定項目横の「？」ヘルプ用ポップオーバー。",
        kind: "部品",
        detail:
          "<p>props: <code>label / children</code>。外側クリックで閉じる（<code>useOutsideClick</code>）。</p>",
        files: [
          "src/components/HelpPopover/HelpPopover.tsx",
          "src/hooks/useOutsideClick.ts",
        ],
      },
    ],
  },
  "react.hooks": {
    title: "フック一覧（src/hooks/）",
    columns: [
      { key: "name", label: "フック", code: true },
      { key: "summary", label: "役割" },
      { key: "area", label: "領域" },
    ],
    filters: [{ key: "area", label: "領域" }],
    items: [
      {
        name: "useAppBootstrap",
        summary:
          "起動時の初期化（platform 検出→設定ロード→バージョン取得→カラム復元→表示サイズ適用）。",
        area: "起動",
        detail:
          "<p>effect の宣言順が意味を持つ。<code>columnsRestored</code> を返し、更新チェックなどをカラム復元後にゲートする。</p>",
        files: ["src/hooks/useAppBootstrap.ts"],
      },
      {
        name: "useColumns",
        summary:
          "カラム操作のファサード。追加・削除・並べ替え・再構築・復元・ダイアログ時の退避。",
        area: "カラム",
        detail:
          "<p><code>useMobileColumns</code> と <code>useDesktopColumns</code> を組み合わせ、<code>handleAddColumn / handleRemoveColumn / recreateColumnWebview / recreateStaleColumns / hideColumnWebviews / loadPresetAndRecreateWebviews / replaceColumnsAndRecreateWebviews</code> などを返す。</p>",
        files: ["src/hooks/useColumns.ts"],
      },
      {
        name: "useDesktopColumns",
        summary:
          "desktop のグリッド bounds 管理、リサイズ・スクロール追従、起動時復元。",
        area: "カラム",
        detail:
          "<p><code>recalculateAllBounds / restoreDesktopColumns / handleScrollbarScroll / columnBounds</code>。Linux ではウィンドウ移動（onMoved）でも再計算する。</p>",
        files: ["src/hooks/useDesktopColumns.ts"],
        docs: ["../development/linux-column-spec.md"],
      },
      {
        name: "useMobileColumns",
        summary: "mobile のアクティブカラム管理・スワイプナビ・起動時復元。",
        area: "カラム",
        detail:
          "<p><code>setActiveColumn</code> は Cookie 切替 → hide 分 → show 分（アクティブを最後）の順に resize。世代番号で古い呼び出しを打ち切る。アクティブ ID は localStorage に保存しバックグラウンド復帰に備える。</p>",
        files: ["src/hooks/useMobileColumns.ts"],
      },
      {
        name: "useColumnNavigation",
        summary:
          "カラムへのジャンプ、スクロールバー追従、手動更新、フォーカスカラム管理。",
        area: "カラム",
        files: ["src/hooks/useColumnNavigation.ts"],
      },
      {
        name: "useDialogState",
        summary: "各ダイアログの開閉 state と、それらの OR（dialogOpen）。",
        area: "UI",
        files: ["src/hooks/useDialogState.ts"],
      },
      {
        name: "useAccounts",
        summary:
          "アカウントの追加・削除・再認証のフロー管理（desktop と mobile で経路が違う）。",
        area: "アカウント",
        detail:
          "<p>desktop: <code>open_add_account_window</code> の後、<code>account-login-complete</code> を listen。mobile: 同コマンドが Activity 終了までブロック。復元中（restoreInProgress）は開始しない。</p>",
        files: ["src/hooks/useAccounts.ts"],
      },
      {
        name: "useSettingsApplyHandlers",
        summary:
          "カラム個別設定／全体設定の「適用」処理（保存・eval・再構築）。",
        area: "設定",
        files: ["src/hooks/useSettingsApplyHandlers.ts"],
      },
      {
        name: "useKeyboardShortcuts",
        summary:
          "キーボードショートカットの受付（Ctrl 系・r・?）と WebView 側からの転送イベント購読。",
        area: "入力",
        detail:
          "<p>入力中要素では修飾キー無しのショートカットを無効化。WebView 内で押されたキーは inject → <code>webview-keyboard-shortcut</code> イベントで届く。</p>",
        files: ["src/hooks/useKeyboardShortcuts.ts"],
      },
      {
        name: "useWebviewEvents（複数エクスポート）",
        summary:
          "WebView 由来イベントの listen 群。横スクロール中継・クラッシュ復旧・フォーカス既読・新着通知・レート制限・公式設定配布。",
        area: "イベント",
        detail:
          "<p>主なフック: <code>useWebviewScrollRelay / useColumnCrashRecovery / useColumnFocusClearsUnread / useNewPostsNotification / useApiRateLimitReports / useOfficialSettingsBroadcast / useOfficialSettingsPopupReload</code>。</p>",
        files: ["src/hooks/useWebviewEvents.ts"],
      },
      {
        name: "useAutoReload",
        summary: "カラムごとの自動更新カウントダウンと eval 発火。",
        area: "カラム",
        detail: "<p>復元中は発火しない。</p>",
        files: ["src/hooks/useAutoReload.ts"],
      },
      {
        name: "useTheme",
        summary:
          "テーマ設定を解決して <html data-theme> に反映。system 時のみ OS 配色を購読。",
        area: "表示",
        files: ["src/hooks/useTheme.ts", "src/lib/theme.ts"],
      },
      {
        name: "useUiScale",
        summary:
          "アプリ UI 倍率を <html> の font-size に反映し、rootFontPx を同期。",
        area: "表示",
        files: ["src/hooks/useUiScale.ts", "src/lib/uiScale.ts"],
        docs: ["../development/ui-scale-notes.md"],
      },
      {
        name: "useAppLanguage",
        summary: "language 設定に応じて i18next の言語を切り替える。",
        area: "表示",
        files: ["src/hooks/useAppLanguage.ts"],
      },
      {
        name: "usePlatformAttribute",
        summary:
          "<html data-platform> を付与（CSS のプラットフォーム別スタイル用）。",
        area: "表示",
        files: ["src/hooks/usePlatformAttribute.ts"],
      },
      {
        name: "useMobileSwipeBarSync",
        summary:
          "モバイルのスワイプバー（ネイティブオーバーレイ）の状態を Kotlin 側に同期。",
        area: "カラム",
        files: ["src/hooks/useMobileSwipeBarSync.ts"],
        docs: ["../development/column-layout-notes.md"],
      },
      {
        name: "usePopupWindowHandlers",
        summary:
          "リンクポップアップ・公式設定ポップアップ・投稿ウィンドウの起動処理。",
        area: "ウィンドウ",
        files: ["src/hooks/usePopupWindowHandlers.ts"],
      },
      {
        name: "useAppUpdater",
        summary:
          "自動更新（起動時チェック・手動チェック・インストール・進捗）。",
        area: "更新",
        detail:
          "<p>見送り済みバージョンは localStorage で抑制。updater は <code>createUpdater(isMobile)</code> で desktop／mobile 実装を切替。</p>",
        files: ["src/hooks/useAppUpdater.ts", "src/services/updater.ts"],
      },
      {
        name: "useWhatsNew",
        summary: "更新後初回起動の What's New 表示判定。",
        area: "更新",
        files: ["src/hooks/useWhatsNew.ts"],
      },
      {
        name: "useH264Setup",
        summary: "Linux の H.264 対応案内の状態管理。",
        area: "更新",
        files: ["src/hooks/useH264Setup.ts"],
      },
      {
        name: "useBackupFlow",
        summary:
          "バックアップタブの操作フロー（書き出し／読み込み→紐づけ→確認→復元）。",
        area: "バックアップ",
        files: ["src/hooks/useBackupFlow.ts", "src/services/backup.ts"],
        docs: ["../development/backup-restore-notes.md"],
      },
      {
        name: "useEscapeKey / useOutsideClick",
        summary: "Esc キーで閉じる・外側クリックで閉じる共通フック。",
        area: "UI",
        files: ["src/hooks/useEscapeKey.ts", "src/hooks/useOutsideClick.ts"],
      },
    ],
  },
  "react.services": {
    title: "サービス一覧（src/services/）",
    columns: [
      { key: "name", label: "ファイル", code: true },
      { key: "summary", label: "役割" },
      { key: "cmds", label: "ラップする主なコマンド", code: true },
    ],
    items: [
      {
        name: "columnWebview.ts",
        summary:
          "カラム WebView の作成・リサイズ・削除・eval、モバイルのスワイプバー／Cookie 操作、NG ワード用スクリプト生成。",
        cmds: "create_column_webview / resize_column_webview / remove_column_webview / eval_in_webview / set_column_cookies / update_mobile_swipe_bar / flash_mobile_swipe_bar",
        detail:
          "<p><code>createColumnWebview</code> は作成前に <code>flushPendingSaves()</code> を待ち、成功後に構築署名を記録する。<code>evalInColumn</code> の失敗は握りつぶす（ログのみ）。</p>",
        files: ["src/services/columnWebview.ts"],
      },
      {
        name: "externalColumn.ts",
        summary:
          "external カラム（アカウント非依存の任意 URL）のデータディレクトリ解決と削除。",
        cmds: "get_external_column_data_directory / delete_external_column_data",
        detail:
          "<p>削除は columnId だけを渡し、パスは Rust 側で組み立てる（任意パスを渡さない）。</p>",
        files: ["src/services/externalColumn.ts"],
      },
      {
        name: "columnReload.ts",
        summary:
          "手動再読み込み。構築署名が古ければ WebView を再構築、そうでなければ eval で軽量リロード。",
        cmds: "（evalInColumn 経由）eval_in_webview",
        files: ["src/services/columnReload.ts"],
      },
      {
        name: "backup.ts",
        summary: "バックアップの書き出し・読み込み・復元（performRestore）。",
        cmds: "export_backup / read_backup / apply_restore",
        detail:
          "<p><code>performRestore</code>: 復元中フラグ → 保存待ち → apply_restore → 旧 WebView 破棄 → ストア置換 → 再生成 → フラグ解除。</p>",
        files: ["src/services/backup.ts"],
        docs: ["../development/backup-restore-notes.md"],
      },
      {
        name: "updater.ts",
        summary:
          "自動更新の抽象。desktop はプラグイン、mobile は APK 自己更新。",
        cmds: "install_apk_update（mobile）／ tauri-plugin-updater（desktop）",
        files: ["src/services/updater.ts", "src/lib/githubRelease.ts"],
      },
      {
        name: "extensions.ts",
        summary: "ブラウザ拡張機能の管理（Windows のみ）。",
        cmds: "list_extensions / detect_chrome_extensions / pick_extension_folder / add_extension_from_folder / add_chrome_extension / set_extension_enabled / remove_extension / open_extension_page",
        files: ["src/services/extensions.ts", "src/lib/extensionsSupport.ts"],
        docs: ["../development/browser-extensions-notes.md"],
      },
    ],
  },
  "react.lib": {
    title: "lib 主要関数一覧（src/lib/）",
    columns: [
      { key: "name", label: "モジュール", code: true },
      { key: "summary", label: "主な内容" },
    ],
    items: [
      {
        name: "gridLayout.ts",
        summary:
          "calculateGridBounds / mobileColumnLayout / rem 高さ定数と px 化（getHeaderHeight など）。",
        files: ["src/lib/gridLayout.ts"],
        docs: ["../development/ui-scale-notes.md"],
      },
      {
        name: "columnBuildSignature.ts / columnBuildRegistry.ts",
        summary:
          "WebView 構築時に埋め込まれる設定の署名と、カラムごとの記録・古さ判定（isColumnBuildStale）。",
        files: [
          "src/lib/columnBuildSignature.ts",
          "src/lib/columnBuildRegistry.ts",
        ],
      },
      {
        name: "columnOrder.ts",
        summary:
          "カラム表示順・グリッド列グループの並べ替え（moveGroup など）。",
        files: ["src/lib/columnOrder.ts"],
      },
      {
        name: "theme.ts / contrast.ts",
        summary: "テーマ解決（resolveTheme）、コントラスト計算。",
        files: ["src/lib/theme.ts", "src/lib/contrast.ts"],
      },
      {
        name: "uiScale.ts",
        summary: "UI 倍率の決定・クランプ、remToPx と rootFontPx。",
        files: ["src/lib/uiScale.ts"],
      },
      {
        name: "language.ts",
        summary: "言語設定の正規化と OS ロケールからの解決。",
        files: ["src/lib/language.ts"],
      },
      {
        name: "backupRestore.ts",
        summary:
          "復元の紐づけ候補・実行可否・id 再採番・グリッド正規化など（Tauri 非依存）。",
        files: ["src/lib/backupRestore.ts"],
      },
      {
        name: "apiRateLimit.ts",
        summary: "レート制限の severity 判定など。",
        files: ["src/lib/apiRateLimit.ts"],
      },
      {
        name: "appError.ts",
        summary:
          "Rust の AppError（種別コード＋詳細）の解釈と翻訳キーへの対応。",
        files: ["src/lib/appError.ts"],
      },
      {
        name: "lineListValidation.ts / ngWordPattern.ts / repostHiddenUserId.ts",
        summary: "NG ワード等の行入力の parse と検証。",
        files: [
          "src/lib/lineListValidation.ts",
          "src/lib/ngWordPattern.ts",
          "src/lib/repostHiddenUserId.ts",
        ],
      },
      {
        name: "reauthIdentity.ts",
        summary: "再認証で得た X ユーザー ID と登録済み ID の照合。",
        files: ["src/lib/reauthIdentity.ts"],
      },
      {
        name: "rafThrottle.ts",
        summary: "rAF で呼び出しを 1 フレーム 1 回に間引く。",
        files: ["src/lib/rafThrottle.ts"],
      },
      {
        name: "log.ts",
        summary: "logError(tag) — 失敗してもユーザー影響の無い箇所の記録用。",
        files: ["src/lib/log.ts"],
      },
      {
        name: "githubRelease.ts / updatePrompt.ts / version.ts",
        summary:
          "リリース情報の解析（APK ハッシュ）、更新ダイアログ表示判定、バージョン比較。",
        files: [
          "src/lib/githubRelease.ts",
          "src/lib/updatePrompt.ts",
          "src/lib/version.ts",
        ],
      },
      {
        name: "autoReloadTarget.ts / scrollRestoreSetting.ts / linkPopupUrl.ts / extensionsSupport.ts",
        summary:
          "自動更新対象判定、スクロール復元設定、URL 補正、拡張機能サポート判定。",
        files: [
          "src/lib/autoReloadTarget.ts",
          "src/lib/scrollRestoreSetting.ts",
          "src/lib/linkPopupUrl.ts",
          "src/lib/extensionsSupport.ts",
        ],
      },
    ],
  },
  "react.events": {
    title: "React が購読するイベント（IPC_EVENTS）",
    columns: [
      { key: "name", label: "イベント名", code: true },
      { key: "source", label: "発信元" },
      { key: "summary", label: "用途" },
    ],
    filters: [{ key: "source", label: "発信元" }],
    items: [
      {
        name: "account-login-complete",
        source: "Rust (desktop)",
        summary: "アカウントログイン完了。useAccounts が購読。",
        files: ["src/constants/ipc.ts"],
      },
      {
        name: "account-reauth-complete",
        source: "Rust (desktop)",
        summary: "再認証完了。payload { accountId, xUserId }。",
        files: ["src/constants/ipc.ts"],
      },
      {
        name: "webview-scroll",
        source: "inject → Rust",
        summary: "WebView 内の横ホイール量。下部スクロールバーを動かす。",
        files: ["src/hooks/useWebviewEvents.ts"],
      },
      {
        name: "webview-new-posts-count",
        source: "inject → Rust",
        summary: "新着数。未読バッジと通知。",
        files: ["src/hooks/useWebviewEvents.ts"],
      },
      {
        name: "webview-api-rate-limit",
        source: "inject → Rust",
        summary: "API レート制限ヘッダ。apiRateLimits に反映。",
        files: ["src/hooks/useWebviewEvents.ts"],
      },
      {
        name: "webview-keyboard-shortcut",
        source: "inject → Rust",
        summary: "WebView 内で押されたショートカットの転送。",
        files: ["src/hooks/useKeyboardShortcuts.ts"],
      },
      {
        name: "webview-official-settings-captured",
        source: "inject → Rust",
        summary: "公式設定ページのスナップショット取得。他アカウントへ配布。",
        files: ["src/hooks/useWebviewEvents.ts"],
      },
      {
        name: "official-settings-popup-closed",
        source: "Rust",
        summary: "公式設定ポップアップが閉じられた通知。",
        files: ["src/hooks/useWebviewEvents.ts"],
      },
      {
        name: "column-webview-crashed",
        source: "Rust (Linux)",
        summary:
          "WebProcess クラッシュ。当該カラムを再生成（クールダウン・試行上限あり）。",
        files: ["src/hooks/useWebviewEvents.ts"],
        docs: ["../development/linux-webview-notes.md"],
      },
      {
        name: "column-webview-focused",
        source: "Rust (Windows)",
        summary: "カラムが OS フォーカスを得た。未読を自動クリア。",
        files: ["src/hooks/useWebviewEvents.ts"],
      },
      {
        name: "video-download-progress",
        source: "Rust (desktop)",
        summary: "動画ダウンロード進捗。",
        files: ["src/constants/ipc.ts"],
      },
      {
        name: "close-topmost-popup",
        source: "Android (JNI)",
        summary: "最前面ポップアップを閉じる。",
        files: ["src/constants/ipc.ts"],
      },
      {
        name: "mobile-swipe-navigate / mobile-swipe-progress / mobile-swipe-double-tap",
        source: "Android (JNI)",
        summary: "スワイプバーの遷移確定・進捗・ダブルタップ。",
        files: ["src/hooks/useMobileColumns.ts"],
      },
    ],
  },
});
