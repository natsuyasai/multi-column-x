# CLAUDE.md

## プロジェクト概要

Multi Column X — TweetDeck スタイルの Twitter/X クライアント（Tauri v2 製）。  
React 19 + TypeScript フロントエンドと Rust バックエンドで構成。  
デスクトップ（Windows/Mac/Linux）と Android に対応。

詳細は `README.md` を参照。

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
- TDDおよびテスト駆動開発で実装する際は、すべてt-wadaの推奨する進め方に従ってください。
- リファクタリングはMartin Fowlerが推奨する進め方に従ってください。
- セキュリティルールに従うこと。
- エラーや警告が発生する場合は、必ず修正してください。
- SKILLとして定義が必要なものが出てきた場合は、skilsフォルダに専用のskillとして保存してください

## サブエージェント運用（実装委譲の基本ルール）

- 実装作業（フェーズ3）は必ずサブエージェント（`model: sonnet`）に委譲し、メインエージェントは統括（レビュー・進行管理・コミット・品質チェック実行・ドキュメント整備）に徹する。メインが自分で実装を書かない
- `Agent` 委譲の前に「メイン=<モデル名> / サブエージェント=sonnet」を必ずテキスト出力する
- Sonnet では対応が難しい作業が出た場合は、**ユーザーの承認を得てから**メインが対応する
- 実装プラン（フェーズ2の `plan.md`）は Sonnet が単独で実行できる詳細度で書く（自己完結・現状コードの引用・変更後のコード断片・正確なファイルパス・落とし穴チェックリスト）

## 作業手順

- ブランチ運用の基本フロー: developを最新化 → developから作業ブランチを作成 → 作業完了後にpush → developに対するPRを作成
  - 新規ブランチを作成するべきかは、着手前にまずユーザーへ確認すること
- 必ず1度には1つのことだけを行うこと
- 作業毎にコミットすること
- 必ずテストを作成すること
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

### serde のフィールド命名

Tauri v2 は JS→Rust のケース変換を行わない。JS 側 camelCase フィールドには `#[serde(rename = "...")]` が必要。

### グリッドレイアウト

カラムは `gridRow` / `gridCol` でマトリクス配置する。`src/lib/gridLayout.ts` / `src/services/columnWebview.ts` を変更する場合の詳細は `docs/development/column-layout-notes.md` を参照。

### Linux カラム WebView のクリッピング・WebProcess クラッシュ対策（デグレ注意）

Linux ではカラムが独立 `WebviewWindow`（親クリップが効かない）ため、横スクロール時のはみ出し表示を `linux_column_layout`（`src-tauri/src/commands/webview/column.rs`）で制御する。正式仕様は **README.md「Linux カラム WebView の配置・クリッピング仕様」** に明記。実装ファイル・落とし穴・テスト方針の詳細は `docs/development/linux-webview-notes.md` を参照。**過去にインライン実装・テスト無しで複数回デグレードしている領域のため、変更する場合は必ず参照ノートのテスト方針に従うこと。**

### Tauri ウィンドウの close() と destroy()（常駐ウィンドウの破棄）

`WebviewWindow::close()` は `prevent_close()` + `hide()` で閉じる操作を握っている常駐ウィンドウ（例: 常駐コンポーズ `compose-`）には効かない。`src-tauri/src/lib.rs` を変更する場合の詳細は `docs/development/compose-popup-sidebar-notes.md` を参照。`prevent_close` を使う常駐ウィンドウを新設したら、メインウィンドウの `CloseRequested`（`lib.rs`）に明示 `destroy()` を必ず追加すること。

### アカウントログイン検出（desktop vs mobile）

- **desktop**: tokio タスクが URL を 500ms ポーリング → `account-login-complete` イベントを emit
- **mobile**: `open_add_account_window` が tokio でセンチネルファイルをポーリングしてブロック。AddAccount.kt が `add_account_login_complete` ファイルを書き込んで通知する。

### Android の単体テスト実行・ProGuard keep ルールの同期

`src-tauri/gen/android/**` を変更する場合の詳細（単体テストコマンド、`MainActivity.kt` とのシグネチャ同期ルール）は `docs/development/android-notes.md` を参照。**`MainActivity.kt` のメソッドシグネチャを変更したら、必ず `proguard-rules.pro` も同時に更新すること**（リリースビルドでしか症状が出ないため注意）。

### フロントエンドの品質ツール（ESLint / Storybook / プロパティテスト）

- **ESLint**（flat config: `eslint.config.js`）はフロント `src` の TS/TSX のみを対象にする。`import-x/order` で import 順を統一し、`@/` は internal グループ。`npm run lint` / 自動整列は `npm run lint:fix`。
  - 既存コード由来の a11y 等は段階解消のため **warn**。新規コードでは警告を残さないこと。
- **import エイリアス**: `@/*` → `src/*`（tsconfig / vite / vitest に設定）。新規コードは `@/` を使う。
- **Storybook**（`.storybook/`）はコンポーネントと**同じディレクトリ**に `<Name>.stories.tsx` をコロケーション配置する。バレル（`index.ts`）は作らない。play function は `npm run test:story` で chromium ブラウザ実行される。テーマは `document.documentElement` の `data-theme` で切り替える（`MobileTabBar.stories.tsx` 参照）。
- **プロパティテスト**: フロントは `fast-check`（`<name>.property.test.ts`、`npm run test:property`）。Rust は `proptest`（dev-dependency、`#[cfg(test)]` 内に `mod properties`、`cargo test`）。Kotlin は `kotest-property`（JUnit4 の `@Test` から `runBlocking { forAll {} }`、`:app:testUniversalDebugUnitTest`）。詳細は `.claude/skills/property-based-testing` を参照。
  - kotest は jvmTarget 1.8 互換の **5.x** を使う（6.x は JVM 11 のため上げない）。
- 開発フロー全体は `.claude/skills/feature-development-flow`（要求明確化→プラン→TDD実装→プロパティテスト→完了処理）を参照。

## ビルドコマンド早見表

```bash
npm run build:inject       # inject スクリプトのみビルド
npm run tauri:dev          # 開発起動（build:inject を前段実行）
npm run tauri:build        # リリースビルド
npm run tauri:build:debug  # デバッグビルド
npm run tauri:android:build # Android ビルド
npm run typecheck          # 型チェック（tsc --noEmit）
npm run lint               # ESLint（src の TS/TSX）/ npm run lint:fix で自動修正
npm run lint:rust          # Rust 静的解析（cargo clippy --all-targets -- -D warnings）
npm test                   # Vitest 単体テスト（unit プロジェクト）
npm run test:story         # Storybook play function（chromium ブラウザ実行）
npm run test:property      # fast-check プロパティテスト
npm run storybook          # Storybook 起動（目視確認）
```
