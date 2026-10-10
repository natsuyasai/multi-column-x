# CLAUDE.md

## プロジェクト概要

Multi Column X — TweetDeck スタイルの Twitter/X クライアント（Tauri v2 製）。  
React 19 + TypeScript フロントエンドと Rust バックエンドで構成。  
デスクトップ（Windows/Mac/Linux）と Android に対応。

詳細は `README.md`（概要）と `docs/development/`（技術詳細。構成は `project-structure.md`、コマンドは `tauri-commands.md`、設計上の注意は `architecture-overview.md`）を参照。

このプロジェクトではCodeGraphを利用しています。

コード調査では、grep / glob / Read を多用する前に、まずCodeGraphで以下を確認してください。

- 対象シンボルの定義
- 呼び出し元
- 呼び出し先
- 影響範囲
- 関連テスト

その後、必要最小限のファイルだけを読んでください。

## 実装ガイドライン

- 必ず日本語で回答してください。
- テストケース名は日本語で作成してください。
  - **Rust のテスト関数名には ASCII 大文字を含めないこと**（例: `ngWordsは…` は NG → `ngwordsは…`）。テスト関数名に大文字が入ると `non_snake_case` 警告が発生し、`cargo clippy -- -D warnings`（CI / `npm run lint:rust`）がビルドエラーになる。日本語（非 ASCII）部分は snake_case 判定の対象外なのでそのまま使ってよい。英単語を含める場合はすべて小文字にする。
- Robert C. Martinが提唱する原則に従ってコードを作成してください。
- TDDおよびテスト駆動開発で実装する際は、すべてt-wadaの推奨する進め方に従ってください（承認済みGherkin仕様から導出するテストの例外は「作業手順」のGherkin項を参照）。
- リファクタリングはMartin Fowlerが推奨する進め方に従ってください。
- セキュリティルールに従うこと。
- エラーや警告が発生する場合は、必ず修正してください。
- SKILLとして定義が必要なものが出てきた場合は、`.claude/skills/` フォルダに専用のskillとして保存してください

## サブエージェント運用（実装委譲の基本ルール）

- 実装作業（フェーズ3）は必ずサブエージェントに委譲し、メインエージェントは統括（レビュー・進行管理・コミット・品質チェック実行・ドキュメント整備）に徹する。メインが自分で実装を書かない
- **使用モデルの決め方（ユーザーが明示的にモデルを変更しない限りこの規則に従う）**
  - メインエージェント: ユーザーの設定（`/model` 等）のまま。こちらから変更しない
  - サブエージェント: 作業の性質で `model` を選ぶ
    - 調査・設計・実装・レビューなど知力が必要な作業 → `sonnet`
    - コマンドの実行（フォーマッター・テスト・ビルドの実行と結果の要約など）や単なるファイル走査・一覧収集など機械的な作業 → `haiku`
    - 迷ったら `sonnet`（haiku は判断を要しない作業に限る）
  - ユーザーがモデルを明示指定した場合はその指定を優先する
- `Agent` 委譲の前に「メイン=<モデル名> / サブエージェント=<モデル名>」を必ずテキスト出力する
- Sonnet では対応が難しい作業が出た場合は、**ユーザーの承認を得てから**メインが対応する
- 実装プラン（フェーズ2の `plan.md`）は Sonnet が単独で実行できる詳細度で書く（自己完結・現状コードの引用・変更後のコード断片・正確なファイルパス・落とし穴チェックリスト）
- **コミット末尾のトレーラー（`Co-Authored-By` / `Claude-Session`）は、委譲元（メイン）がプランや委譲プロンプトで指定したものをそのまま使う。** サブエージェント側のセッションリマインダーの表記（例: `Claude Sonnet 5`）が異なっていても上書きせず、`--amend` での書き換えもしない。メインは委譲プロンプトにトレーラーを明記する（未記載だとサブエージェントごとに判断がばらけ、同一 PR 内でも表記が混在する）
- サブエージェントは、プランに記載の無い判断（トレーラーの表記など）で迷っても作業を止めずに進め、報告に「要確認」として記載する。メインは報告を受けたら、次の委譲からプランに反映する

## 作業手順

- ブランチ運用の基本フロー: developを最新化 → developから作業ブランチを作成 → 作業完了後にpush → developに対するPRを作成
  - 新規ブランチを作成するべきかは、着手前にまずユーザーへ確認すること
- 必ず1度には1つのことだけを行うこと
- 作業毎にコミットすること
- 必ずテストを作成すること
- **機能追加・挙動変更・バグ修正では、Gherkin記法で仕様を定義する**（`docs/specs/<機能名>.feature`、日本語Gherkin、ユーザー承認必須。挙動不変のリファクタ・docs・CI設定のみの変更は対象外）。詳細は `.claude/skills/gherkin-spec`
  - 承認済みシナリオごとに単体テスト（`@unit`）・結合テスト（`@integration`）を必ず作る。テスト名はシナリオ名に対応させるが、**テストコード・コメント・コミットに `.feature` への参照は書かない**。`.feature` 自体もコミットしない
  - **Gherkin由来のテストは、TDD（Red先行）に従わず実装後に作成してよい**（承認済みシナリオが期待結果の正になるため）。その場合もコミット前のミューテーション確認（主要な分岐を一時的に壊して Red になるか）は必須。どちらで進めるかはフェーズ2のプランに明記する。Gherkin対象外の変更やシナリオに無い追加テスト（プロパティテスト等）は従来どおりTDD。詳細は `tdd` スキル「進め方の選択」
  - 自動化できないシナリオ（`@manual`）は手動テスト項目として `integration-test.md` に必ず出力する（`integration-test-viewpoints`、フェーズ6は必須）
- 対応完了時にはフォーマッターとテストを実行してオールグリーンとなること
- 設計内容や実装内容に関して不明慮な点があれば必ず確認すること
  - ユーザーの依頼内容が曖昧・不完全な場合、そのまま着手せず、明確になるまで質問を繰り返して掘り下げる
  - 明確になったら、最終的な内容（仕様・方針・対応範囲など）をユーザーに提示し、**明示的な承認を得てから**実装・処理を続行する
  - 確認・質問は `AskUserQuestion` ツールを使う（選択肢の提示と「その他（自由記載）」の用意はツールが自動的に行うため、手動で連番・選択肢を組み立てる必要はない）

## アーキテクチャ上の重要な制約

### desktop / mobile の条件コンパイル

Rust コードは `#[cfg(desktop)]` / `#[cfg(mobile)]` で分岐する。同一コマンド名でも実装が異なる場合があるため、変更時は両方の実装を確認すること。

### inject スクリプトのビルド

`src-tauri/src/inject/_src/**` を変更する場合の詳細（ビルドフロー・実 DOM 検証ルール）は `docs/development/inject-ipc-shortcuts-notes.md` を参照。

### カラム WebView と z-index

Tauri v2 の子 WebView は OS ネイティブウィンドウのため、CSS `z-index` が機能しない。`src/App.tsx` を変更する場合の詳細は `docs/development/column-layout-notes.md` を参照。

### UI の寸法は rem で書く（アプリUI表示サイズ）

アプリ UI の倍率は `<html>` の font-size で変えるため、UI の寸法は `rem` で書く（`px` 禁止。1px 以下のヘアラインと media query を除く）。ネイティブ bounds に使う高さ定数は `src/lib/gridLayout.ts` の rem 定数 + `remToPx` を使い、SCSS の同値と一致させる（`gridLayout.contract.test.ts` が検証する）。詳細は `docs/development/ui-scale-notes.md` を参照。
パネル型ダイアログを新設するときは `src/styles/_dialog-fullscreen.scss` のミキシンで Android 全画面化すること（詳細は `docs/development/ui-scale-notes.md`）。

### serde のフィールド命名

Tauri v2 は JS→Rust のケース変換を行わない。JS 側 camelCase フィールドには `#[serde(rename = "...")]` が必要。

### グリッドレイアウト

カラムは `gridRow` / `gridCol` でマトリクス配置する。`src/lib/gridLayout.ts` / `src/services/columnWebview.ts` を変更する場合の詳細は `docs/development/column-layout-notes.md` を参照。

### Linux カラム WebView のクリッピング・WebProcess クラッシュ対策（デグレ注意）

Linux ではカラムが独立 `WebviewWindow`（親クリップが効かない）ため、横スクロール時のはみ出し表示を `linux_column_layout`（`src-tauri/src/commands/webview/column.rs`）で制御する。正式仕様は **`docs/development/linux-column-spec.md`** に明記。実装ファイル・落とし穴・テスト方針の詳細は `docs/development/linux-webview-notes.md` を参照。**過去にインライン実装・テスト無しで複数回デグレードしている領域のため、変更する場合は必ず参照ノートのテスト方針に従うこと。**

### Tauri ウィンドウの close() と destroy()（常駐ウィンドウの破棄）

`WebviewWindow::close()` は `prevent_close()` + `hide()` で閉じる操作を握っている常駐ウィンドウ（例: 常駐コンポーズ `compose-`）には効かない。`src-tauri/src/lib.rs` を変更する場合の詳細は `docs/development/compose-popup-topbar-notes.md` を参照。`prevent_close` を使う常駐ウィンドウを新設したら、メインウィンドウの `CloseRequested`（`lib.rs`）に明示 `destroy()` を必ず追加すること。

### 外部リンクの新規ウィンドウ処理（`on_new_window`）

デスクトップでは新規ウィンドウ要求を `on_new_window`（`src-tauri/src/commands/webview/external_link.rs`）で受け、http/https/mailto/tel だけ既定ブラウザで開いて常に Deny する（opener の自動クリックスクリプトはデスクトップでは無効）。**カラム / ポップアップ / コンポーズの WebView builder を新設・変更したら、必ず `.on_new_window(external_link::new_window_handler(app.clone()))` を付けること**（契約テストが検査する）。理由・実機 CDP 検証手順は `docs/development/external-link-new-window-notes.md` を参照。

### Tauri コマンドの追加・削除（ACL）

アプリ独自コマンドは ACL で制御している。コマンドを追加・削除したら、**`src-tauri/build.rs` の `AppManifest` と capability（`src-tauri/capabilities/default.json` / `column-webview.json`）を必ず同時に更新すること**。漏れると実行時に ACL 拒否される（`src-tauri/src/acl_contract.rs` の契約テストが `cargo test` で検出する）。`column-webview.json` の許可集合は inject が実際に使うコマンド集合と厳密一致で検証される。メインウィンドウ専用コマンドは `require_main_caller`（`src-tauri/src/commands/mod.rs`）で呼び出し元を検証する。

### アカウントログイン検出（desktop vs mobile）

- **desktop**: tokio タスクが URL を 500ms ポーリング → `account-login-complete` イベントを emit
- **mobile**: `open_add_account_window` が tokio でセンチネルファイルをポーリングしてブロック。AddAccount.kt が `add_account_login_complete` ファイルを書き込んで通知する。

### Android の単体テスト実行・ProGuard keep ルールの同期

`src-tauri/gen/android/**` を変更する場合の詳細（単体テストコマンド、`MainActivity.kt` とのシグネチャ同期ルール）は `docs/development/android-notes.md` を参照。**`MainActivity.kt` のメソッドシグネチャを変更したら、必ず `proguard-rules.pro` も同時に更新すること**（リリースビルドでしか症状が出ないため注意）。

### API レート制限モニター

X内部APIのレート制限ヘッダをツールバーのポップオーバーに表示する機能。`src/constants/apiRateLimitLabels.ts` / `src/components/ApiRateLimitIndicator/` / `src/lib/apiRateLimit.ts` を変更する場合の詳細（bucketKeyの対応表・severity判定ロジック）は `docs/development/api-rate-limit-operations-notes.md` を参照。

### リリースCI・テーマ切替・再認証

`src/lib/theme.ts` / `src/hooks/useTheme.ts`（テーマ切替）、`src/lib/reauthIdentity.ts` / `src-tauri/src/commands/account.rs`（既存アカウントの再認証・Cookie上書き）、`src/services/updater.ts` / `src/hooks/useAppUpdater.ts` / `src-tauri/src/commands/update.rs`（自動更新・進捗表示）を変更する場合の詳細（設計判断・未確定事項・落とし穴）は `docs/development/release-theme-reauth-notes.md` を参照。設定の既定値は Rust の `impl Default`（構造体レベル `#[serde(default)]`）を唯一の定義とし、TS の既定値と `contracts/default-settings.json` の契約テストで一致を保証している。**既定値を変更するときは Rust / TS / fixture の3箇所を同時に更新すること。**

### 設定ファイル（settings.json）の永続化

`src-tauri/src/commands/settings_file.rs` / `settings.rs` / `lib.rs` の `setup`、`src/store/useAppStore.ts` の保存まわりを変更する場合は `docs/development/settings-file-crash-safety-notes.md` を参照。`Store::save` を直接呼ばず `save_store_atomically` を使い、`setup` 冒頭の「復旧 → 自動保存無効のストア登録」の順序を崩さないこと。

### バックアップ／リストア

`src-tauri/src/commands/backup/`、`src/lib/backupRestore.ts`、`src/services/backup.ts`、`src/hooks/useBackupFlow.ts`、`src/components/AppSettingsPanel/BackupTab.tsx`、`MainActivity.kt` の `startBackupExport` / `startBackupImport` / `detectXUserId` を変更する場合は `docs/development/backup-restore-notes.md` を参照。出力は `BackupGlobalSettings` のホワイトリスト（`GlobalSettingsData` に項目を足すとキー集合テストが失敗し、取捨の判断を強制する）。復元は `apply_restore`（退避 → 置換 → `save_store_atomically` 1 回）で、復元中は `restoreInProgress` が自動保存・自動更新・アカウント追加／再認証を止める。手動テスト項目は `docs/development/backup-restore/integration-test.md`。

### フロントエンドの品質ツール（ESLint / Storybook / プロパティテスト）

- **ESLint**（flat config: `eslint.config.js`）はフロント `src` の TS/TSX のみを対象にする。`import-x/order` で import 順を統一し、`@/` は internal グループ。`npm run lint` / 自動整列は `npm run lint:fix`。
  - **import順**: 外部パッケージ → vitest/storybook → `@/`（internal）→ 相対パスの順。同グループ内はアルファベット昇順。グループ間の空行は入れない（`newlines-between: "never"`）。`npm run lint:fix` で自動整列できる。
  - 既存コード由来の a11y 等は段階解消のため **warn**。新規コードでは警告を残さないこと。
- **import エイリアス**: `@/*` → `src/*`（tsconfig / vite / vitest に設定）。新規コードは `@/` を使う。
- **Storybook**（`.storybook/`）はコンポーネントと**同じディレクトリ**に `<Name>.stories.tsx` をコロケーション配置する。バレル（`index.ts`）は作らない。play function は `npm run test:story` で chromium ブラウザ実行される。テーマは `document.documentElement` の `data-theme` で切り替える（`MobileTabBar.stories.tsx` 参照）。
- **プロパティテスト**: TS=`fast-check`（`<name>.property.test.ts`）/ Rust=`proptest`（`#[cfg(test)]` 内に `mod properties`）/ Kotlin=`kotest-property`。kotest は jvmTarget 1.8 互換の **5.x** を使う（6.x は JVM 11 のため上げない）。配置・書き方は `.claude/skills/property-based-testing` を参照。
- 開発フロー全体は `.claude/skills/feature-development-flow`（要求明確化→プラン→TDD実装→プロパティテスト→完了処理）を参照。

## ビルドコマンド早見表

```bash
npm run build:inject       # inject スクリプトのみビルド
npm run tauri:dev          # 開発起動（build:inject を前段実行）
npm run tauri:build        # リリースビルド
npm run tauri:build:debug  # デバッグビルド
npm run tauri:android:build # Android ビルド
npm run format             # フォーマット（TS/Rust/Kotlin。TS のみは format:ts）
npm run typecheck          # 型チェック（tsc --noEmit）
npm run lint               # ESLint（src の TS/TSX）/ npm run lint:fix で自動修正
npm run lint:rust          # Rust 静的解析（cargo clippy --all-targets -- -D warnings）
npm test                   # Vitest 単体テスト（unit プロジェクト）
npm run test:story         # Storybook play function（chromium ブラウザ実行）
npm run test:property      # fast-check プロパティテスト
npm run storybook          # Storybook 起動（目視確認）
cargo test --manifest-path src-tauri/Cargo.toml   # Rust テスト（事前に build:inject が必要）
cd src-tauri/gen/android && ./gradlew.bat :app:testUniversalDebugUnitTest   # Android 単体テスト
```
