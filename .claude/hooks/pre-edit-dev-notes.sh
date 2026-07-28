#!/usr/bin/env bash
# PreToolUse (Edit / Write / NotebookEdit) hook:
# 変更対象ファイルがファイル/フォルダ固有の設計知見を持つ場合、
# docs/development 配下の該当開発ノートを additionalContext として注入する。

input=$(cat)

file_path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
[ -z "$file_path" ] && exit 0

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
default_root="$(cd "$script_dir/../.." && pwd)"
cwd=$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null)
project_root="${cwd:-$default_root}"

# Windows パス（バックスラッシュ区切り）を正規化
norm="${file_path//\\//}"

note=""
case "$norm" in
  *"src-tauri/src/inject/_src/"*)                 note="docs/development/inject-ipc-shortcuts-notes.md" ;;
  *"/src/App.tsx")                                note="docs/development/column-layout-notes.md" ;;
  *"/src/lib/gridLayout.ts")                       note="docs/development/column-layout-notes.md" ;;
  *"/src/services/columnWebview.ts")               note="docs/development/column-layout-notes.md" ;;
  *"/src-tauri/src/commands/webview/column.rs")    note="docs/development/linux-webview-notes.md" ;;
  *"/src/lib/rafThrottle.ts")                      note="docs/development/linux-webview-notes.md" ;;
  *"/src-tauri/src/lib.rs")                        note="docs/development/compose-popup-sidebar-notes.md" ;;
  *"/src-tauri/gen/android/app/proguard-rules.pro") note="docs/development/android-notes.md" ;;
  *"/MainActivity.kt")                             note="docs/development/android-notes.md" ;;
esac

[ -z "$note" ] && exit 0

note_path="$project_root/$note"
[ -f "$note_path" ] || exit 0

content=$(cat "$note_path")
context_text="[自動注入: $note]
$content"

jq -n --arg ctx "$context_text" '{hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:$ctx}}'
