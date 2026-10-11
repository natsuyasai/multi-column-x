#!/usr/bin/env bash
# PreToolUse (Edit / Write / NotebookEdit) hook:
# 変更対象ファイルがファイル/フォルダ固有の設計知見を持つ場合、
# docs/development 配下の該当開発ノートを additionalContext として注入する。
# 1ファイルが複数ノートに関わる場合（例: lib.rs）はすべて連結して注入する。

input=$(cat)

file_path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
[ -z "$file_path" ] && exit 0

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
default_root="$(cd "$script_dir/../.." && pwd)"
cwd=$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null)
project_root="${cwd:-$default_root}"

# Windows パス（バックスラッシュ区切り）を正規化
norm="${file_path//\\//}"

D="docs/development"
notes=()
case "$norm" in
  *"src-tauri/src/inject/_src/"*)                 notes=("$D/inject-ipc-shortcuts-notes.md") ;;
  *"/src/App.tsx")                                notes=("$D/column-layout-notes.md") ;;
  *"/src/lib/gridLayout.ts")                      notes=("$D/column-layout-notes.md") ;;
  *"/src/services/columnWebview.ts")              notes=("$D/column-layout-notes.md") ;;
  *"/src-tauri/src/commands/webview/column.rs")   notes=("$D/linux-column-spec.md" "$D/linux-webview-notes.md") ;;
  *"/src/lib/rafThrottle.ts")                     notes=("$D/linux-webview-notes.md") ;;
  *"/src-tauri/src/commands/webview/external_link.rs" | \
  *"/src-tauri/src/commands/webview/popup.rs" | \
  *"/src-tauri/src/commands/webview/compose.rs")  notes=("$D/external-link-new-window-notes.md") ;;
  *"/src-tauri/src/lib.rs")                       notes=("$D/compose-popup-topbar-notes.md" "$D/settings-file-crash-safety-notes.md" "$D/external-link-new-window-notes.md") ;;
  *"/src-tauri/src/commands/settings_file.rs" | \
  *"/src-tauri/src/commands/settings.rs" | \
  *"/src/store/useAppStore.ts")                   notes=("$D/settings-file-crash-safety-notes.md") ;;
  *"/src/components/TopBar/"*)                    notes=("$D/topbar-column-reorder-notes.md" "$D/compose-popup-topbar-notes.md") ;;
  *"/src-tauri/gen/android/app/proguard-rules.pro" | \
  *"/MainActivity.kt")                            notes=("$D/android-notes.md") ;;
  *"/src/constants/apiRateLimitLabels.ts" | \
  *"/src/components/ApiRateLimitIndicator/"* | \
  *"/src/lib/apiRateLimit.ts")                    notes=("$D/api-rate-limit-operations-notes.md") ;;
  *"/src/lib/theme.ts" | \
  *"/src/hooks/useTheme.ts" | \
  *"/src/lib/reauthIdentity.ts" | \
  *"/src-tauri/src/commands/account.rs" | \
  *"/src/services/updater.ts" | \
  *"/src/hooks/useAppUpdater.ts" | \
  *"/src-tauri/src/commands/update.rs")           notes=("$D/release-theme-reauth-notes.md") ;;
esac

[ ${#notes[@]} -eq 0 ] && exit 0

context_text=""
for note in "${notes[@]}"; do
  note_path="$project_root/$note"
  [ -f "$note_path" ] || continue
  context_text+="[自動注入: $note]
$(cat "$note_path")

"
done

[ -z "$context_text" ] && exit 0

# 本文は stdin で渡す（--arg だと Windows のコマンドライン長上限を超えて失敗する）
printf '%s' "$context_text" | jq -Rs '{hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:.}}'
