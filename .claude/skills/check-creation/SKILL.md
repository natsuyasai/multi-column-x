---
description: "品質チェック（format, prettier --check, typecheck, lint, test, story, property, build, docs:build）をまとめて実行する"
user-invocable: true
argument-hint: "（省略可）絞り込みたいチェック対象。省略時は下記手順を上から順にすべて実行する"
---

# 品質チェック (check-creation)

アプリ開発フローのフェーズ5（完了処理）。変更内容に対して品質チェックを実行し、オールグリーンを確認する。

## 実行手順

`$ARGUMENTS` で対象を絞り込む指示があればその項目のみ実行し、指定がなければ上から順にすべて実行する。エラー・警告が出たら次へ進む前に修正する。

```bash
# 1. フォーマット（TS/Rust/Kotlin をまとめて整形）
npm run format
#    TS のみで十分なときは: npm run format:ts

# 2. 型チェック
npm run typecheck

# 3. Lint（フロント src の TS/TSX）。自動修正可能なものは lint:fix で
npm run lint
#    自動整列: npm run lint:fix

# 4. 単体テスト（vitest / jsdom）
npm test

# 5. Story のインタラクションテスト（chromium ブラウザ実行）
#    Story を追加・変更した場合は必須
npm run test:story

# 6. プロパティテスト（存在する場合）
npm run test:property
```

### 6.5 CI と同じ整形チェック（必須）

```bash
npx prettier --check .
```

- CI（`.github/workflows/ci.yml`）と同じコマンド。**docs・md・CLAUDE.md・SKILL.md だけの変更でも必ず実行する。**
- PostToolUse hook が整形するのは Edit/Write したファイルだけで、`git mv` で生じた変更や hook が効かない経路は漏れる（整形漏れで CI が落ちた実績あり）。
- 失敗したら `npx prettier --write <対象>` で直す。

### 6.6 ユーザーガイドのビルド（`docs/guide/` を変更した場合は必須）

```bash
npm run docs:build
```

- VitePress のビルド。リンク切れ検出を兼ねる（CI でも実行される）。

### 7. ビルド確認（最終）

format・型・Lint・テストがすべて通った後、ビルドが成功することを確認する。

```bash
npm run build
```

- inject スクリプトを変更した場合は `npm run build:inject` も確認する（`build` の前段で実行される）。
- Rust / Android 側を変更した場合は、該当プラットフォームのビルド（`npm run tauri:build` / `npm run tauri:android:build`）も確認する。Android はリリースビルドで ProGuard keep ルールの不整合が初めて顕在化する点に注意（CLAUDE.md参照）。

### Rust / Kotlin を変更した場合（該当する場合のみ）

- **`src-tauri/` を変更した場合**:

  ```bash
  npm run build:inject   # 先に必須（下記）
  npm run lint:rust
  cargo test --manifest-path src-tauri/Cargo.toml
  ```

  - `lint:rust` は `cargo clippy --all-targets -- -D warnings` で、テスト関数名の ASCII 大文字（`non_snake_case`）も検出する。
  - Rust 側は `include_str!` で gitignore 済みのビルド済み inject `.js` を埋め込むため、**`npm run build:inject` を実行していない状態（新規 worktree 等）では clippy / cargo test がコンパイルエラーになる**。
  - CI の `rust` ジョブは ubuntu のみで実行される。`#[cfg(windows)]` / `#[cfg(target_os = "macos")]` 等のコードパスを変更した場合は、ローカルでの clippy / cargo test が唯一の検証手段になる。
  - コマンドを追加・削除した場合は `acl_contract.rs` の契約テストが `cargo test` に含まれる（build.rs の `AppManifest` と capability の更新漏れを検出する）。

- **Kotlin/Android を変更した場合**:

  ```bash
  cd src-tauri/gen/android && ./gradlew.bat :app:testUniversalDebugUnitTest
  ```

  app モジュールは universal フレーバー付きのため `testDebugUnitTest` では app のテストが実行されない（`docs/development/android-notes.md` 参照）。

## エラー修正の優先順位

1. **型エラー (typecheck)**: 最優先。型定義の不整合はビルドエラーに直結する
2. **Lintエラー (lint)**: 次に修正。import順は `npm run lint:fix` で自動整列できる
3. **テスト失敗 (test / test:story / test:property)**: テストコードまたは実装コードを修正
4. **フォーマット (format)**: Prettier / cargo fmt / ktlint で自動修正

## 禁止事項

- `eslint-disable` コメントは可能な限り使用しない
- やむを得ず使用する場合は、必ず理由を明記したコメントを付与する（例: `// eslint-disable-next-line jsx-a11y/no-static-element-interactions -- コンテキストメニューのトリガーで onContextMenu が必須`）
- `@ts-ignore` / `@ts-expect-error` も同様に最小限にする

## 完了条件

- 上記のうち変更に関係するチェックがすべてエラーなしで通過すること
  - 既存コードに由来する a11y 等の警告は許容するが、**今回の変更で新たに警告を増やさない**こと
- すべての対応が完了した後、**再度チェックを実行**してエラーがないことを最終確認すること
