#!/usr/bin/env bash
# PreToolUse (Bash) で `git push` を検知したら、push 前に CI の軽量チェック
# （prettier / lint / typecheck / cargo fmt）を実行し、失敗したら push をブロックする。
# CI の frontend / rust ジョブが落ちる典型原因（整形漏れ・型・lint）を手元で先に潰すのが目的。
# テスト全体は時間がかかるため含めない（必要なら手動で npm test を実行すること）。
# 変更ファイルは origin/develop との差分に限定して高速化する。

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)
[ -z "$cmd" ] && exit 0

# `git push` を含むコマンドだけ対象（git -C x push 等も拾う）
printf '%s' "$cmd" | grep -Eq '(^|[;&|[:space:]])git([[:space:]]+-[^[:space:]]+([[:space:]]+[^[:space:]]+)?)*[[:space:]]+push([[:space:]]|$)' || exit 0

cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || cd "$(git rev-parse --show-toplevel)" || exit 0

base=$(git merge-base HEAD origin/develop 2>/dev/null)
if [ -n "$base" ]; then
  changed=$(git diff --name-only --diff-filter=ACMR "$base"...HEAD)
else
  changed=$(git ls-files)
fi

fail=0
report() { printf '%s\n' "$1" >&2; fail=1; }

prettier_files=$(printf '%s\n' "$changed" | grep -E '\.(ts|tsx|js|jsx|json|md|scss|css|yml|yaml)$' | grep -v '^\.claude/worktrees/')
if [ -n "$prettier_files" ]; then
  out=$(printf '%s\n' "$prettier_files" | xargs npx prettier --check 2>&1) \
    || report "[pre-push] prettier --check が失敗しました。npx prettier --write で整形してください:
$out"
fi

if printf '%s\n' "$changed" | grep -Eq '\.(ts|tsx)$'; then
  out=$(npm run -s typecheck 2>&1) || report "[pre-push] npm run typecheck が失敗しました:
$(printf '%s' "$out" | tail -30)"
  out=$(npm run -s lint 2>&1) || report "[pre-push] npm run lint が失敗しました:
$(printf '%s' "$out" | tail -30)"
fi

if printf '%s\n' "$changed" | grep -Eq '\.rs$'; then
  out=$(cargo fmt --manifest-path src-tauri/Cargo.toml --check 2>&1) \
    || report "[pre-push] cargo fmt --check が失敗しました。cargo fmt で整形してください:
$(printf '%s' "$out" | tail -30)"
fi

[ "$fail" -eq 0 ] && exit 0
echo "[pre-push] 上記を修正してコミットしてから push し直してください。" >&2
exit 2
