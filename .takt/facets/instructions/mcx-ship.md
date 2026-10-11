変更をコミットし、push して、develop 向けの PR を作成する。

## 手順

1. `git status` で作業ブランチを確認する。develop / main 上で直接コミットしない（その場合は中止）。
2. 未コミットの変更があれば、日本語のコミットメッセージでコミットする（末尾に Co-Authored-By トレーラーを付ける）。`docs/specs/*.feature` はコミットしない。
3. `git fetch origin develop` の後、`git merge-base --is-ancestor origin/develop HEAD` で最新の develop から派生していることを確認する。満たさなければ中止し、理由を書く。
4. `git push -u origin HEAD` で push する。
5. 同じブランチの PR が無いことを `gh pr list --head <branch>` で確認する。あればそれを使い、新規作成しない。
6. `.github/pull_request_template.md` の書式（概要・リリースノート・確認事項）で PR 本文を作り、`gh pr create --base develop` で作成する。
   - タイトルの接頭辞は `feat:` / `fix:` / その他から選ぶ。
   - 確認事項は実際に行った内容に沿ってチェックする。行っていない項目は付けない。
   - 動作確認の結果（OK / 対象外 / 未確認とその理由）を確認事項の下に追記する。
7. 作成した PR の URL を出力する。

## 禁止事項

- `--force` push、`--no-verify` を使わない。
- PR のベースを develop 以外にしない。
