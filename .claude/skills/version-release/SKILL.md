---
description: "develop最新化からbump-version実行・PRマージ・Releaseアクション実行までのバージョン更新一連作業を行う"
user-invocable: true
argument-hint: "（省略可）バグfixのみか機能追加を含むか。省略時はユーザーに確認する"
---

# バージョンリリース (version-release)

develop ブランチのバージョンを上げて main へリリースするまでの一連作業を、順番どおりに最後まで実行する。
途中で打ち切って「次は何をしますか」と尋ねない（[[skill-order-discipline]]）。ただし各フェーズの確認ゲートは必ず待つ。

## 前提

- `gh` CLI が認証済みであること
- `scripts/bump-version.sh` は Git Bash 等 sh が実行できる環境が必要（Bash ツールは Git Bash 上で動くのでそのまま使える）
- リモートは `origin`、リポジトリは `natsuyasai/multi-column-x`

## 手順

### Phase 1: develop を最新化する

```bash
git status                    # 未コミットの変更がないか確認。あれば先にユーザーに確認
git checkout develop
git pull origin develop
```

- 作業ツリーに未コミット変更がある場合、ここで止めてユーザーに確認する（stash/commit の指示を仰ぐ）

### Phase 2: 上げるバージョンを決定する

1. 現在のバージョンを確認する: `jq -r .version package.json`
2. 今回のリリースが「機能追加」か「バグ fix のみ」かを判定する
   - `$ARGUMENTS` に指定があればそれに従う
   - 指定がなければ `git log <前回タグ>..develop --oneline` 等で変更内容を確認し、判断がつかなければ **`AskUserQuestion` で確認する**（機能追加 → minor を+1・末尾は0 / バグ fix のみ → patch(末尾) を+1）
3. 新バージョン番号を確定し、**ユーザーに新バージョン番号を提示して承認を得てから** Phase 3 に進む（確認ゲート。飛ばさない）

### Phase 3: bump-version.sh を実行する

```bash
./scripts/bump-version.sh <new-version>
```

- 対象ファイル: `package.json` / `src-tauri/tauri.conf.json` / `src-tauri/Cargo.toml` / `src-tauri/Cargo.lock` / `src-tauri/gen/android/app/tauri.properties`
- 実行後 `git status` / `git diff` で意図した箇所のみ変更されていることを確認する

### Phase 4: develop に直接コミットする

```bash
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/gen/android/app/tauri.properties
git commit -m "v<new-version>"
git push origin develop
```

- コミットメッセージは `v<new-version>` の1行のみ（過去実績: `v0.1.16` 等）
- develop は保護ブランチではないため直接 push でよい

### Phase 5: develop → main の PR を作成する

```bash
gh pr create --base main --head develop --title "v<new-version>" --body "v<new-version> リリース"
```

- PR タイトルは `v<new-version>`（過去の慣例に合わせる）

### Phase 6: CI 確認 → 承認 → マージ

```bash
gh pr checks <PR番号> --watch
```

- 全チェックが成功するまで待つ。失敗した場合はここで止まり、原因を調査してユーザーに報告する（自己判断で修正コミットを積まない。対応方針をユーザーに確認する）
- 全て成功したら承認してマージする:

```bash
gh pr review <PR番号> --approve
gh pr merge <PR番号> --merge
```

- `-d`/`--delete-branch` は付けない（develop ブランチを残す要件のため）
- `gh pr review --approve` は PR 作成者自身のレビューだと GitHub 側で拒否される場合がある（"Can not approve your own pull request"）。その場合はエラーを報告した上でスキップし、`gh pr merge --merge` のみ実行してよい（main は保護ブランチではないため承認必須ではない）

### Phase 7: Release アクションを実行する

マージ後の main ブランチを指定して Release ワークフローを手動実行する。

```bash
git checkout main
git pull origin main
gh workflow run release.yml --ref main
```

- `release.yml` は `workflow_dispatch` に対応しており、`tauri.conf.json` のバージョンからタグ (`v<version>`) を自動作成してリリースを開始する
- 実行後、`gh run list --workflow=release.yml --limit 1` で起動を確認する
- ビルド完了まで待つ必要はない（デスクトップ/Android のビルドには時間がかかる）。起動確認ができたら完了報告してよい

## 完了条件

- develop / main 双方のバージョン表記ファイルが新バージョンで一致している
- develop → main の PR がマージ済み（develop ブランチは削除されていない）
- `release.yml` が main を対象に起動している

## 禁止事項

- Phase 2 のバージョン確定をユーザー承認なしに進めること
- CI が red のまま承認・マージすること
- `gh pr merge` に `-d`/`--delete-branch` を付けて develop を削除すること
- bump-version.sh 以外の方法（手動 sed 等）でバージョンファイルを書き換えること
