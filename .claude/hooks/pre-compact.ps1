#!/usr/bin/env pwsh
# PreCompact hook: セッション引き継ぎファイルを生成する

param()

# --- stdin から hook 入力を読み取る ---
$stdinContent = [Console]::In.ReadToEnd()
$hookInput = $null
try {
    $hookInput = $stdinContent | ConvertFrom-Json
} catch {
    # パース失敗時は空のまま続行
}

$projectRoot   = if ($hookInput.cwd)             { $hookInput.cwd }             else { Split-Path $PSScriptRoot -Parent | Split-Path -Parent }
$trigger       = if ($hookInput.trigger)          { $hookInput.trigger }          else { "unknown" }
$sessionId     = if ($hookInput.session_id)       { $hookInput.session_id }       else { "unknown" }
$transcriptPath = if ($hookInput.transcript_path) { $hookInput.transcript_path }  else { $null }

# --- 出力先の準備 ---
$handoffDir = Join-Path $projectRoot ".claude\handoff"
if (-not (Test-Path $handoffDir)) {
    New-Item -ItemType Directory -Path $handoffDir -Force | Out-Null
}

$timestamp   = Get-Date -Format "yyyy-MM-dd-HH-mm"
$handoffFile = Join-Path $handoffDir "session-$timestamp.md"

# --- Git 状態を収集 ---
$gitBranch = (git -C $projectRoot branch --show-current 2>&1) -join ""
$gitStatus = (git -C $projectRoot status --short 2>&1)        | Out-String
$gitLog    = (git -C $projectRoot log --oneline -15 2>&1)     | Out-String

# --- transcript から直近の会話を抽出 ---
$recentMessages = [System.Collections.Generic.List[string]]::new()

if ($transcriptPath -and (Test-Path $transcriptPath)) {
    $lines = Get-Content $transcriptPath -Encoding UTF8 -ErrorAction SilentlyContinue
    $parsed = [System.Collections.Generic.List[object]]::new()

    foreach ($line in $lines) {
        if (-not $line.Trim()) { continue }
        try {
            $obj = $line | ConvertFrom-Json
            if ($obj.role) { $parsed.Add($obj) }
        } catch {}
    }

    # 直近 40 メッセージを対象にする
    $last40 = $parsed | Select-Object -Last 40
    foreach ($msg in $last40) {
        $role = $msg.role

        # content が文字列の場合とブロック配列の場合に対応
        $text = ""
        if ($msg.content -is [string]) {
            $text = $msg.content
        } elseif ($msg.content -is [array] -or $msg.content -is [System.Collections.IEnumerable]) {
            $textBlock = $msg.content | Where-Object { $_.type -eq "text" } | Select-Object -First 1
            if ($textBlock) { $text = $textBlock.text }
        }

        if (-not $text) { continue }
        $truncated = if ($text.Length -gt 600) { $text.Substring(0, 600) + " …(省略)" } else { $text }
        $recentMessages.Add("**[$role]**: $truncated")
    }
}

# --- memory インデックスを読み取る ---
$memoryContent = ""
$memoryIndex = Join-Path $projectRoot "memory\MEMORY.md"
if (Test-Path $memoryIndex) {
    $memoryContent = Get-Content $memoryIndex -Encoding UTF8 | Out-String
}

# --- 引き継ぎドキュメントを生成 ---
$msgBlock = if ($recentMessages.Count -gt 0) {
    $recentMessages -join "`n`n"
} else {
    "（transcript が見つからないか、メッセージなし）"
}

$handoffContent = @"
# セッション引き継ぎファイル

**生成日時**: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
**セッションID**: $sessionId
**圧縮トリガー**: $trigger
**プロジェクトルート**: $projectRoot

---

## Git 状態

### 現在のブランチ
``````
$gitBranch
``````

### 変更ファイル (git status --short)
``````
$gitStatus
``````

### 直近 15 コミット
``````
$gitLog
``````

---

## メモリインデックス (MEMORY.md)

$memoryContent

---

## 直近の会話コンテキスト

$msgBlock

---

*このファイルは PreCompact フックにより自動生成されました。*
*次のセッション開始時にこのファイルを参照して文脈を引き継いでください。*
"@

$handoffContent | Out-File -FilePath $handoffFile -Encoding UTF8 -NoNewline

# --- stdout に additionalContext を出力（圧縮後のコンテキストに注入される） ---
$changedCount = @($gitStatus -split "`n" | Where-Object { $_.Trim() -ne "" }).Count

$additionalContext = @"
## 圧縮前セッション引き継ぎ情報
- 引き継ぎファイル: $handoffFile
- Git ブランチ: $gitBranch
- 変更ファイル数: $changedCount 件
- 圧縮トリガー: $trigger

次のセッションでは上記ファイルを参照することで作業文脈を復元できます。
"@

@{
    additionalContext = $additionalContext
} | ConvertTo-Json -Compress | Write-Output
