// howto ページのデータ（フロー・一覧）
window.MCX_DATA = window.MCX_DATA || { flows: {}, catalogs: {}, details: {} };

Object.assign(window.MCX_DATA.flows, {
  "howto.dev-flow": {
    title: "機能追加の開発フロー（1 サイクル）",
    description:
      "着手から PR までの流れ。Gherkin 仕様は承認済みシナリオからテストを導き、.feature 自体はコミットしない。",
    actors: [
      { id: "dev", label: "開発者", layer: "common" },
      { id: "spec", label: "仕様 (docs/specs)", layer: "common" },
      { id: "code", label: "実装 + テスト", layer: "react" },
      { id: "ci", label: "品質チェック", layer: "rust" },
    ],
    steps: [
      {
        from: "dev",
        to: "dev",
        label: "要求の明確化・ブランチ作成",
        detail:
          "<p>曖昧な点を質問で潰し、develop を最新化してから develop 起点の作業ブランチを切ります。新規ブランチを切るかは着手前に確認するのがこのプロジェクトの決まりです。</p>",
        files: [".claude/skills/clarify-requirements/SKILL.md", "CLAUDE.md"],
      },
      {
        from: "dev",
        to: "spec",
        label: "Gherkin で仕様を書き承認を得る",
        detail:
          "<p>機能追加・挙動変更・バグ修正では <code>docs/specs/&lt;機能名&gt;.feature</code> を日本語 Gherkin で書きます。挙動不変のリファクタ・docs・CI 設定のみの変更は対象外です。</p>",
        files: [".claude/skills/gherkin-spec/SKILL.md"],
      },
      {
        from: "spec",
        to: "code",
        label: "シナリオごとにテストを作る",
        kind: "return",
        detail:
          "<p>@unit は単体テスト、@integration は結合テスト、@manual は手動テスト項目へ。テスト名はシナリオ名に対応させますが、<b>テスト・コメント・コミットに .feature への参照は書かず、.feature 自体もコミットしません。</b></p>",
        files: [".claude/skills/tdd/SKILL.md"],
      },
      {
        from: "dev",
        to: "code",
        label: "実装（TDD / Gherkin 由来は実装後テスト可）",
        detail:
          "<p>Gherkin 対象外の変更は Red 先行の TDD。Gherkin 由来のテストは実装後に書いてもよいが、主要な分岐を一時的に壊して Red になることを確認するミューテーション確認は必須です。</p>",
      },
      {
        from: "code",
        to: "ci",
        label: "format → typecheck → lint → test …",
        detail:
          "<p>変更内容に応じて <code>check-creation</code> の各コマンドを上から順に実行します（レシピ 10 参照）。</p>",
        files: [".claude/skills/check-creation/SKILL.md"],
      },
      {
        from: "ci",
        to: "dev",
        label: "オールグリーン → コミット・push・PR",
        kind: "return",
        detail:
          "<p>作業の粒度ごとにコミット。push と develop 向け PR はリポジトリのルールに合わせます。</p>",
      },
    ],
  },

  "howto.command-flow": {
    title: "Tauri コマンドが呼ばれるまで（ACL 付き）",
    description:
      "コマンドを足したときに「どこで拒否され得るか」を追う。4 つの登録先が揃わないと実行時に拒否される。",
    actors: [
      { id: "ui", label: "React (services / hooks)", layer: "react" },
      { id: "acl", label: "ACL (build.rs + capabilities)", layer: "rust" },
      { id: "cmd", label: "commands/*.rs", layer: "rust" },
    ],
    steps: [
      {
        from: "ui",
        to: "ui",
        label: "IPC_COMMANDS.XXX を参照",
        detail:
          "<p>コマンド名の文字列は <code>src/constants/ipc.ts</code> の <code>IPC_COMMANDS</code> に集約します。Rust 側の定数 <code>ipc_constants.rs</code> と <code>contracts/ipc-constants.json</code> とは契約テストで突き合わされます。</p>",
        files: ["src/constants/ipc.ts", "contracts/ipc-constants.json"],
      },
      {
        from: "ui",
        to: "acl",
        label: "invoke(name, args)",
        kind: "invoke",
        detail:
          '<p>引数のキーは JS 側 camelCase のまま Rust に届きます（Tauri v2 は自動変換しない）。構造体のフィールドなら <code>#[serde(rename = "...")]</code> が必要です。</p>',
      },
      {
        from: "acl",
        to: "acl",
        label: "AppManifest に有るか → capability で許可されているか",
        detail:
          "<p><code>src-tauri/build.rs</code> の <code>AppManifest</code> に名前が無いコマンドは、capability の許可有無に関わらず拒否されます。さらに呼び出し元ウィンドウに適用される capability（<code>default.json</code> はメイン、<code>column-webview.json</code> は X ページ向け）に <code>allow-&lt;kebab-case&gt;</code> が必要です。</p>",
        files: [
          "src-tauri/build.rs",
          "src-tauri/capabilities/default.json",
          "src-tauri/capabilities/column-webview.json",
        ],
      },
      {
        from: "acl",
        to: "cmd",
        label: "generate_handler! 経由で呼び出し",
        detail:
          "<p><code>lib.rs</code> の <code>generate_handler!</code> に未登録だと「コマンドが見つからない」エラーになります。<code>#[cfg(desktop)]</code> 付きコマンドはマクロ引数側にも同じ属性が必要です。</p>",
        files: ["src-tauri/src/lib.rs"],
      },
      {
        from: "cmd",
        to: "cmd",
        label: "require_main_caller(&webview)",
        detail:
          "<p>破壊的な操作はメインウィンドウ以外（X のページ等）からの呼び出しを弾きます。カラム WebView から呼ばせる必要のあるコマンドにだけ付けない、という判断を明示的にします。</p>",
        files: ["src-tauri/src/commands/mod.rs"],
      },
      {
        from: "cmd",
        to: "ui",
        label: "Ok(値) / Err(AppError)",
        kind: "return",
        detail:
          "<p>失敗は <code>AppError { code, detail }</code> で返し、TS 側は <code>describeAppError</code> で翻訳して表示します（レシピ 4 参照）。</p>",
        files: ["src-tauri/src/commands/app_error.rs", "src/lib/appError.ts"],
      },
    ],
  },

  "howto.setting-flow": {
    title: "設定値が inject に届くまで",
    description:
      "グローバル設定のフラグを追加したとき、値が通る 7 箇所の同期点。1 つでも漏れると型エラー・契約テスト失敗・値未到達になる。",
    actors: [
      { id: "ts", label: "TS 型 / 設定 UI", layer: "react" },
      { id: "store", label: "settings.json (Rust)", layer: "rust" },
      { id: "init", label: "build_init_script", layer: "rust" },
      { id: "inj", label: "inject (X の画面)", layer: "inject" },
    ],
    steps: [
      {
        from: "ts",
        to: "ts",
        label: "GlobalSettings 型 + 既定値",
        detail:
          "<p><code>src/types/index.ts</code> の <code>GlobalSettings</code> と <code>DEFAULT_GLOBAL_SETTINGS</code> に追加します。</p>",
        files: ["src/types/index.ts"],
      },
      {
        from: "ts",
        to: "store",
        label: "contracts/default-settings.json と Rust の impl Default",
        kind: "invoke",
        detail:
          "<p>既定値は Rust の <code>impl Default</code> が唯一の定義元。TS・fixture と同じ値にそろえ、<code>defaults.contract.test.ts</code> と Rust の <code>default_settings_match_contract_fixture</code> が突き合わせます。</p>",
        files: [
          "contracts/default-settings.json",
          "src-tauri/src/commands/settings.rs",
          "src/types/defaults.contract.test.ts",
        ],
      },
      {
        from: "store",
        to: "init",
        label: "ColumnScriptSettings → InitScriptParams",
        detail:
          "<p><code>settings_store.rs</code> の <code>column_script_settings_from</code> で取り出し、<code>column.rs</code> の <code>build_column_init_script</code> から <code>InitScriptParams</code> に渡します。</p>",
        files: [
          "src-tauri/src/commands/settings_store.rs",
          "src-tauri/src/commands/webview/column.rs",
        ],
      },
      {
        from: "init",
        to: "init",
        label: "window.__multiColumnXConfig を生成",
        detail:
          "<p><code>src-tauri/src/inject/mod.rs</code> の <code>build_init_script</code> が設定を JS オブジェクトとして文字列生成します。</p>",
        files: ["src-tauri/src/inject/mod.rs"],
      },
      {
        from: "init",
        to: "inj",
        label: "MultiColumnXConfig（types.d.ts）",
        kind: "event",
        detail:
          "<p>inject 側は <code>_src/types.d.ts</code> の <code>MultiColumnXConfig</code> に optional フィールドを足して参照します。</p>",
        files: ["src-tauri/src/inject/_src/types.d.ts"],
      },
    ],
  },

  "howto.error-flow": {
    title: "Rust のエラーが画面文言になるまで",
    description:
      "Rust は日本語・英語の文章を返さない。種別コードだけを返し、TS 側で辞書から翻訳する。",
    actors: [
      { id: "rs", label: "Rust (AppError)", layer: "rust" },
      { id: "ts", label: "TS (describeAppError)", layer: "react" },
      { id: "dict", label: "locales/*/messages.json", layer: "common" },
    ],
    steps: [
      {
        from: "rs",
        to: "rs",
        label: "codes に定数を追加",
        detail:
          "<p><code>app_error.rs</code> の <code>pub mod codes</code> に <code>area.camelCase</code> の 2 階層 ASCII で追加します。</p>",
        files: ["src-tauri/src/commands/app_error.rs"],
      },
      {
        from: "rs",
        to: "ts",
        label: "Err(AppError { code, detail })",
        kind: "invoke",
        detail:
          "<p>OS やライブラリの生のエラー文字列・パス・HRESULT は <code>detail</code> に入れ、固定文に混ぜません。</p>",
      },
      {
        from: "dict",
        to: "ts",
        label: "messages:rustError.<code> を引く",
        kind: "return",
        detail:
          "<p>辞書は ja・en の両方に <code>rustError.&lt;area&gt;.&lt;name&gt;</code> を足します。<code>detail</code> を使うなら <code>{{detail}}</code> を含めます。</p>",
        files: ["src/locales/ja/messages.json", "src/locales/en/messages.json"],
      },
      {
        from: "ts",
        to: "ts",
        label: "契約テストが全コードの辞書登録を検査",
        detail:
          "<p><code>appError.contract.test.ts</code> が「Rust の全コード = ja/en の辞書キー」を検査します。画面に保持するときは文字列化せず <code>AppError</code> のまま持ち、描画時に翻訳します（言語切替に追従するため）。</p>",
        files: ["src/lib/appError.contract.test.ts"],
      },
    ],
  },
});

Object.assign(window.MCX_DATA.catalogs, {
  "howto.troubles": {
    title: "困ったときの症状と対処",
    columns: [
      { key: "symptom", label: "症状" },
      { key: "cause", label: "主な原因" },
      { key: "area", label: "領域" },
    ],
    filters: [{ key: "area", label: "領域" }],
    items: [
      {
        symptom:
          "実行時にコマンドが ACL で拒否される（not allowed / forbidden）",
        cause: "build.rs の AppManifest か capability の更新漏れ",
        area: "Rust / ACL",
        detail:
          "<p><b>対処:</b> コマンドを足したら <code>build.rs</code> の <code>AppManifest</code>、<code>capabilities/default.json</code>（メインから呼ぶ場合）、X ページの inject から呼ぶ場合は <code>column-webview.json</code> を同時に更新します。<code>cargo test</code> の <code>acl_contract</code> が検出するので、先にテストを走らせると原因が分かります。<code>column-webview.json</code> の許可集合は inject が実際に使うコマンドと厳密一致で検証されるため、メイン専用コマンドを足してはいけません。</p><p>呼び出し元がメイン以外のときの <code>forbidden: caller must be the main window</code> は <code>require_main_caller</code> によるものです。</p>",
        files: [
          "src-tauri/build.rs",
          "src-tauri/capabilities/default.json",
          "src-tauri/capabilities/column-webview.json",
          "src-tauri/src/acl_contract.rs",
        ],
      },
      {
        symptom: "Windows で WebView 作成時に ERROR_INVALID_STATE",
        cause:
          "同じ data_directory を使う WebView 間で browser_extensions_enabled の有無が食い違っている",
        area: "Rust / WebView",
        detail:
          "<p>アカウントの data_directory を使う全 WebView builder に <code>#[cfg(windows)]</code> で <code>.browser_extensions_enabled(true)</code> を付けます。契約テストが検査します。詳細は browser-extensions-notes.md。</p>",
        files: [
          "src-tauri/src/commands/webview/mod.rs",
          "docs/development/browser-extensions-notes.md",
        ],
      },
      {
        symptom:
          "リリースビルドの Android だけ落ちる（NoSuchMethodException 等）",
        cause:
          "MainActivity.kt のシグネチャ変更に proguard-rules.pro の keep ルールが追従していない",
        area: "Android",
        detail:
          "<p><code>android_bridge.rs</code> は JNI で <code>MainActivity</code> のメソッドを文字列指定で呼びます。R8 が難読化すると見つからなくなります。デバッグビルドでは R8 が無効なため症状が出ません。<code>proguard-rules.pro</code> の <code>-keepclassmembers</code> を同期し、リリースビルドで動作確認してください。</p>",
        files: [
          "src-tauri/gen/android/app/proguard-rules.pro",
          "src-tauri/src/android_bridge.rs",
          "docs/development/android-notes.md",
        ],
      },
      {
        symptom: "inject を直したのに X の画面に反映されない",
        cause:
          "生成物 *.js を編集した / build:inject していない / vite.inject.config.ts の entries 未追加",
        area: "inject",
        detail:
          "<p><code>src-tauri/src/inject/*.js</code> は gitignore 済みの生成物です。<code>_src/*.ts</code> を編集し <code>npm run build:inject</code> を実行します（<code>tauri:dev</code> は前段で実行）。新規ファイルなら <code>vite.inject.config.ts</code> の <code>plainEntries</code> と <code>inject/mod.rs</code> の <code>include_str!</code> の両方が必要です。開いているカラムは再生成が必要な場合があります。</p>",
        files: ["vite.inject.config.ts", "src-tauri/src/inject/mod.rs"],
      },
      {
        symptom: "cargo clippy / cargo test が include_str! でコンパイルエラー",
        cause: "build:inject を未実行（新規 worktree 等）",
        area: "Rust",
        detail:
          "<p>Rust は gitignore 済みのビルド済み inject <code>.js</code> を <code>include_str!</code> で埋め込みます。<code>npm run build:inject</code> を先に実行します。</p>",
        files: ["src-tauri/src/inject/mod.rs"],
      },
      {
        symptom: "non_snake_case 警告で lint:rust が失敗する",
        cause: "Rust のテスト関数名に ASCII 大文字が入っている",
        area: "Rust",
        detail:
          "<p><code>cargo clippy -- -D warnings</code> が警告をエラー扱いにします。日本語（非 ASCII）部分は対象外ですが、英単語を含める場合はすべて小文字にします（例: <code>ngwordsは…</code>）。</p>",
        files: ["package.json"],
      },
      {
        symptom:
          "defaults.contract.test.ts / default_settings_match_contract_fixture が失敗する",
        cause: "既定値の 3 箇所（Rust impl Default / TS / fixture）の不一致",
        area: "設定",
        detail:
          "<p>設定の既定値を変えるときは Rust の <code>impl Default</code>、TS の <code>DEFAULT_GLOBAL_SETTINGS</code> / <code>DEFAULT_COLUMN_SETTINGS</code>、<code>contracts/default-settings.json</code> を同時に更新します。</p>",
        files: [
          "contracts/default-settings.json",
          "src/types/defaults.contract.test.ts",
          "src-tauri/src/commands/settings.rs",
        ],
      },
      {
        symptom:
          "バックアップのキー集合テストが失敗する（GlobalSettingsData に項目を足した後）",
        cause: "バックアップに含めるか除外するかの判断が未記載",
        area: "設定",
        detail:
          "<p>バックアップ出力は <code>BackupGlobalSettings</code> のホワイトリストです。端末依存の項目は除外一覧に、移行したい項目は出力型に足して、テストの前提（出力キー ∪ 除外一覧 = 既定値のキー集合）を満たします。</p>",
        files: [
          "src-tauri/src/commands/backup/format.rs",
          "src-tauri/src/commands/backup/format_tests.rs",
          "docs/development/backup-restore-notes.md",
        ],
      },
      {
        symptom: "unusedKeys.contract.test.ts が失敗する",
        cause: "辞書に追加したキーがソースのどこからも参照されていない",
        area: "i18n",
        detail:
          "<p>使わないキーは削除します。動的キーは ``t(`common:language.${value}`)`` のように<b>名前空間付きの接頭辞をテンプレートリテラルの先頭に書く</b>と使用済みとみなされます。</p>",
        files: [
          "src/i18n/unusedKeys.contract.test.ts",
          "docs/development/i18n-notes.md",
        ],
      },
      {
        symptom: "resources.contract.test.ts が失敗する",
        cause: "ja と en のキー集合・補間変数 {{xxx}} が一致していない",
        area: "i18n",
        detail:
          "<p>両方の辞書に同じキーと同じ補間変数を書きます。複数形は <code>key_one</code> / <code>key_other</code> の組です。</p>",
        files: ["src/i18n/resources.contract.test.ts"],
      },
      {
        symptom: "ESLint の no-restricted-syntax でエラー（日本語直書き）",
        cause: "画面コードに日本語文字列リテラルを書いた",
        area: "i18n",
        detail:
          '<p>辞書化して <code>t("ns:key")</code> で参照します。どうしても必要な箇所は <code>eslint-disable</code> に理由を添えます。</p>',
        files: ["eslint.config.js", "src/lib/i18nLint.contract.test.ts"],
      },
      {
        symptom: "gridLayout.contract.test.ts が失敗する",
        cause: "SCSS の高さと gridLayout.ts の rem 定数がずれた",
        area: "React",
        detail:
          "<p>TopBar・ColumnHeader・MobileTabBar の高さは SCSS と <code>gridLayout.ts</code> の rem 定数を同値に保ちます。ずれるとカラム WebView の位置が崩れます。</p>",
        files: ["src/lib/gridLayout.ts", "src/lib/gridLayout.contract.test.ts"],
      },
      {
        symptom:
          "themeContrast.contract.test.ts / swipeBarColors.contract.test.ts が失敗する",
        cause:
          "配色トークンのコントラスト不足、または Android スワイプバーの色が未同期",
        area: "React / Android",
        detail:
          "<p>トークンを変えたら <code>SwipeBarOverlayView.kt</code> の複製色も更新します。白文字を載せる塗り背景には <code>--mcx-accent</code> ではなく <code>--mcx-accent-fill</code> を使います。</p>",
        files: [
          "src/index.css",
          "src/lib/themeContrast.contract.test.ts",
          "src/lib/swipeBarColors.contract.test.ts",
        ],
      },
      {
        symptom:
          "Linux でカラムが横スクロール時にはみ出す / WebProcess がクラッシュする",
        cause:
          "linux_column_layout の変更やテスト無しのインライン実装によるデグレード",
        area: "Rust / Linux",
        detail:
          "<p>過去に複数回デグレードした領域です。正式仕様 linux-column-spec.md と、linux-webview-notes.md のテスト方針に従って変更します。</p>",
        files: [
          "docs/development/linux-column-spec.md",
          "docs/development/linux-webview-notes.md",
          "src-tauri/src/commands/webview/column.rs",
        ],
      },
      {
        symptom:
          "リンクを開くとアプリ内で別ウィンドウが開く / ファイルドロップが効かない",
        cause:
          "WebView builder に on_new_window / disable_drag_drop_handler が付いていない",
        area: "Rust / WebView",
        detail: "<p>契約テストが検査します。レシピ 7 を参照。</p>",
        files: [
          "src-tauri/src/commands/webview/external_link.rs",
          "docs/development/external-link-new-window-notes.md",
        ],
      },
      {
        symptom: "アプリ終了後も常駐ウィンドウ（コンポーズ）が残る",
        cause: "prevent_close を使うウィンドウに明示 destroy() が無い",
        area: "Rust",
        detail:
          "<p><code>close()</code> は <code>prevent_close()</code> + <code>hide()</code> で握られていると効きません。メインウィンドウの <code>CloseRequested</code> で <code>destroy()</code> します。</p>",
        files: [
          "src-tauri/src/lib.rs",
          "docs/development/compose-popup-topbar-notes.md",
        ],
      },
      {
        symptom: "npx prettier --check . だけ CI で落ちる",
        cause: "docs / md / HTML の整形漏れ",
        area: "共通",
        detail:
          "<p>編集フックが整形するのは Edit/Write したファイルだけです。<code>npx prettier --write &lt;対象&gt;</code> で直します。docs だけの変更でも必ず実行します。</p>",
        files: [".github/workflows/ci.yml"],
      },
      {
        symptom: "テスト実行でストアの設定が壊れる / settings.json が空になる",
        cause: "Store::save を直接呼んだ、または setup の復旧順序を崩した",
        area: "Rust",
        detail:
          "<p><code>save_store_atomically</code> を使い、<code>setup</code> 冒頭の「復旧 → 自動保存無効のストア登録」の順序を保ちます。</p>",
        files: ["docs/development/settings-file-crash-safety-notes.md"],
      },
    ],
  },
});

Object.assign(window.MCX_DATA.details, {});
