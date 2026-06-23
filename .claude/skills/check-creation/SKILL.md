---
description: "品質チェック（format, typecheck, lint, test, story, property, build）をまとめて実行する"
user-invocable: true
---

# 品質チェック (check-creation)

アプリ開発フローのフェーズ5（完了処理）。変更内容に対して品質チェックを実行し、オールグリーンを確認する。

## 実行手順

上から順に実行し、エラー・警告が出たら次へ進む前に修正する。

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

### 7. ビルド確認（最終）

format・型・Lint・テストがすべて通った後、ビルドが成功することを確認する。

```bash
npm run build
```

- inject スクリプトを変更した場合は `npm run build:inject` も確認する（`build` の前段で実行される）。
- Rust / Android 側を変更した場合は、該当プラットフォームのビルド（`npm run tauri:build` / `npm run tauri:android:build`）も確認する。Android はリリースビルドで ProGuard keep ルールの不整合が初めて顕在化する点に注意（CLAUDE.md参照）。

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
