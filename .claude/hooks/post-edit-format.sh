#!/usr/bin/env bash
# PostToolUse (Edit / Write) 後に、変更されたファイルだけをフォーマットする。
# npm run format（TS/Rust/Kotlin全体）を毎回実行すると、編集のたびに
# リポジトリ全体を走査してしまい遅いため、対象ファイルの種類に応じて
# 個別フォーマッタのみを実行する。

input=$(cat)

file_path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
[ -z "$file_path" ] && exit 0

case "$file_path" in
  *.rs)
    cargo fmt --manifest-path src-tauri/Cargo.toml -- "$file_path" >/dev/null 2>&1
    ;;
  *.kt|*.kts)
    # Kotlin は ktlintFormat が単一ファイル指定に対応していないため、
    # Android モジュール全体を対象に実行する。
    npm run format:kotlin >/dev/null 2>&1
    ;;
  *.ts|*.tsx|*.js|*.jsx|*.json|*.md|*.scss|*.css|*.yml|*.yaml)
    npx prettier --write "$file_path" >/dev/null 2>&1
    ;;
esac

exit 0
