---
description: "開発者ガイド（docs/developer-guide/ の HTML）をコードの変更に追従させる。定期メンテナンス、または関連コードを変更した PR の完了前に実行する"
user-invocable: true
argument-hint: "（省略可）対象ページ（index/react/rust/android/inject/howto）または比較元コミット。省略時は全ページを同期基準コミットから比較する"
---

# 開発者ガイドのメンテナンス (developer-guide-maintenance)

`docs/developer-guide/` は、プロジェクトを知らない人が全体像と各層（React / Rust / Android / inject）を理解し、手作業で機能追加できるようにするためのインタラクティブな HTML ドキュメント。コードの変更に追従しないとすぐ嘘になるため、このスキルで差分を検出して更新する。

## いつ実行するか

- 定期メンテナンス（目安: リリースごと、または月 1 回）
- 次の変更を含む作業の完了前（下の「ソース対応表」の範囲に変更があった場合）
  - Tauri コマンド / イベント / 設定項目 / capability の追加・削除
  - コンポーネント・フック・サービス・ストアの追加・削除・責務変更
  - `MainActivity.kt` / ブリッジ / `android_bridge.rs` の IF 変更
  - inject 機能スクリプトの追加・削除、設定フラグの配線変更
  - 開発フロー・ビルド・テストコマンドの変更（`CLAUDE.md`、`package.json`）

## 構成

| ファイル                                                        | 内容                                                               |
| --------------------------------------------------------------- | ------------------------------------------------------------------ |
| `docs/developer-guide/index.html` + `assets/data/index-page.js` | 全体像・層間 IF・主要フロー・ビルド/テスト・用語集                 |
| `docs/developer-guide/react.html` + `assets/data/react.js`      | フロントエンド（`src/`）                                           |
| `docs/developer-guide/rust.html` + `assets/data/rust.js`        | バックエンド（`src-tauri/src/`）                                   |
| `docs/developer-guide/android.html` + `assets/data/android.js`  | Android ネイティブ層（Kotlin）                                     |
| `docs/developer-guide/inject.html` + `assets/data/inject.js`    | X の画面に注入するスクリプト                                       |
| `docs/developer-guide/howto.html` + `assets/data/howto.js`      | 機能追加レシピ（チェックリスト）                                   |
| `docs/developer-guide/assets/common.css` / `common.js`          | 共通部品（構成図・フロー再生・一覧検索・チェックリスト・テーマ）   |
| `docs/developer-guide/assets/data/index.js`                     | データ初期化と**全ページ横断検索の見出し索引**（`MCX_DATA.index`） |
| `scripts/check-guide.mjs`（このスキル配下）                     | 整合性チェック                                                     |
| `scripts/build-index.mjs`（このスキル配下）                     | 各ページの h2/h3 から `MCX_DATA.index` を再生成                    |

部品の HTML / データ API は [reference.md](reference.md) を参照（新しい図・フロー・一覧を足すときに読む）。

## ソース対応表（どのコード変更がどのページに効くか）

| ページ  | 追従元（git diff の対象パス）                                                                                                                                  |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| index   | `README.md` `CLAUDE.md` `package.json` `src-tauri/src/lib.rs` `src-tauri/capabilities/` `docs/development/`                                                    |
| react   | `src/` （`src/locales/` の文言追加のみは対象外）                                                                                                               |
| rust    | `src-tauri/src/` （`src-tauri/src/inject/` を除く）`src-tauri/build.rs` `src-tauri/capabilities/` `src-tauri/Cargo.toml`                                       |
| android | `src-tauri/gen/android/app/src/` `src-tauri/gen/android/app/proguard-rules.pro` `src-tauri/gen/android/app/build.gradle.kts` `src-tauri/src/android_bridge.rs` |
| inject  | `src-tauri/src/inject/` `src-tauri/src/ipc_constants.rs` `src-tauri/capabilities/column-webview.json`                                                          |
| howto   | `CLAUDE.md` `.claude/skills/` `src-tauri/build.rs` `src-tauri/capabilities/` `contracts/` と、上記各ページの対象で「手順」が変わるもの                         |

## 手順

1. **同期基準を確認する**: 各ページの `<meta name="mcx-synced-commit" content="...">`（全ページ同値）を読む。引数で比較元コミットが指定されていればそれを使う。
2. **差分を把握する**:
   ```bash
   git diff --stat <synced>..HEAD -- src src-tauri/src src-tauri/build.rs src-tauri/capabilities src-tauri/gen/android/app/src CLAUDE.md package.json contracts .claude/skills
   git log --oneline <synced>..HEAD
   ```
   ソース対応表で影響ページを特定する。差分が無いページは触らない。
3. **機械チェックを実行する**:

   ```bash
   node .claude/skills/developer-guide-maintenance/scripts/check-guide.mjs
   ```

   - 存在しないパス、リンク切れ、未定義の図/フロー/一覧 id、`rust.commands` と `build.rs` のコマンド差分、検索索引の漏れが出る。出たものはすべて直す。

4. **内容を更新する**（コードベースの調査は CodeGraph を先に使う）:
   - 一覧（catalog）・構成図の詳細（details）・フロー（flows）は `assets/data/<page>.js` を更新する。本文の説明は HTML を更新する。
   - 追加・削除・責務変更されたモジュール、IF（コマンド・イベント・ブリッジ・設定キー）を反映する。手順が変わったら howto のチェックリストも直す。
   - 書き方の原則: 外部設計（責務・IF）と詳細設計（役割・状態・設計判断・落とし穴）を書き、**コードをなぞる逐行説明はしない**。実在を確認したパス・名前だけ書く。詳細が `docs/development/*.md` にあるものは要約してリンクする。日本語。
   - 見出しを追加・変更・削除したら索引を再生成する（`index.js` の索引ブロックは手で編集しない）:
     ```bash
     node .claude/skills/developer-guide-maintenance/scripts/build-index.mjs
     ```
   - 本文中の `要確認` バッジ（`grep -rn "要確認" docs/developer-guide`）は、コードで確かめられたら外す。
5. **同期基準を更新する**: 全ページの `mcx-synced-commit` を、確認した HEAD の短縮ハッシュ（`git rev-parse --short HEAD`）に揃える。
6. **検証する**:
   ```bash
   node .claude/skills/developer-guide-maintenance/scripts/check-guide.mjs
   npx prettier --write docs/developer-guide
   npx prettier --check .
   ```
   変更したページはブラウザ（file:// で直接開ける）で表示し、コンソールエラーが無いこと、変更した図・フロー・一覧が動くことを確認する。
7. **コミットする**: `docs: 開発者ガイドを <短縮ハッシュ> に追従` のように、追従範囲が分かるメッセージで。

## 注意

- 外部 CDN・Web フォント・ES module・`fetch()` は使わない（file:// で開くため）。データは `assets/data/*.js` のクラシックスクリプトで渡す。
- `assets/common.*` を変更したら全ページの表示を確認する（全ページが依存する）。
- ガイドは VitePress（`docs/guide/` のみ公開）の対象外。公開ユーザーガイドとは別物。
- 調査・執筆をサブエージェントに委譲する場合は `CLAUDE.md` のモデル選択規則に従う（内容の調査・執筆は sonnet、チェックスクリプトの実行や一覧収集だけなら haiku）。ページ単位で並行に委譲してよいが、`assets/common.*` と `index.js` を複数が同時に編集しないこと。
