# jev タスクルーティングハーネス 設計書

## 背景・目的

Claude Code のセッションで、ユーザーの発話内容に応じて処理方針（Haiku委譲 / サブエージェント委譲 / Opus相当の慎重な検討 / 通常どおりSonnet）を自動的に提案する実験的なハーネスを作る。分類には TypeSafe の System One モデル「jev」を使う。

- 自明な操作・機械的な操作（コマンド実行、結果の応答待ちなど） → Haiku 委譲を提案
- 長時間実行が必要な作業 → サブエージェント（バックグラウンド）委譲を提案
- 難易度の高いタスクの検討 → Opus 相当の慎重な検討を提案
- それ以外 → 何もしない（現状の Sonnet のまま）

適用範囲は特定プロジェクトに限定せず、`~/.claude` 配下に置いて全プロジェクト共通で有効にする。

## 事前調査で判明した制約（重要）

Claude Code の `UserPromptSubmit` フックは **モデルを直接切り替える機能を持たない**（出力スキーマに `model` フィールドが存在しない）。できるのは次の2つのみ。

- `hookSpecificOutput.additionalContext` でテキストをコンテキストとして注入する
- プロンプトをブロックする（`decision: "block"` + 理由）

サブエージェントへの強制委譲も hook から直接行う手段はない。したがって本ハーネスは「hook が強制する」のではなく、**「hook が jev の分類結果を判断材料としてコンテキストに注入し、それを読んだ Claude 自身が `Agent` ツールの `model` パラメータや `run_in_background` を使って実際に委譲するかどうかを判断する」アドバイザリー方式**とする。

`UserPromptSubmit` のデフォルトタイムアウトは30秒。jev API呼び出しはこれに対して十分余裕を持たせる（後述のタイムアウト設計を参照）。

## スコープ

- 対象: `~/.claude/hooks/jev-task-router.js`（新規）、`~/.claude/settings.json`（`hooks.UserPromptSubmit` に登録を追加）
- 対象外: Claude Code本体の改造、jevモデル自体のファインチューニング、hookによるモデルの強制切り替え（前述の制約により不可能）

## アーキテクチャ

```
ユーザー発話
  → UserPromptSubmit hook 起動（jev-task-router.js、stdinでJSON受信）
  → プロンプトテキストを state として jev API (POST https://api.typesafe.ai/v1/systemone) へ1リクエスト
  → choice / confidence を取得
  → confidence が閾値以上ならカテゴリ別ガイダンス文を additionalContext として出力
  → Claude Code がシステムリマインダーとしてセッションへ注入
  → メインのClaudeがガイダンスを読み、必要なら Agent ツールで model / run_in_background を指定して委譲
```

## コンポーネント詳細

### 1. hookスクリプト `~/.claude/hooks/jev-task-router.js`

Node.js単体ファイル、外部npm依存なし（標準 `fetch` を使用）。

**入力（stdin, UserPromptSubmit hookのJSON）:**

```json
{
  "session_id": "...",
  "transcript_path": "...",
  "cwd": "...",
  "hook_event_name": "UserPromptSubmit",
  "prompt": "ユーザーが入力した最新の発話テキスト"
}
```

**処理概要:**

```js
#!/usr/bin/env node
const CONFIDENCE_THRESHOLD = 0.5;
const TIMEOUT_MS = 5000;
const API_URL = "https://api.typesafe.ai/v1/systemone";

const CATEGORIES = {
  trivial_mechanical: {
    criteria:
      "コマンド実行、結果の応答待ちなど、判断を要さない自明で機械的な操作",
    guidance:
      'この発話は「自明な機械的操作」に分類されました。可能であれば Agent ツールに model: "haiku" を指定して委譲することを検討してください。',
  },
  long_running: {
    criteria: "調査・大量ファイル横断・ビルドなど、完了までに時間がかかる作業",
    guidance:
      "この発話は「長時間実行が必要な作業」に分類されました。Agent ツールで run_in_background: true を使い、バックグラウンドで実行することを検討してください。",
  },
  hard_reasoning: {
    criteria:
      "設計判断・トレードオフ検討など、難易度が高く慎重な検討が必要なタスク",
    guidance:
      'この発話は「難易度の高いタスク」に分類されました。Agent ツールに model: "opus" を指定して委譲するか、通常より慎重に検討することを検討してください。',
  },
  default: {
    criteria: "上記のいずれにも該当しない通常のタスク",
    guidance: null, // 注入しない
  },
};

async function classify(promptText) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.TYPESAFE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        state: promptText,
        model: "jev-latest",
        questions: {
          category: {
            type: "choice",
            instructions: "このユーザー発話は次のうちどれに最も近いか？",
            criteria: Object.fromEntries(
              Object.entries(CATEGORIES).map(([k, v]) => [k, v.criteria]),
            ),
          },
        },
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.answers.category; // { choice, probabilities, confidence }
  } catch {
    return null; // fail-open
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;

  let payload;
  try {
    payload = JSON.parse(input);
  } catch {
    process.exit(0); // 不正入力は何もせず終了（ブロックしない）
  }

  if (!process.env.TYPESAFE_API_KEY || !payload.prompt) process.exit(0);

  const answer = await classify(payload.prompt);
  if (!answer || answer.confidence < CONFIDENCE_THRESHOLD) process.exit(0);

  const category = CATEGORIES[answer.choice];
  if (!category || !category.guidance) process.exit(0);

  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: `[jev-task-router] ${category.guidance} (confidence: ${answer.confidence.toFixed(2)})`,
      },
    }),
  );
  process.exit(0);
}

main().catch(() => process.exit(0)); // どんな例外でもfail-open
```

### 2. 分類スキーマの拡張方法

`CATEGORIES` オブジェクトに項目を追加するだけで分類を拡張できる（例: `read_only_investigation`, `destructive_risk` など）。追加時は `criteria` に判定基準の説明文、`guidance` に注入するガイダンス文を書く。`guidance: null` を指定すればそのカテゴリは何も注入しない「無視カテゴリ」として扱える。

### 3. `~/.claude/settings.json` への登録

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node ~/.claude/hooks/jev-task-router.js",
            "timeout": 10
          }
        ]
      }
    ]
  },
  "allowedEnvVars": ["TYPESAFE_API_KEY"]
}
```

実際の `~/.claude/settings.json` は厳密なJSON（コメント・末尾カンマ不可）なので、上記はそのまま貼り付け可能な形にしてある。

既存の `~/.claude/settings.json` に他の hooks 設定がある場合はマージする（上書きしない）。

## データフロー（詳細）

1. ユーザーがプロンプトを送信
2. `UserPromptSubmit` hook が起動し、stdin から `{ prompt, ... }` を受け取る
3. `TYPESAFE_API_KEY` が未設定、または `prompt` が空なら即終了（何もしない）
4. jev API へ1リクエスト（タイムアウト5秒、`AbortController`で制御）
5. レスポンスの `choice` と `confidence` を取得
6. `confidence < 0.5` なら注入をスキップ（誤誘導防止）
7. 該当カテゴリの `guidance` が `null`（=defaultカテゴリ）なら注入をスキップ
8. それ以外は `additionalContext` としてガイダンス文を出力
9. Claude Code がこれをシステムリマインダーとしてセッションに追加
10. メインのClaude（現在動作中のエージェント）がガイダンスを読み、`Agent` ツールの `model` / `run_in_background` パラメータを使うかどうかを判断する（強制ではない）

## エラーハンドリング

すべてのエラー経路で **fail-open**（ユーザーの操作を絶対にブロックしない）を徹底する。

| 状況                                  | 挙動                                                              |
| ------------------------------------- | ----------------------------------------------------------------- |
| `TYPESAFE_API_KEY` 未設定             | 何もせず終了（コード0）                                           |
| stdin JSON パース失敗                 | 何もせず終了                                                      |
| jev API タイムアウト（5秒超）         | `AbortController` で中断し、何もせず終了                          |
| jev API がエラーレスポンス（4xx/5xx） | 何もせず終了                                                      |
| jev API レスポンスが想定外の形        | `answers.category` アクセスで例外 → `main().catch()` で捕捉し終了 |
| confidence が閾値未満                 | 注入をスキップ（誤誘導防止）                                      |

デバッグ時のみ `JEV_ROUTER_DEBUG=1` を設定すると `~/.claude/logs/jev-router.log` にエラー内容を追記する（デフォルトは無出力）。このログ機構は初期実装のオプション機能とし、実装プランで詳細を詰める。

## テスト方針

- `node --test` によるユニットテスト（`jev-task-router.test.js`）
  - `classify()` をモック化し、カテゴリごとの `additionalContext` 文言が正しく組み立てられることを確認
  - confidence が閾値未満のとき注入されないことを確認
  - `default` カテゴリのとき注入されないことを確認
  - API失敗時（タイムアウト/エラーレスポンス/例外）に何も出力せず正常終了（exit code 0）することを確認
  - APIキー未設定時に何も出力せず正常終了することを確認
- 実機検証: `~/.claude/settings.json` に実際に登録し、代表的な発話（機械的操作の例／長時間調査の例／難問検討の例／雑談などdefaultの例）で意図したガイダンスが注入されることを確認する

## 保留・非対応事項

- hook からモデルを直接切り替える機能は Claude Code に存在しないため、本ハーネスはあくまで **提案ベース**。実際に委譲するかどうかは毎回メインのClaudeの判断に委ねられる。
- 追加の分類カテゴリ（読み取り専用調査タスク、破壊的操作の要確認タスクなど）は、今回のユーザーから具体的な要望がなかったため初期実装には含めない。`CATEGORIES` オブジェクトへの追加で対応できる設計にとどめる。
- confidence閾値（0.5）とタイムアウト（5秒）は初期値。実運用で調整が必要になる可能性がある。
