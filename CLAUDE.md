# CLAUDE.md

## プロジェクト概要

Multi Column X — TweetDeck スタイルの Twitter/X クライアント（Tauri v2 製）。  
React 19 + TypeScript フロントエンドと Rust バックエンドで構成。  
デスクトップ（Windows/Mac/Linux）と Android に対応。

詳細は `README.md` を参照。

## .steering ディレクトリ（AIエージェント向けルールセット）

### 利用ガイドライン

必ず以下のワークフローの内容に従って作業を進めること

- 各フェーズ実行時は `./steering/details/aws-aidlc-rule-details/` 配下の該当ルールファイルを読み込む
- 共通ルール（`./steering/details/common/`）はワークフロー開始時に必ず読み込む
- セキュリティルールは全フェーズで必須の横断的制約として適用する（未充足はブロッキング）

セッション中に生成したすべての成果物は `aidlc-docs/` に保存します。

## 実装ガイドライン

- 必ず日本語で回答してください。
- テストケース名は日本語で作成してください。
- Robert C. Martinが提唱する原則に従ってコードを作成してください。
- TDDおよびテスト駆動開発で実装する際は、すべてt-wadaの推奨する進め方に従ってください。
- リファクタリングはMartin Fowlerが推奨する進め方に従ってください。
- セキュリティルールに従うこと。
- エラーや警告が発生する場合は、必ず修正してください。
- SKILLとして定義が必要なものが出てきた場合は、skilsフォルダに専用のskillとして保存してください
- javascriptはモダンな記載をすること
  - varは使用しない

## 作業手順

- 新規ブランチを作成するべきかまず確認すること
- 必ず1度には1つのことだけを行うこと
- 作業毎にコミットすること
- 必ずテストを作成すること
- 対応完了時にはフォーマッターとテストを実行してオールグリーンとなること
- 設計内容や実装内容に関して不明慮な点があれば必ず確認すること

## アーキテクチャ上の重要な制約

### desktop / mobile の条件コンパイル

Rust コードは `#[cfg(desktop)]` / `#[cfg(mobile)]` で分岐する。同一コマンド名でも実装が異なる場合があるため、変更時は両方の実装を確認すること。

### inject スクリプトのビルド

WebView に注入する JS は `src-tauri/src/inject/_src/` に TypeScript で書き、Vite でバンドルして `src-tauri/src/inject/*.js` に出力する。`_src` を変更した後は `npm run build:inject` が必要。ビルド済み `.js` は gitignore されており直接編集禁止。`npm run build:inject` で生成する。

### カラム WebView と z-index

Tauri v2 の子 WebView は OS ネイティブウィンドウのため、CSS `z-index` が機能しない。ダイアログ表示中は `hideColumnWebviews()` で全 WebView を画面外に退避し、閉じると `recalculateAllBounds()` で復元する。この挙動は `App.tsx` の `dialogOpen` effect で制御している。

### serde のフィールド命名

Tauri v2 は JS→Rust のケース変換を行わない。JS 側 camelCase フィールドには `#[serde(rename = "...")]` が必要。

### グリッドレイアウト

カラムは `gridRow` / `gridCol` でマトリクス配置する。座標計算は `src/lib/gridLayout.ts` の `calculateGridBounds`（純粋関数）が担当し、各カラムの絶対座標を Rust の `create_column_webview` / `resize_column_webview` に渡す。WebView への IPC 呼び出しは `src/services/columnWebview.ts` に集約されている。

### アカウントログイン検出（desktop vs mobile）

- **desktop**: tokio タスクが URL を 500ms ポーリング → `account-login-complete` イベントを emit
- **mobile**: `open_add_account_window` が tokio でセンチネルファイルをポーリングしてブロック。AddAccount.kt が `add_account_login_complete` ファイルを書き込んで通知する。

### Android の単体テスト実行

app モジュールの variant は universal フレーバー付きのため、`./gradlew.bat testDebugUnitTest` では **app のテストは実行されない**。`cd src-tauri/gen/android && ./gradlew.bat :app:testUniversalDebugUnitTest` を使うこと。

### Android ProGuard keep ルールの同期

`android_bridge.rs` が `env.call_method()` で文字列指定して呼び出す `MainActivity` のメソッドは、リリースビルドで R8 に難読化されると `NoSuchMethodException` が発生して WebView が作成されない。

**`MainActivity.kt` のメソッドシグネチャを変更したら、必ず `src-tauri/gen/android/app/proguard-rules.pro` も同時に更新すること。**

対象操作と対応ルール：

- メソッドを追加 → `-keepclassmembers` に同じシグネチャのエントリを追加
- 引数を追加・削除 → keep ルールの型リストを新シグネチャに合わせて更新
- メソッドを削除 → keep ルールからそのエントリを削除

デバッグビルドでは R8 が無効なため症状が出ず、リリースビルドで初めてクラッシュする。変更後はリリースビルドで動作確認すること。

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
npm test                   # Vitest 単体テスト（unit プロジェクト）
npm run test:story         # Storybook play function（chromium ブラウザ実行）
npm run test:property      # fast-check プロパティテスト
npm run storybook          # Storybook 起動（目視確認）
```
