# tauri_plugin_log stdout ログ出力 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `tauri-plugin-log` を設定して Rust バックエンドおよびフロントエンド（TypeScript）から stdout へログ出力できるようにする。

**Architecture:** Rust 側は `tauri_plugin_log::Builder` にターゲット（stdout）とログレベル（Debug）を設定する。既存の `eprintln!` は `log::error!` に置き換える。フロントエンド側は `@tauri-apps/plugin-log` npm パッケージをインストールし、`src/lib/logger.ts` にラッパーを作成する。

**Tech Stack:** Rust / tauri-plugin-log 2.8.0, TypeScript / @tauri-apps/plugin-log, React 19

---

### Task 1: Rust ログプラグインのターゲット設定

**Files:**

- Modify: `src-tauri/src/lib.rs:66`

- [ ] **Step 1: `lib.rs` のプラグイン登録を更新する**

現在:

```rust
.plugin(tauri_plugin_log::Builder::new().build())
```

以下に置き換える（`lib.rs` の `run()` 関数内）:

```rust
.plugin(
    tauri_plugin_log::Builder::new()
        .target(tauri_plugin_log::Target::new(
            tauri_plugin_log::TargetKind::Stdout,
        ))
        .max_level(log::LevelFilter::Debug)
        .build(),
)
```

- [ ] **Step 2: `eprintln!` を `log::error!` に置き換える**

`lib.rs` 56行目の `save_window_bounds` 関数内:

```rust
// Before
eprintln!("[MultiColumnX] failed to save window bounds: {e}");

// After
log::error!("failed to save window bounds: {e}");
```

- [ ] **Step 3: ビルドが通ることを確認する**

```bash
cd src-tauri
cargo check
```

期待結果: `Finished` と表示され、エラーなし。

- [ ] **Step 4: コミット**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: configure tauri-plugin-log with stdout target"
```

---

### Task 2: フロントエンド用 npm パッケージのインストールと logger ラッパー作成

**Files:**

- Modify: `package.json`（npm install で自動更新）
- Create: `src/lib/logger.ts`

- [ ] **Step 1: `@tauri-apps/plugin-log` をインストールする**

```bash
npm install @tauri-apps/plugin-log
```

期待結果: `package.json` の `dependencies` に `"@tauri-apps/plugin-log": "^2"` が追加される。

- [ ] **Step 2: `src/lib/` ディレクトリを作成し `logger.ts` を新規作成する**

`src/lib/logger.ts`:

```ts
export { error, warn, info, debug, trace } from "@tauri-apps/plugin-log";
```

- [ ] **Step 3: TypeScript コンパイルが通ることを確認する**

```bash
npx tsc --noEmit
```

期待結果: エラーなし。

- [ ] **Step 4: コミット**

```bash
git add package.json package-lock.json src/lib/logger.ts
git commit -m "feat: add @tauri-apps/plugin-log and logger wrapper"
```

---

### Task 3: 動作確認

- [ ] **Step 1: 開発サーバーを起動してログ出力を確認する**

```bash
npm run tauri:dev
```

期待結果: ターミナルに以下のような tauri_plugin_log フォーマットのログが表示される。

```
2026-05-05T00:00:00.000Z [INFO] tauri_plugin_log: ...
```

- [ ] **Step 2: フロントエンドからのログ呼び出しを手動確認する（任意）**

アプリの適当なコンポーネントで一時的にインポートして動作確認:

```ts
import { info } from "../lib/logger";
info("logger test");
```

stdout に `[INFO] logger test` が出力されれば成功。確認後は削除する。
