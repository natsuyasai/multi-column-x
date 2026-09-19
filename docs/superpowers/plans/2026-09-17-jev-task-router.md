# jev タスクルーティングハーネス Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claude Code の `UserPromptSubmit` hookでユーザー発話をjev(TypeSafe)に分類させ、Haiku/サブエージェント/Opus委譲の判断材料をアドバイザリーとしてセッションに注入するNode.js製ハーネスを作る。

**Architecture:** 単体のNode.jsスクリプト（外部npm依存なし）が `UserPromptSubmit` hookとして起動し、stdinで受け取ったプロンプトをjevのChoice APIに1回投げる。confidenceが閾値以上ならカテゴリ別ガイダンス文を `additionalContext` として出力し、Claude Code Actionのシステムリマインダーとしてセッションに注入する。モデルの強制切り替えは行わない（hookにその機能がないため）。

**Tech Stack:** Node.js（標準 `fetch`/`AbortController`/`node:test`/`node:assert` のみ、外部依存なし）

**Spec:** [docs/superpowers/specs/2026-09-17-jev-task-router-design.md](../specs/2026-09-17-jev-task-router-design.md)

## Global Constraints

- `~/.claude/hooks/jev-task-router.js` は外部npm依存なし。Node.js標準API（`fetch`, `AbortController`, `node:test`, `node:assert/strict`）のみを使う（Node.js 18以上が前提）。
- **fail-open必須**：APIキー未設定・JSON不正・fetch失敗・タイムアウト・レスポンス異常など、いかなるエラー経路でもプロンプトをブロックせず、標準出力に何も書かず終了コード0で終了すること。
- confidence閾値は `0.5`、jev APIのタイムアウトは `5000ms`（`UserPromptSubmit` の30秒制限に対して十分な余裕を残す）。
- ユーザーの実行環境は Windows（ホームディレクトリ: `C:\Users\fuku`）。hookの `command` にチルダ `~` 展開を使わず、絶対パスを使うこと。
- 対象ファイルはすべて `~/.claude` 配下（このgitリポジトリ外）。実装後、動作確認用に本リポジトリへのコミットは発生しない（プラン・スペックのみリポジトリに残る）。

---

## File Structure

- Create: `C:\Users\fuku\.claude\hooks\jev-task-router.js` — hook本体（分類ロジック・ガイダンス文組み立て・CLIエントリポイント）
- Create: `C:\Users\fuku\.claude\hooks\jev-task-router.test.js` — `node --test` によるユニットテスト
- Modify: `C:\Users\fuku\.claude\settings.json` — `hooks.UserPromptSubmit` 登録、`allowedEnvVars` に `TYPESAFE_API_KEY` を追加

## Task 1: hookスクリプト本体をTDDで実装する

**Files:**

- Create: `C:\Users\fuku\.claude\hooks\jev-task-router.js`
- Test: `C:\Users\fuku\.claude\hooks\jev-task-router.test.js`

**Interfaces:**

- Produces（このタスクがエクスポートし、Task 3の実機検証が呼び出すCLIの入出力契約）:
  - `CATEGORIES`: `{ [key: string]: { criteria: string, guidance: string|null } }` — キーは `trivial_mechanical` | `long_running` | `hard_reasoning` | `default`
  - `buildRequestBody(promptText: string): object` — jev API `POST /v1/systemone` のリクエストボディ
  - `classify(promptText: string, apiKey: string, fetchImpl: typeof fetch): Promise<{choice: string, confidence: number, probabilities: object} | null>`
  - `buildAdditionalContext(answer: {choice: string, confidence: number} | null): string | null`
  - `buildHookOutput(additionalContext: string): { hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: string } }`
  - `readStdin(stream: NodeJS.ReadableStream): Promise<string>`
  - CLIとして直接実行された場合（`node jev-task-router.js` としてstdinにhook JSONを渡す）、上記関数を使って標準出力にhook出力JSONを書くか、何も書かず終了コード0で終わる

### Step 1: buildRequestBodyの失敗するテストを書く

`C:\Users\fuku\.claude\hooks\jev-task-router.test.js` を新規作成する:

```js
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildRequestBody } = require("./jev-task-router.js");

test("buildRequestBodyはstateとjev-latestモデルと4カテゴリのchoice質問を組み立てる", () => {
  const body = buildRequestBody("テストプロンプト");
  assert.equal(body.state, "テストプロンプト");
  assert.equal(body.model, "jev-latest");
  assert.equal(body.questions.category.type, "choice");
  assert.deepEqual(Object.keys(body.questions.category.criteria).sort(), [
    "default",
    "hard_reasoning",
    "long_running",
    "trivial_mechanical",
  ]);
});
```

### Step 2: テストが失敗することを確認する

Run: `node --test "C:\Users\fuku\.claude\hooks\jev-task-router.test.js"`
Expected: FAIL（`jev-task-router.js` が存在せず `Cannot find module` で落ちる）

### Step 3: CATEGORIESとbuildRequestBodyを実装する

`C:\Users\fuku\.claude\hooks\jev-task-router.js` を新規作成する:

```js
"use strict";

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
    guidance: null,
  },
};

function buildRequestBody(promptText) {
  return {
    state: promptText,
    model: "jev-latest",
    questions: {
      category: {
        type: "choice",
        instructions: "このユーザー発話は次のうちどれに最も近いか？",
        criteria: Object.fromEntries(
          Object.entries(CATEGORIES).map(([key, value]) => [
            key,
            value.criteria,
          ]),
        ),
      },
    },
  };
}

module.exports = {
  CATEGORIES,
  buildRequestBody,
};
```

### Step 4: テストが通ることを確認する

Run: `node --test "C:\Users\fuku\.claude\hooks\jev-task-router.test.js"`
Expected: PASS（1 test passing）

### Step 5: コミット

このタスクは `~/.claude` 配下のファイルを扱うため、gitリポジトリ外。コミットは不要（`~/.claude` がユーザー自身のgit管理下にある場合のみ、任意でコミットしてよい）。

### Step 6: classifyの失敗するテストを追加する

`jev-task-router.test.js` に追記する:

```js
const { classify } = require("./jev-task-router.js");

test("classifyはfetch成功時にanswers.categoryを返す", async () => {
  const fakeFetch = async () => ({
    ok: true,
    json: async () => ({
      answers: {
        category: {
          choice: "trivial_mechanical",
          confidence: 0.9,
          probabilities: {},
        },
      },
    }),
  });
  const answer = await classify("ls -la を実行して", "dummy-key", fakeFetch);
  assert.equal(answer.choice, "trivial_mechanical");
  assert.equal(answer.confidence, 0.9);
});

test("classifyはfetchが例外を投げたときnullを返す(fail-open)", async () => {
  const fakeFetch = async () => {
    throw new Error("network error");
  };
  const answer = await classify("何か", "dummy-key", fakeFetch);
  assert.equal(answer, null);
});

test("classifyはレスポンスがokでないときnullを返す(fail-open)", async () => {
  const fakeFetch = async () => ({ ok: false });
  const answer = await classify("何か", "dummy-key", fakeFetch);
  assert.equal(answer, null);
});
```

`require` の行は既存の1行目 `const { buildRequestBody } = require("./jev-task-router.js");` を `const { buildRequestBody, classify } = require("./jev-task-router.js");` に書き換える。

### Step 7: テストが失敗することを確認する

Run: `node --test "C:\Users\fuku\.claude\hooks\jev-task-router.test.js"`
Expected: FAIL（`classify is not a function`）

### Step 8: classifyを実装する

`jev-task-router.js` の `module.exports` の直前に追記する:

```js
async function classify(promptText, apiKey, fetchImpl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildRequestBody(promptText)),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.answers.category;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
```

`module.exports` を次のように書き換える:

```js
module.exports = {
  CATEGORIES,
  buildRequestBody,
  classify,
};
```

### Step 9: テストが通ることを確認する

Run: `node --test "C:\Users\fuku\.claude\hooks\jev-task-router.test.js"`
Expected: PASS（4 tests passing）

### Step 10: コミット

不要（Step 5と同じ理由）。

### Step 11: buildAdditionalContextの失敗するテストを追加する

`jev-task-router.test.js` の先頭のrequire行を次に書き換える:

```js
const {
  buildRequestBody,
  classify,
  buildAdditionalContext,
} = require("./jev-task-router.js");
```

以下のテストを追記する:

```js
test("buildAdditionalContextはtrivial_mechanicalカテゴリでhaiku委譲を提案する文言を返す", () => {
  const ctx = buildAdditionalContext({
    choice: "trivial_mechanical",
    confidence: 0.9,
  });
  assert.match(ctx, /haiku/);
  assert.match(ctx, /0\.90/);
});

test("buildAdditionalContextはlong_runningカテゴリでrun_in_backgroundを提案する文言を返す", () => {
  const ctx = buildAdditionalContext({
    choice: "long_running",
    confidence: 0.8,
  });
  assert.match(ctx, /run_in_background/);
});

test("buildAdditionalContextはhard_reasoningカテゴリでopus委譲を提案する文言を返す", () => {
  const ctx = buildAdditionalContext({
    choice: "hard_reasoning",
    confidence: 0.7,
  });
  assert.match(ctx, /opus/);
});

test("buildAdditionalContextはdefaultカテゴリでnullを返す(何も注入しない)", () => {
  const ctx = buildAdditionalContext({ choice: "default", confidence: 0.99 });
  assert.equal(ctx, null);
});

test("buildAdditionalContextはconfidenceが閾値未満のときnullを返す", () => {
  const ctx = buildAdditionalContext({
    choice: "trivial_mechanical",
    confidence: 0.3,
  });
  assert.equal(ctx, null);
});

test("buildAdditionalContextはanswerがnullのときnullを返す(APIエラー時のfail-open)", () => {
  const ctx = buildAdditionalContext(null);
  assert.equal(ctx, null);
});
```

### Step 12: テストが失敗することを確認する

Run: `node --test "C:\Users\fuku\.claude\hooks\jev-task-router.test.js"`
Expected: FAIL（`buildAdditionalContext is not a function`）

### Step 13: buildAdditionalContextを実装する

`jev-task-router.js` の `classify` 関数の直後に追記する:

```js
function buildAdditionalContext(answer) {
  if (!answer || typeof answer.confidence !== "number") return null;
  if (answer.confidence < CONFIDENCE_THRESHOLD) return null;
  const category = CATEGORIES[answer.choice];
  if (!category || !category.guidance) return null;
  return `[jev-task-router] ${category.guidance} (confidence: ${answer.confidence.toFixed(2)})`;
}
```

`module.exports` に `buildAdditionalContext` を追加する:

```js
module.exports = {
  CATEGORIES,
  buildRequestBody,
  classify,
  buildAdditionalContext,
};
```

### Step 14: テストが通ることを確認する

Run: `node --test "C:\Users\fuku\.claude\hooks\jev-task-router.test.js"`
Expected: PASS（10 tests passing）

### Step 15: コミット

不要（Step 5と同じ理由）。

### Step 16: buildHookOutputの失敗するテストを追加する

`jev-task-router.test.js` の先頭のrequire行を次に書き換える:

```js
const {
  buildRequestBody,
  classify,
  buildAdditionalContext,
  buildHookOutput,
} = require("./jev-task-router.js");
```

以下のテストを追記する:

```js
test("buildHookOutputはUserPromptSubmit形式のhookSpecificOutputを組み立てる", () => {
  const output = buildHookOutput("テストメッセージ");
  assert.deepEqual(output, {
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: "テストメッセージ",
    },
  });
});
```

### Step 17: テストが失敗することを確認する

Run: `node --test "C:\Users\fuku\.claude\hooks\jev-task-router.test.js"`
Expected: FAIL（`buildHookOutput is not a function`）

### Step 18: buildHookOutputを実装する

`jev-task-router.js` の `buildAdditionalContext` 関数の直後に追記する:

```js
function buildHookOutput(additionalContext) {
  return {
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext,
    },
  };
}
```

`module.exports` に `buildHookOutput` を追加する:

```js
module.exports = {
  CATEGORIES,
  buildRequestBody,
  classify,
  buildAdditionalContext,
  buildHookOutput,
};
```

### Step 19: テストが通ることを確認する

Run: `node --test "C:\Users\fuku\.claude\hooks\jev-task-router.test.js"`
Expected: PASS（11 tests passing）

### Step 20: コミット

不要（Step 5と同じ理由）。

### Step 21: readStdinとCLIエントリポイント（main）を実装する

これはCLI起動時のI/O配線であり、fetch実体・実stdin・実プロセス終了に依存するため個別ユニットテストは書かず、Step 22の手動スモークテストで検証する。`jev-task-router.js` の `buildHookOutput` 関数の直後に追記する:

```js
async function readStdin(stream) {
  let input = "";
  for await (const chunk of stream) input += chunk;
  return input;
}

async function main() {
  const apiKey = process.env.TYPESAFE_API_KEY;
  const raw = await readStdin(process.stdin);

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.exit(0);
    return;
  }

  if (!apiKey || !payload.prompt) {
    process.exit(0);
    return;
  }

  const answer = await classify(payload.prompt, apiKey, fetch);
  const additionalContext = buildAdditionalContext(answer);
  if (!additionalContext) {
    process.exit(0);
    return;
  }

  process.stdout.write(JSON.stringify(buildHookOutput(additionalContext)));
  process.exit(0);
}

module.exports = {
  CATEGORIES,
  buildRequestBody,
  classify,
  buildAdditionalContext,
  buildHookOutput,
  readStdin,
};

if (require.main === module) {
  main().catch(() => process.exit(0));
}
```

（`module.exports` はこのブロックで最終形に置き換わる。ファイル末尾に `if (require.main === module) { ... }` を追加することで、`node --test` からrequireされた際に `main()` が誤って走らないようにする。）

### Step 22: 手動スモークテストでmain()の配線を確認する

Run（`TYPESAFE_API_KEY` を設定せずに実行し、fail-openで何も出力せず終了することを確認）:

```bash
echo '{"prompt":"test"}' | node "C:\Users\fuku\.claude\hooks\jev-task-router.js"; echo "exit code: $?"
```

Expected: 標準出力は空、`exit code: 0`

Run（不正なJSONを渡してもクラッシュしないことを確認）:

```bash
echo 'not json' | node "C:\Users\fuku\.claude\hooks\jev-task-router.js"; echo "exit code: $?"
```

Expected: 標準出力は空、`exit code: 0`

### Step 23: 最終確認としてユニットテスト一式を再実行する

Run: `node --test "C:\Users\fuku\.claude\hooks\jev-task-router.test.js"`
Expected: PASS（11 tests passing、0 failing）

### Step 24: コミット

不要（Step 5と同じ理由。`~/.claude` はこのgitリポジトリの管理外）。

---

## Task 2: `~/.claude/settings.json` にhookを登録する

**Files:**

- Modify: `C:\Users\fuku\.claude\settings.json`

**Interfaces:**

- Consumes: Task 1で作成した `C:\Users\fuku\.claude\hooks\jev-task-router.js` の絶対パス
- Produces: `UserPromptSubmit` hookとして登録された状態（Task 3の実機検証が前提とする設定）

### Step 1: 現在のsettings.jsonを確認する

Run: `cat "C:\Users\fuku\.claude\settings.json"` （なければ空扱いで進める）

既存の `hooks` オブジェクトや `allowedEnvVars` 配列がある場合は、それらを壊さないよう次のステップでマージする。

### Step 2: hooks.UserPromptSubmitとallowedEnvVarsをマージして書き込む

既存ファイルがある場合はReadツールで読み込んでから、Editツールで以下の内容をマージする（キーが存在しない場合は新規追加、存在する場合は配列に追記する）:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node C:\\Users\\fuku\\.claude\\hooks\\jev-task-router.js",
            "timeout": 10
          }
        ]
      }
    ]
  },
  "allowedEnvVars": ["TYPESAFE_API_KEY"]
}
```

**重要:** Windows環境のため `~` 展開に依存せず、絶対パス `C:\\Users\\fuku\\.claude\\hooks\\jev-task-router.js` を使うこと（JSON内なのでバックスラッシュは `\\` とエスケープする）。既存の `allowedEnvVars` に他のキーがある場合は `TYPESAFE_API_KEY` を追加するだけで、既存の値は消さないこと。

### Step 3: JSONとして妥当か検証する

Run:

```bash
node -e "JSON.parse(require('fs').readFileSync('C:\\\\Users\\\\fuku\\\\.claude\\\\settings.json', 'utf8')); console.log('valid json')"
```

Expected: `valid json` が出力される（構文エラーなら例外で落ちる）

### Step 4: コミット

不要（`~/.claude` はこのgitリポジトリの管理外）。

---

## Task 3: TYPESAFE_API_KEYを設定し、実機で4パターンの分類を確認する

**Files:** なし（動作確認のみ）

**Interfaces:**

- Consumes: Task 1の `jev-task-router.js`、Task 2で登録した hook 設定

### Step 1: APIキーが設定されているか確認する

Run: `echo $TYPESAFE_API_KEY`

- 出力が空の場合、ユーザーに `TYPESAFE_API_KEY` をユーザー環境変数として設定してもらう（Windowsの場合はシステム環境変数、またはシェルプロファイルに `export TYPESAFE_API_KEY=...` を追加）よう依頼し、設定後にターミナルを再起動して再確認する。
- このステップはユーザー本人の確認が必要なため、値が確認できるまで次のステップに進まない。

### Step 2: 「自明な機械的操作」パターンを確認する

Run:

```bash
echo '{"prompt":"npm run buildを実行して結果を教えて"}' | node "C:\Users\fuku\.claude\hooks\jev-task-router.js"
```

Expected: 標準出力のJSONの `additionalContext` に `haiku` という文言が含まれる（confidenceが低く分類されずスキップされた場合は、より明確に機械的な例文（例:「lsコマンドを実行して」）で再試行する）

### Step 3: 「長時間実行が必要な作業」パターンを確認する

Run:

```bash
echo '{"prompt":"このリポジトリ全体のimport文を横断的に調査して、循環依存がないか洗い出して"}' | node "C:\Users\fuku\.claude\hooks\jev-task-router.js"
```

Expected: `additionalContext` に `run_in_background` という文言が含まれる

### Step 4: 「難易度の高いタスク」パターンを確認する

Run:

```bash
echo '{"prompt":"このアーキテクチャの主要コンポーネントを再設計するトレードオフを検討して、最適な方針を提案して"}' | node "C:\Users\fuku\.claude\hooks\jev-task-router.js"
```

Expected: `additionalContext` に `opus` という文言が含まれる

### Step 5: 「default（通常タスク）」パターンで何も注入されないことを確認する

Run:

```bash
echo '{"prompt":"今日の天気どうかな"}' | node "C:\Users\fuku\.claude\hooks\jev-task-router.js"
```

Expected: 標準出力が空（何も注入されない）

### Step 6: 実際のClaude Codeセッションで発火を確認する

新しいClaude Codeセッションを開始し、Step 2〜5と同様の発話を送信する。セッション冒頭のシステムリマインダーに `[jev-task-router]` から始まるガイダンス文が注入されることを目視で確認する。

### Step 7: 結果をユーザーに報告する

Step 2〜6の結果（各カテゴリで意図通り注入/非注入が起きたか、confidenceの値）をまとめてユーザーに報告する。閾値やタイムアウトの調整が必要そうであれば、その旨も併せて報告する。

---

## Self-Review Notes（このプラン作成時点でのチェック結果）

- **spec網羅性:** 背景/目的・制約・スコープ・アーキテクチャ・コンポーネント詳細（hookスクリプト/分類スキーマ/settings.json登録）・データフロー・エラーハンドリング・テスト方針の全項目をTask 1〜3でカバーしている。
- **プレースホルダ:** なし（すべてのステップに実際のコード・コマンドを記載済み）。
- **型・シグネチャの一貫性:** `classify(promptText, apiKey, fetchImpl)`、`buildAdditionalContext(answer)`、`buildHookOutput(additionalContext)` の名称・引数はTask 1内で一貫している。Task 3の手動確認はTask 1のCLIエントリポイント（`main()`経由の標準入出力契約）のみに依存しており、内部関数名には依存しない。
- **落とし穴チェックリスト:**
  - [x] Windows環境のため `~` 展開に頼らず絶対パスを使用（Task 2 Step 2）
  - [x] settings.json編集は既存設定を壊さないようマージする指示にした（Task 2 Step 2）
  - [x] fail-open（エラー時に何も出力しない・非ブロック）をTask 1の全実装・全テストで担保
  - [x] `node --test` は `require.main === module` ガードで `main()` の誤爆を防止（Task 1 Step 21）
  - [x] `~/.claude` はこのgitリポジトリ外のため、コミットステップは全タスクで「不要」と明記
