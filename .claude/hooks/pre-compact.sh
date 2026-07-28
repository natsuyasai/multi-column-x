#!/usr/bin/env bash
# PreCompact hook: セッション引き継ぎファイルを生成する

set -u

stdin_content=$(cat)

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
default_root="$(cd "$script_dir/../.." && pwd)"

cwd=$(printf '%s' "$stdin_content" | jq -r '.cwd // empty' 2>/dev/null)
trigger=$(printf '%s' "$stdin_content" | jq -r '.trigger // "unknown"' 2>/dev/null)
session_id=$(printf '%s' "$stdin_content" | jq -r '.session_id // "unknown"' 2>/dev/null)
transcript_path=$(printf '%s' "$stdin_content" | jq -r '.transcript_path // empty' 2>/dev/null)

project_root="${cwd:-$default_root}"

# --- 出力先の準備 ---
handoff_dir="$project_root/.claude/handoff"
mkdir -p "$handoff_dir"

timestamp=$(date +%Y-%m-%d-%H-%M)
handoff_file="$handoff_dir/session-$timestamp.md"

# --- Git 状態を収集 ---
git_branch=$(git -C "$project_root" branch --show-current 2>&1)
git_status=$(git -C "$project_root" status --short 2>&1)
git_log=$(git -C "$project_root" log --oneline -15 2>&1)

# --- transcript から直近40メッセージを抽出 ---
recent_messages=""
if [ -n "$transcript_path" ] && [ -f "$transcript_path" ]; then
  recent_messages=$(
    jq -R -c 'try fromjson catch empty' "$transcript_path" 2>/dev/null \
      | jq -c 'select(.role != null)' 2>/dev/null \
      | jq -s '.[-40:]' 2>/dev/null \
      | jq -r '
          .[] |
          (if (.content|type)=="string" then .content
           elif (.content|type)=="array" then ([.content[]? | select(.type=="text") | .text] | first // "")
           else "" end) as $text |
          select($text != "") |
          (if ($text|length) > 600 then ($text[0:600] + " …(省略)") else $text end) as $truncated |
          "**[\(.role)]**: \($truncated)"
        ' 2>/dev/null
  )
fi
[ -z "$recent_messages" ] && recent_messages="（transcript が見つからないか、メッセージなし）"

# --- memory インデックスを読み取る ---
memory_content=""
memory_index="$project_root/memory/MEMORY.md"
[ -f "$memory_index" ] && memory_content=$(cat "$memory_index")

# --- 引き継ぎドキュメントを生成 ---
cat > "$handoff_file" <<EOF
# セッション引き継ぎファイル

**生成日時**: $(date '+%Y-%m-%d %H:%M:%S')
**セッションID**: $session_id
**圧縮トリガー**: $trigger
**プロジェクトルート**: $project_root

---

## Git 状態

### 現在のブランチ
\`\`\`
$git_branch
\`\`\`

### 変更ファイル (git status --short)
\`\`\`
$git_status
\`\`\`

### 直近 15 コミット
\`\`\`
$git_log
\`\`\`

---

## メモリインデックス (MEMORY.md)

$memory_content

---

## 直近の会話コンテキスト

$recent_messages

---

*このファイルは PreCompact フックにより自動生成されました。*
*次のセッション開始時にこのファイルを参照して文脈を引き継いでください。*
EOF

# --- stdout に additionalContext を出力（圧縮後のコンテキストに注入される） ---
changed_count=$(printf '%s\n' "$git_status" | grep -c '[^[:space:]]')

additional_context=$(cat <<EOF
## 圧縮前セッション引き継ぎ情報
- 引き継ぎファイル: $handoff_file
- Git ブランチ: $git_branch
- 変更ファイル数: $changed_count 件
- 圧縮トリガー: $trigger

次のセッションでは上記ファイルを参照することで作業文脈を復元できます。
EOF
)

jq -n --arg ctx "$additional_context" '{additionalContext: $ctx}'
