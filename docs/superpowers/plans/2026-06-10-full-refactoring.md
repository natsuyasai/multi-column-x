# 全面リファクタリング実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 蓄積した負債（壊れたテスト・デッドコード・TS/Rust 二重実装・巨大ファイル）を、振る舞いを変えずにフェーズ分割で解消する。

**Architecture:** 現状分析は `docs/architecture/2026-06-10-current-architecture.md` を参照。問題番号（A1, B2, …）は同ドキュメントのインベントリ番号に対応する。方針は Martin Fowler 流：常にテストグリーンを維持し、1 リファクタリング = 1 コミット。フェーズ間に依存があるため順番に実施する（Phase 0 → 1 → 2 → … の順。フェーズ内のタスクも原則記載順）。

**Tech Stack:** React 19 + TypeScript + Vitest / Rust (Tauri v2) + cargo test / Kotlin (Android) + ktlint

**全タスク共通の完了条件:**

- `npm test` がオールグリーン
- `cargo test --manifest-path src-tauri/Cargo.toml` がオールグリーン（Phase 0 Task 0.1 完了後から適用）
- フォーマッタ実行済み（`npm run format:ts` / `npm run format:rust`、Kotlin 変更時は `format:kotlin`）
- inject `_src` を変更した場合は `npm run build:inject` を実行してからコミット

**禁止事項（現状分析ドキュメント §6 の制約より）:**

- `MainActivity.kt` の JNI 呼び出し対象メソッドのシグネチャ変更時は `android_bridge.rs` と `proguard-rules.pro` を同時更新する
- `App.tsx` の effect 順序（`setIsMobile` → `loadSettings`）を変えない
- `src-tauri/src/inject/*.js` を直接編集しない

---

## Phase 0: ベースライン回復（壊れたテストの修復と CI 導入）

リファクタリングの安全網を先に確立する。**このフェーズが終わるまで他のフェーズに着手しない。**

### Task 0.1: Rust テストのコンパイルエラー修復（A1）

**Files:**

- Modify: `src-tauri/src/inject/mod.rs:148-272`（tests モジュール）

- [ ] **Step 1: 失敗を確認する**

Run: `cargo test --manifest-path src-tauri/Cargo.toml 2>&1 | Select-Object -Last 10`
Expected: `error[E0560]: struct inject::InitScriptParams<'_> has no field named zoom_level` でコンパイル失敗

- [ ] **Step 2: テストコードから zoom_level の残骸を削除する**

`src-tauri/src/inject/mod.rs` の `default_params()` から該当行を削除：

```rust
// 削除する行（mod.rs:164）:
            zoom_level: 1.0,
```

`build_init_script_config_contains_all_flags` テストから zoomLevel アサーションを削除：

```rust
// 削除する行（mod.rs:212）:
        assert!(script.contains("zoomLevel: 1"));
```

- [ ] **Step 3: テストが通ることを確認する**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: 全テスト PASS（inject::tests 10 件 + settings::tests 7 件）

- [ ] **Step 4: コミット**

```bash
git add src-tauri/src/inject/mod.rs
git commit -m "fix: 削除済みzoom_levelフィールドを参照していたテストを修復"
```

### Task 0.2: SettingsPanel の失敗テスト修復（A2）

実装は再読み込みボタンで意図的に `onClose()` を呼ぶ（パネルを閉じて WebView の退避を解除してからリロードするため。`SettingsPanel.tsx:267-270`）。テストが旧仕様のまま残っている。**テスト側を実装に合わせる。**

**Files:**

- Modify: `src/components/SettingsPanel/SettingsPanel.test.tsx:64-71`

- [ ] **Step 1: 失敗を確認する**

Run: `npx vitest run src/components/SettingsPanel`
Expected: 「再読み込みボタンをクリックしてもパネルは閉じない」が FAIL

- [ ] **Step 2: テストを現仕様に合わせて書き換える**

```tsx
it("再読み込みボタンをクリックするとパネルが閉じてからリロードされる", async () => {
  const onClose = vi.fn();
  const onReload = vi.fn();
  render(
    <SettingsPanel {...defaultProps} onClose={onClose} onReload={onReload} />,
  );
  await userEvent.click(screen.getByRole("button", { name: "再読み込み" }));
  expect(onClose).toHaveBeenCalled();
  expect(onReload).toHaveBeenCalledWith("col-1");
});
```

- [ ] **Step 3: テストが通ることを確認する**

Run: `npm test`
Expected: 179 件全 PASS

- [ ] **Step 4: コミット**

```bash
git add src/components/SettingsPanel/SettingsPanel.test.tsx
git commit -m "test: 再読み込みボタンの仕様変更（onCloseを先に呼ぶ）にテストを追従"
```

### Task 0.3: cargo 警告の解消（B6 含む）

**Files:**

- Modify: `src-tauri/src/commands/account.rs:179`
- Modify: `src-tauri/src/commands/webview.rs:393,647`

- [ ] **Step 1: 警告 3 件を確認する**

Run: `cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | Select-String "warning"`
Expected: unused variable `app` / unused variable `accountId` / never used `load_use_x_app_for_compose`

- [ ] **Step 2: 修正する**

`account.rs:179`（`check_login_complete` は desktop ビルドで `app` 未使用。Phase 1 で関数ごと削除するため、ここでは警告のみ抑制）:

```rust
pub async fn check_login_complete(
    #[allow(unused_variables)] app: AppHandle,
    state: tauri::State<'_, LoginCompleteFlag>,
) -> Result<bool, String> {
```

`webview.rs:393`（`load_use_x_app_for_compose` は Android 専用）:

```rust
#[cfg(target_os = "android")]
fn load_use_x_app_for_compose(app: &AppHandle) -> bool {
```

`webview.rs:647`（`set_column_cookies` の引数は Android 以外で未使用）:

```rust
pub async fn set_column_cookies(
    #[allow(non_snake_case, unused_variables)] accountId: String,
) -> Result<(), String> {
```

- [ ] **Step 3: 警告ゼロを確認する**

Run: `cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | Select-String "warning"`
Expected: 出力なし

- [ ] **Step 4: コミット**

```bash
git add src-tauri/src/commands/account.rs src-tauri/src/commands/webview.rs
git commit -m "fix: cargo警告を解消（cfg属性とallow指定）"
```

### Task 0.4: CI ワークフロー導入（A3）

**Files:**

- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: ワークフローを作成する**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx prettier --check .
      - run: npm run build:inject
      - run: npm test

  rust:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          components: rustfmt
      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: src-tauri
      - name: Install Tauri Linux dependencies
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
      - run: cargo fmt --manifest-path src-tauri/Cargo.toml --check
      - run: cargo test --manifest-path src-tauri/Cargo.toml
```

注意: `cargo test` は inject の `.js` を `include_str!` するため、Rust ジョブでも事前に `.js` が必要になる場合がある。ビルドが `.js` 不在で失敗する場合は Rust ジョブにも `actions/setup-node` + `npm ci` + `npm run build:inject` ステップを追加すること。

- [ ] **Step 2: ローカルで CI 相当を実行して通ることを確認する**

Run: `npx prettier --check . ; npm run build:inject ; npm test ; cargo fmt --manifest-path src-tauri/Cargo.toml --check ; cargo test --manifest-path src-tauri/Cargo.toml`
Expected: すべて成功

- [ ] **Step 3: コミットして push 後、GitHub Actions の成功を確認する**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: vitest/cargo test/フォーマットチェックのCIを追加"
git push
```

---

## Phase 1: デッドコード削除・リポジトリ衛生

削除はすべて「参照ゼロ」を確認済み（現状分析 §5-B）。各削除の直前に `git grep` で再確認すること。

### Task 1.1: 死んだログイン通知 IPC コマンドの削除（B1, F4）

`notify_account_logged_in` / `mark_login_complete` / `check_login_complete` / `LoginCompleteFlag` は呼び出し元ゼロ（Android はセンチネルファイル方式、desktop は URL ポーリング方式に移行済み）。

**Files:**

- Modify: `src-tauri/src/commands/account.rs`（140-203 行付近の 3 関数 + `LoginCompleteFlag`）
- Modify: `src-tauri/src/lib.rs:64,150-152`
- Modify: `src/constants/ipc.ts:32-34`

- [ ] **Step 1: 参照ゼロを再確認する**

Run: `git grep -nE "notify_account_logged_in|mark_login_complete|check_login_complete|LoginCompleteFlag" -- src src-tauri`
Expected: `account.rs` の定義、`lib.rs` の登録、`ipc.ts` の定数定義のみ（呼び出しなし）

- [ ] **Step 2: 削除する**

- `account.rs`: `LoginCompleteFlag` 構造体と impl、`mark_login_complete`・`check_login_complete`・`notify_account_logged_in` の 3 コマンド関数を削除。先頭の `use ... Emitter ...` で不要になった import も削除
- `lib.rs`: `.manage(commands::account::LoginCompleteFlag::new())` と `generate_handler!` 内の 3 行を削除
- `ipc.ts`: `NOTIFY_ACCOUNT_LOGGED_IN` / `MARK_LOGIN_COMPLETE` / `CHECK_LOGIN_COMPLETE` の 3 定数を削除

なお `mark_login_complete` 削除により Task 0.3 の `#[allow(unused_variables)]` も消える。

- [ ] **Step 3: ビルドとテストを確認する**

Run: `cargo test --manifest-path src-tauri/Cargo.toml ; npm test`
Expected: 全 PASS、警告なし

- [ ] **Step 4: Android デバッグビルドで動作確認する（アカウント追加フロー）**

Run: `npm run tauri:android:build:debug`
Expected: ビルド成功。可能なら実機でアカウント追加 → ログイン → カラム表示を確認

- [ ] **Step 5: コミット**

```bash
git add src-tauri/src/commands/account.rs src-tauri/src/lib.rs src/constants/ipc.ts
git commit -m "refactor: 使われていないログイン通知IPCコマンド3件とLoginCompleteFlagを削除"
```

### Task 1.2: 未使用エクスポートの削除（B2, B3, C2 の TS 側）

**Files:**

- Modify: `src/hooks/useColumns.ts:26-59`（`getMobileInsets`）
- Delete: `src/lib/logger.ts`
- Modify: `src/types/index.ts:185-190,217-230`（`resolveColumnUrl` と `ResolveColumnUrlInput`）
- Modify: `src/types/index.test.ts`（`resolveColumnUrl` の describe ブロック）

- [ ] **Step 1: 参照ゼロを再確認する**

Run: `git grep -nE "getMobileInsets|lib/logger|resolveColumnUrl" -- src src-tauri`
Expected: 定義とテストのみ。`resolveColumnUrl` の本番呼び出しはゼロ（URL 解決の実体は Rust `webview.rs::resolve_url`）

- [ ] **Step 2: 削除する**

- `useColumns.ts`: `getMobileInsets` 関数（コメント含む 26-59 行）を削除
- `src/lib/logger.ts`: ファイル削除（`lib/` が空になるのでフォルダごと削除）
- `types/index.ts`: `resolveColumnUrl` と `ResolveColumnUrlInput` を削除
- `types/index.test.ts`: `describe("resolveColumnUrl", ...)` ブロックと import を削除

注意: Rust 側 `get_mobile_insets` コマンドは **削除しない**（将来のレイアウト調整で必要になる Kotlin→Rust の insets 取得経路として残す。完全に消す判断はユーザー確認が必要）。

- [ ] **Step 3: テストを確認する**

Run: `npm test ; npx tsc --noEmit`
Expected: 全 PASS、型エラーなし

- [ ] **Step 4: コミット**

```bash
git add -A src
git commit -m "refactor: 未使用のgetMobileInsets/logger.ts/resolveColumnUrlを削除"
```

### Task 1.3: inject ビルド残骸の掃除（B4, B5）

**Files:**

- Delete: `src-tauri/src/inject/_src/zoom.ts`
- Delete: `src-tauri/src/inject/zoom.js`（gitignore 済みローカルファイル）
- Delete: `src-tauri/src/inject/window_fullscreen.js` / `src-tauri/src/inject/assets/` / `src-tauri/src/inject/tauri.svg` / `src-tauri/src/inject/vite.svg`（同上）
- Modify: `vite.inject.config.ts:23`

- [ ] **Step 1: zoom.js が include されていないことを確認する**

Run: `git grep -n "zoom" -- src-tauri/src/inject/mod.rs`
Expected: ヒットなし（コメントの「CSS zoom inject は使用しない」のみ）

- [ ] **Step 2: 削除する**

- `vite.inject.config.ts` の `plainEntries` 配列から `"zoom",` を削除
- 上記ファイル群を削除

- [ ] **Step 3: inject を再ビルドして残骸が再生成されないことを確認する**

Run: `npm run build:inject ; cargo test --manifest-path src-tauri/Cargo.toml`
Expected: ビルド成功、`zoom.js`/`window_fullscreen.js`/`assets/` が存在しない、テスト PASS

- [ ] **Step 4: コミット**

```bash
git add -A vite.inject.config.ts src-tauri/src/inject
git commit -m "refactor: 廃止済みzoom injectエントリとビルド残骸を削除"
```

### Task 1.4: keyboard_shortcut.js を \_src の TypeScript パイプラインに統合（F2 の例外解消）

唯一手書き JS のまま git 管理されている inject スクリプトを、他と同じ `_src/*.ts` → ビルドの流れに乗せる。

**Files:**

- Create: `src-tauri/src/inject/_src/keyboard_shortcut.ts`
- Delete: `src-tauri/src/inject/keyboard_shortcut.js`（git 管理から外す）
- Modify: `vite.inject.config.ts`（`plainEntries` に追加）

- [ ] **Step 1: 現行 JS の内容を確認する**

Run: `Get-Content src-tauri/src/inject/keyboard_shortcut.js`

- [ ] **Step 2: 内容を等価な TypeScript として `_src/keyboard_shortcut.ts` に移植する**

現行 `keyboard_shortcut.js` のロジックをそのまま写し、`window.__TAURI__` 等の型は既存の `_src/types.d.ts` の流儀に合わせる。他の `_src/*.ts`（例: `scroll_event.ts`）の構造（即時実行・ガード節）を踏襲する。**ロジックの変更はしない。**

- [ ] **Step 3: ビルドエントリに追加し、git 管理を切り替える**

`vite.inject.config.ts` の `plainEntries` に `"keyboard_shortcut",` を追加。

```bash
git rm --cached src-tauri/src/inject/keyboard_shortcut.js
```

（`.gitignore` の `src-tauri/src/inject/**/*.js` が既にあるため追加変更は不要）

- [ ] **Step 4: ビルドして出力がほぼ等価であることを確認する**

Run: `npm run build:inject ; git diff --no-index --stat src-tauri/src/inject/keyboard_shortcut.js <(echo)` の代わりに、ビルド後の `keyboard_shortcut.js` を目視確認し、`cargo test` と `npm run tauri:build:debug` で動作確認
Expected: ビルド成功。デスクトップでキーボードショートカット（カラム内で `n` キー等）が機能する

- [ ] **Step 5: コミット**

```bash
git add -A src-tauri/src/inject vite.inject.config.ts
git commit -m "refactor: keyboard_shortcut.jsをTypeScriptソース化しビルドパイプラインに統合"
```

### Task 1.5: uuid 依存の削除（B7）

**Files:**

- Modify: `src/components/AddColumnDialog/AddColumnDialog.tsx:2`
- Modify: `package.json`

- [ ] **Step 1: 失敗するテストがないか現状確認する**

Run: `npx vitest run src/components/AddColumnDialog`
Expected: PASS（変更前の基準）

- [ ] **Step 2: uuidv4 を crypto.randomUUID に置換する**

```tsx
// 削除: import { v4 as uuidv4 } from "uuid";
// uuidv4() の呼び出し箇所を crypto.randomUUID() に置換
```

```bash
npm uninstall uuid @types/uuid
```

- [ ] **Step 3: テストを確認する**

Run: `npm test ; npx tsc --noEmit`
Expected: 全 PASS

- [ ] **Step 4: コミット**

```bash
git add package.json package-lock.json src/components/AddColumnDialog/AddColumnDialog.tsx
git commit -m "refactor: uuid依存を削除しcrypto.randomUUID()に統一"
```

### Task 1.6: ドキュメント衛生（F1, F2, F3, F4, F5, C5）

**Files:**

- Rename: `CALUDE.md` → `CLAUDE.md`
- Modify: `CLAUDE.md`（inject .js の管理方針記述を訂正）
- Modify: `README.md`（プロジェクト構成・コマンド表・モバイル説明を現状に同期）
- Move: `REFACTORING_PLAN.md` → `docs/archive/2026-05-refactoring-plan.md`
- Modify: `src-tauri/src/commands/account.rs:160` 付近の stale コメント
- Modify: `src/types/index.ts:157`（zoomLevel 行の削除）

- [ ] **Step 1: リネームと移動**

```bash
git mv CALUDE.md CLAUDE.md
mkdir -p docs/archive
git mv REFACTORING_PLAN.md docs/archive/2026-05-refactoring-plan.md
```

- [ ] **Step 2: CLAUDE.md の inject 記述を訂正する**

「ビルド済み `.js` はリポジトリ管理対象。」の一文を以下に置換：

```markdown
ビルド済み `.js` は gitignore されており直接編集禁止。`npm run build:inject` で生成する。
```

- [ ] **Step 3: README.md を現状に同期する**

- プロジェクト構成ツリー: `Sidebar/` を削除し、`TopBar/`・`MobileTabBar/`・`TabActionDialog/`・`LinkPopupDialog/`・`constants/ipc.ts`・`hooks/useDialogState.ts`・`hooks/useKeyboardShortcuts.ts`・`src-tauri/src/android_bridge.rs`・`src-tauri/src/ipc_constants.rs`・Kotlin 層（`gen/android/.../MainActivity.kt` 等）を追記
- 「inject スクリプトのビルドフロー」: `keyboard_shortcut` も `_src` 管理になったことを反映（Task 1.4 後）
- 「desktop / mobile 条件コンパイル」: mobile の説明を「ネイティブ Android WebView をオーバーレイ追加（JNI 経由）」に修正
- コマンド一覧表: `get_mobile_insets` / `set_column_cookies` / `report_new_posts_count` / `report_keyboard_shortcut` を追記し、Task 1.1 で削除した 3 コマンドを削除

- [ ] **Step 4: stale コメントを修正する**

`account.rs`（mark_login_complete 削除後に残る場合のみ）: visibilitychange / check_login_complete に言及するコメントを削除。
`types/index.ts`: フィールド対応表から `| zoomLevel | zoom_level | 1 |` の行を削除し、`| columnScale | column_scale | "default" |` を追記。

- [ ] **Step 5: テスト・フォーマット確認してコミット**

```bash
npm test
npm run format:ts
git add -A
git commit -m "docs: CLAUDE.mdリネーム・README現状同期・staleコメント削除"
```

---

## Phase 2: 定数・重複の統一（TS）

### Task 2.1: マジック値の定数化（D1, D2, D6）

**Files:**

- Modify: `src/constants/ipc.ts`
- Modify: `src/hooks/useColumns.ts:191,212,270,287,299,398,427,443,450`
- Test: `src/hooks/useColumns.test.ts`

- [ ] **Step 1: 定数を追加する**

`src/constants/ipc.ts` に追記：

```ts
/** WebView を画面外へ退避させる座標 */
export const OFFSCREEN = {
  /** モバイル: 非アクティブカラムの退避位置 */
  MOBILE_X: -99999,
  /** デスクトップ: ダイアログ表示中の退避位置 */
  DESKTOP_X: -9999,
} as const;

/** localStorage キー */
export const STORAGE_KEYS = {
  /** モバイルのアクティブカラム ID（バックグラウンド復帰後の復元用） */
  ACTIVE_COLUMN_ID: "mcx_activeColumnId",
} as const;
```

- [ ] **Step 2: useColumns.ts のリテラルを置換する**

- `-99999` → `OFFSCREEN.MOBILE_X`（4 か所）
- `-9999` → `OFFSCREEN.DESKTOP_X`（1 か所）
- `"mcx_activeColumnId"` → `STORAGE_KEYS.ACTIVE_COLUMN_ID`（3 か所）
- `invoke("create_column_webview", ...)`（427 行）→ `invoke(IPC_COMMANDS.CREATE_COLUMN_WEBVIEW, ...)`

- [ ] **Step 3: テストを確認する**

Run: `npm test`
Expected: 全 PASS

- [ ] **Step 4: 生文字列 invoke が残っていないことを確認する**

Run: `git grep -nE 'invoke\("' -- src`
Expected: ヒットなし

- [ ] **Step 5: コミット**

```bash
git add src/constants/ipc.ts src/hooks/useColumns.ts
git commit -m "refactor: 画面外退避座標・localStorageキー・IPCコマンド名のリテラルを定数化"
```

### Task 2.2: ページラベル変換の再統一（C3）

**Files:**

- Modify: `src/components/AppSettingsPanel/ColumnLayoutTab.tsx:23-43`
- Test: `src/components/AppSettingsPanel/ColumnLayoutTab.test.tsx`

- [ ] **Step 1: 既存テストが通ることを確認する**

Run: `npx vitest run src/components/AppSettingsPanel/ColumnLayoutTab`
Expected: PASS

- [ ] **Step 2: ローカル `getPageLabel` を共通関数に置換する**

`ColumnLayoutTab.tsx` の `getPageLabel`（23-36 行）を削除し、`getColumnLabel` を以下に変更：

```tsx
import { getPageTypeLabel } from "../../types";

function getColumnLabel(col: Column, accounts: Account[]): string {
  const account = accounts.find((a) => a.id === col.accountId);
  return (
    col.label ?? `${account?.label ?? col.accountId} - ${getPageTypeLabel(col)}`
  );
}
```

注意: 既存ローカル版は `search` で `検索: `（searchQuery 空でも接頭辞付き）、共通版は searchQuery 空なら `検索`。表示文言のこの差はテストで検出されるため、テストが落ちた場合は共通版の仕様（`types/index.ts:198-211`）に合わせてテスト期待値を更新する。

- [ ] **Step 3: テストを確認してコミット**

```bash
npx vitest run src/components/AppSettingsPanel
git add src/components/AppSettingsPanel/ColumnLayoutTab.tsx src/components/AppSettingsPanel/ColumnLayoutTab.test.tsx
git commit -m "refactor: ColumnLayoutTabのページラベル変換を共通getPageTypeLabelに統一"
```

---

## Phase 3: フロントエンド構造リファクタリング

### Task 3.1: グリッドレイアウト計算を純粋モジュールへ抽出（E2 の一部）

**Files:**

- Create: `src/lib/gridLayout.ts`
- Create: `src/lib/gridLayout.test.ts`
- Modify: `src/hooks/useColumns.ts`（re-export で互換維持）
- Modify: `src/App.tsx:4`（import 元変更）

- [ ] **Step 1: 既存テストの該当部分を確認する**

`useColumns.test.ts` の `calculateGridBounds` のテストを把握する。

- [ ] **Step 2: `src/lib/gridLayout.ts` を作成し、以下を useColumns.ts から移動する**

- 定数: `HEADER_HEIGHT`, `SCROLLBAR_HEIGHT`, `MOBILE_TAB_BAR_HEIGHT`, `TOPBAR_COLLAPSED_HEIGHT`, `TOPBAR_EXPANDED_HEIGHT`
- 関数: `getTopBarHeight`, `calculateGridBounds`
- 型: `ColumnBounds`, `GridBoundsOptions`

中身は無変更のコピー。`useColumns.ts` には互換 re-export を残す：

```ts
export {
  HEADER_HEIGHT,
  SCROLLBAR_HEIGHT,
  MOBILE_TAB_BAR_HEIGHT,
  TOPBAR_COLLAPSED_HEIGHT,
  TOPBAR_EXPANDED_HEIGHT,
  getTopBarHeight,
  calculateGridBounds,
} from "../lib/gridLayout";
export type { ColumnBounds } from "../lib/gridLayout";
```

- [ ] **Step 3: `calculateGridBounds` のテストを `gridLayout.test.ts` へ移動する**

`useColumns.test.ts` から該当 describe を切り出して移動（Tauri モック不要になる分 import を削る）。

- [ ] **Step 4: テストを確認してコミット**

```bash
npm test
git add src/lib/gridLayout.ts src/lib/gridLayout.test.ts src/hooks/useColumns.ts src/hooks/useColumns.test.ts src/App.tsx
git commit -m "refactor: グリッド座標計算を純粋モジュールsrc/lib/gridLayout.tsへ抽出"
```

### Task 3.2: カラム WebView IPC をサービス層へ抽出（E2, E5 の一部）

invoke 呼び出しの散在をやめ、1 か所に集約する。

**Files:**

- Create: `src/services/columnWebview.ts`
- Create: `src/services/columnWebview.test.ts`
- Modify: `src/hooks/useColumns.ts` / `src/App.tsx`（invoke 直呼びを置換）

- [ ] **Step 1: サービスを作成する**

```ts
// src/services/columnWebview.ts
import { invoke } from "@tauri-apps/api/core";
import type { Column, ColumnSettings } from "../types";
import type { ColumnBounds } from "../lib/gridLayout";
import {
  IPC_COMMANDS,
  WEBVIEW_LABELS,
  WEBVIEW_SCRIPTS,
} from "../constants/ipc";

/** カラム WebView を作成する */
export async function createColumnWebview(
  column: Column,
  dataDirectory: string,
  bounds: ColumnBounds,
): Promise<void> {
  await invoke(IPC_COMMANDS.CREATE_COLUMN_WEBVIEW, {
    args: { column, dataDirectory, ...bounds },
  });
}

/** カラム WebView の位置・サイズを更新する */
export async function resizeColumnWebview(
  columnId: string,
  bounds: ColumnBounds,
): Promise<void> {
  await invoke(IPC_COMMANDS.RESIZE_COLUMN_WEBVIEW, {
    bounds: { columnId, ...bounds },
  });
}

/** カラム WebView を削除する */
export async function removeColumnWebview(columnId: string): Promise<void> {
  await invoke(IPC_COMMANDS.REMOVE_COLUMN_WEBVIEW, { columnId });
}

/** アクティブカラムのアカウントに Cookie を切り替える（Android のみ実体動作） */
export async function setColumnCookies(accountId: string): Promise<void> {
  await invoke(IPC_COMMANDS.SET_COLUMN_COOKIES, { accountId });
}

/** カラム WebView 内でスクリプトを評価する（失敗は握りつぶす） */
export async function evalInColumn(
  columnId: string,
  script: string,
): Promise<void> {
  await invoke(IPC_COMMANDS.EVAL_IN_WEBVIEW, {
    label: WEBVIEW_LABELS.column(columnId),
    script,
  }).catch(console.error);
}

/** カラム設定変更時に必要な inject スクリプト一式を適用してリロードする */
export async function applyColumnSettingsScripts(
  columnId: string,
  settings: ColumnSettings,
  globalNgWords: string[],
): Promise<void> {
  await evalInColumn(
    columnId,
    WEBVIEW_SCRIPTS.applyAreaRemove(settings.areaRemoveEnabled),
  );
  await evalInColumn(
    columnId,
    WEBVIEW_SCRIPTS.applyCustomCSS(settings.customCSS),
  );
  await evalInColumn(
    columnId,
    WEBVIEW_SCRIPTS.applyNgWords(settings.ngWords, globalNgWords),
  );
  await evalInColumn(columnId, WEBVIEW_SCRIPTS.TRIGGER_RELOAD);
}
```

- [ ] **Step 2: サービスのテストを書く**

```ts
// src/services/columnWebview.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import {
  applyColumnSettingsScripts,
  resizeColumnWebview,
} from "./columnWebview";
import { DEFAULT_COLUMN_SETTINGS } from "../types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("columnWebview service", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockResolvedValue(undefined);
  });

  it("resizeColumnWebviewはcolumnIdとboundsをまとめて送る", async () => {
    await resizeColumnWebview("col-1", {
      x: 0,
      y: 36,
      width: 400,
      height: 800,
    });
    expect(invoke).toHaveBeenCalledWith("resize_column_webview", {
      bounds: { columnId: "col-1", x: 0, y: 36, width: 400, height: 800 },
    });
  });

  it("applyColumnSettingsScriptsは4つのスクリプトを順に適用する", async () => {
    await applyColumnSettingsScripts("col-1", DEFAULT_COLUMN_SETTINGS, ["ng"]);
    expect(invoke).toHaveBeenCalledTimes(4);
    const labels = vi
      .mocked(invoke)
      .mock.calls.map((c) => (c[1] as { label: string }).label);
    expect(labels.every((l) => l === "column-col-1")).toBe(true);
  });
});
```

Run: `npx vitest run src/services` → PASS を確認

- [ ] **Step 3: 呼び出し側を段階的に置換する（1 関数ずつ・各置換後にテスト実行）**

- `useColumns.ts`: `setActiveColumn` / `recalculateAllBounds` / `restoreMobileColumns` / `restoreDesktopColumns` / `handleAddColumn` / `hideColumnWebviews` / `handleRemoveColumn` / `recreateAllWebviews` 内の `invoke(...)` をサービス関数呼び出しに置換（`.catch(console.error)` の方針は現状維持）
- `App.tsx`: `handleReload` / `handleApplySettings` / `handleApplyGlobalSettings` / columnScale effect の `invoke(IPC_COMMANDS.EVAL_IN_WEBVIEW, ...)` を `evalInColumn` / `applyColumnSettingsScripts` に置換。`handleApplySettings` は次の形になる：

```tsx
const handleApplySettings = useCallback(
  async (columnId: string, settings: ColumnSettings, width: number) => {
    handleUpdateColumn(columnId, { settings, width });
    setSettingsColumnId(null);
    const globalNgWords = useAppStore.getState().globalSettings.ngWords ?? [];
    await applyColumnSettingsScripts(columnId, settings, globalNgWords);
  },
  [handleUpdateColumn],
);
```

- [ ] **Step 4: テストを確認してコミット**

```bash
npm test
git add src/services src/hooks/useColumns.ts src/App.tsx
git commit -m "refactor: カラムWebView IPCをservices/columnWebview.tsに集約"
```

### Task 3.3: useColumns をモバイル/デスクトップに分割（E2）

**Files:**

- Create: `src/hooks/useMobileColumns.ts`（アクティブカラム・スワイプ・モバイル用 create/restore）
- Create: `src/hooks/useDesktopColumns.ts`（bounds 計算・リサイズ監視・デスクトップ用 create/restore）
- Modify: `src/hooks/useColumns.ts`（両者を組み合わせる薄いファサードに縮小）
- Test: `src/hooks/useColumns.test.ts`（既存テストが回り続けること）

- [ ] **Step 1: 分割方針**

`useColumns()` の公開 API（戻り値の形）は**変えない**。内部実装のみ分割する。

- `useMobileColumns.ts` へ移動: `activeColumnId` state、`swipeState` state、`setActiveColumn`、`restoreMobileColumns`、スワイプ/ダブルタップの listen effect
- `useDesktopColumns.ts` へ移動: `columnBounds` state、`recalculateAllBounds`（デスクトップパス）、`restoreDesktopColumns`、リサイズ effect、Linux onMoved effect、`handleScrollbarScroll`
- `useColumns.ts` に残す: `containerRef`/`scrollbarRef`、`isMobile` での振り分け（`restoreColumns`、`recalculateAllBounds` の isMobile 分岐、`handleAddColumn`、`handleRemoveColumn`、`hideColumnWebviews`、`recreateAllWebviews`、`setDialogOpen`）

- [ ] **Step 2: 1 ステップ 1 移動で進める**

各 hook を新ファイルに移し、`useColumns` から呼ぶ。**移動のたびに** `npm test` を実行。

- [ ] **Step 3: 全テスト確認とコミット**

```bash
npm test
git add src/hooks
git commit -m "refactor: useColumnsをモバイル/デスクトップ実装に分割（公開APIは不変）"
```

### Task 3.4: App.tsx の listen effect をフックに抽出（E3）

**Files:**

- Create: `src/hooks/useWebviewEvents.ts`
- Create: `src/hooks/useWebviewEvents.test.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: フックを作成する**

App.tsx の 2 つの listen effect（横スクロール中継: 128-136 行、新着カウント+通知: 139-166 行）を移動する：

```ts
// src/hooks/useWebviewEvents.ts
import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "../store/useAppStore";
import { IPC_EVENTS, WEBVIEW_LABELS } from "../constants/ipc";

/** WebView 内の横ホイールを受け取ってスクロールバーを動かす */
export function useWebviewScrollRelay(
  scrollbarRef: React.RefObject<HTMLDivElement | null>,
) {
  useEffect(() => {
    const unlisten = listen<number>(IPC_EVENTS.WEBVIEW_SCROLL, (e) => {
      const el = scrollbarRef.current;
      if (el) el.scrollLeft += e.payload;
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [scrollbarRef]);
}

/** inject script からの新着カウントでバッジ更新、通知カラムはデスクトップ通知 */
export function useNewPostsNotification(
  setUnreadCount: (columnId: string, count: number) => void,
) {
  useEffect(() => {
    const unlisten = listen<{ label: string; count: number }>(
      IPC_EVENTS.WEBVIEW_NEW_POSTS_COUNT,
      (e) => {
        const { label, count } = e.payload;
        const columnId = label.replace(WEBVIEW_LABELS.COLUMN_PREFIX, "");
        setUnreadCount(columnId, count);

        const col = useAppStore
          .getState()
          .columns.find((c) => c.id === columnId);
        if (
          col?.pageType === "notifications" &&
          col.settings.autoReloadEnabled &&
          count > 0 &&
          "Notification" in window &&
          Notification.permission === "granted"
        ) {
          new Notification("新着通知", {
            body: `${count}件の新しい通知があります`,
          });
        }
      },
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [setUnreadCount]);
}
```

- [ ] **Step 2: テストを書く**

`useKeyboardShortcuts.test.ts` の listen モックパターンを踏襲し、`useNewPostsNotification` が `setUnreadCount` を正しい columnId で呼ぶことを検証するテストを作成する。

- [ ] **Step 3: App.tsx から effect を削除してフック呼び出しに置換、テスト確認、コミット**

```bash
npm test
git add src/hooks/useWebviewEvents.ts src/hooks/useWebviewEvents.test.ts src/App.tsx
git commit -m "refactor: App.tsxのWebViewイベントlistenをuseWebviewEventsフックに抽出"
```

---

## Phase 4: Rust 構造リファクタリング

### Task 4.1: 設定読み出しヘルパーを専用モジュールへ抽出（E1 の一部）

**Files:**

- Create: `src-tauri/src/commands/settings_store.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/commands/webview.rs:352-421`

- [ ] **Step 1: `settings_store.rs` を作成し、webview.rs から以下を移動する**

`load_global_settings` / `load_video_auto_play_stop_enabled` / `load_hide_ad_enabled` / `load_popup_esc_close_enabled` / `load_global_ng_words` / `load_use_x_app_for_compose` / `load_accounts_json` を `pub(crate) fn` として移動。中身は無変更。

```rust
// src-tauri/src/commands/settings_store.rs
//! settings.json（tauri-plugin-store）からの読み出しヘルパー。
//! スキーマは TypeScript 側 src/types/index.ts と settings.rs の構造体定義に従う。
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

pub(crate) fn load_global_settings(app: &AppHandle) -> serde_json::Value { /* webview.rs:352-358 を移動 */ }
// ...以下同様に移動
```

`commands/mod.rs` に `pub mod settings_store;` を追加。webview.rs 側は `use super::settings_store::*;` ではなく明示 use で参照する。

- [ ] **Step 2: テストを確認してコミット**

```bash
cargo test --manifest-path src-tauri/Cargo.toml
git add src-tauri/src/commands
git commit -m "refactor: 設定読み出しヘルパーをcommands/settings_store.rsへ抽出"
```

### Task 4.2: ポップアップ生成ボイラープレートの抽出（E1）

`open_popup_window` / `open_link_popup_window` / `open_compose_window` / `switch_popup_session` の 4 コマンド（desktop/mobile 計 7 実装）で反復している「accounts_json 読込 → esc 設定読込 → init script 生成 → ラベル生成」を 1 関数にまとめる。

**Files:**

- Modify: `src-tauri/src/commands/webview.rs`

- [ ] **Step 1: ヘルパーを追加する**

```rust
/// ポップアップ系ウィンドウ共通の初期化情報。
struct PopupInit {
    label: String,
    init_script: String,
}

/// accounts_json / esc 設定を読み込んでポップアップ init script とラベルを生成する。
fn build_popup_init(
    app: &AppHandle,
    label_prefix: &str,
    current_account_id: &str,
    target_href: &str,
) -> PopupInit {
    let accounts_json = crate::commands::settings_store::load_accounts_json(app);
    let esc_close_enabled = crate::commands::settings_store::load_popup_esc_close_enabled(app);
    PopupInit {
        label: format!("{}{}", label_prefix, uuid::Uuid::new_v4()),
        init_script: crate::inject::build_popup_init_script(
            &accounts_json,
            current_account_id,
            target_href,
            esc_close_enabled,
        ),
    }
}
```

- [ ] **Step 2: 7 実装を 1 つずつ置換する（各置換後に `cargo check`）**

例（`open_popup_window` desktop 版）:

```rust
let PopupInit { label: popup_label, init_script: popup_init } =
    build_popup_init(&app, labels::POPUP_PREFIX, &current_account_id, &url);
```

`switch_popup_session` の `format!("popup-{}", ...)` もこの置換で `labels::POPUP_PREFIX` に統一される（D3 の一部解消）。

- [ ] **Step 3: テスト・ビルド確認してコミット**

```bash
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri:build:debug
git add src-tauri/src/commands/webview.rs
git commit -m "refactor: ポップアップ初期化の重複7か所をbuild_popup_initに集約"
```

### Task 4.3: webview.rs のモジュール分割（E1）

**Files:**

- Create: `src-tauri/src/commands/webview/mod.rs`（旧 webview.rs を変換）
- Create: `src-tauri/src/commands/webview/column.rs`
- Create: `src-tauri/src/commands/webview/popup.rs`
- Create: `src-tauri/src/commands/webview/compose.rs`
- Modify: `src-tauri/src/lib.rs`（パス変更なし — `commands::webview::xxx` のまま）

- [ ] **Step 1: 分割マッピング（関数は無変更で移動のみ）**

| 移動先          | 移動する項目                                                                                                                                                                                   |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `column.rs`     | `CreateWebviewArgs`, `create_column_webview`(desktop/mobile), `remove_column_webview`(d/m), `ResizeBounds`, `resize_column_webview`(d/m), `set_column_cookies`, `webview_label`, `resolve_url` |
| `popup.rs`      | `open_popup_window`(d/m), `open_link_popup_window`(d/m), `close_popup_window`, `switch_popup_session`, `get_popup_bounds`, `PopupInit`, `build_popup_init`                                     |
| `compose.rs`    | `open_compose_window`(d/m)                                                                                                                                                                     |
| `mod.rs` に残す | `eval_in_webview`, `report_webview_scroll`, `report_new_posts_count`, `report_keyboard_shortcut`, `get_mobile_insets`, `parse_url`, `pub use` 再エクスポート                                   |

`mod.rs` で `pub use column::*; pub use popup::*; pub use compose::*;` とし、`lib.rs` の `generate_handler!` の記述は変更不要にする。

- [ ] **Step 2: 1 モジュールずつ移動し、都度 `cargo check` する**

- [ ] **Step 3: `resolve_url` と `webview_label` の単体テストを `column.rs` に追加する**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::settings::{ColumnData, ColumnSettings};

    fn column(page_type: &str) -> ColumnData {
        ColumnData {
            id: "c1".into(),
            account_id: "a1".into(),
            page_type: page_type.into(),
            custom_url: None,
            home_tab_name: None,
            search_query: None,
            list_id: None,
            width: 400.0,
            order: 0,
            label: None,
            settings: serde_json::from_str::<ColumnSettings>(
                r#"{"autoReloadEnabled":true,"autoReloadInterval":600,"areaRemoveEnabled":true,"customCSS":""}"#,
            )
            .unwrap(),
            grid_row: 1,
            grid_col: 1,
            height_mode: "auto".into(),
            height_value: None,
            height_unit: None,
        }
    }

    #[test]
    fn resolve_url_home_without_tab() {
        assert_eq!(resolve_url(&column("home")), "https://x.com/home");
    }

    #[test]
    fn resolve_url_home_with_tab_appends_query() {
        let mut col = column("home");
        col.home_tab_name = Some("フォロー中".into());
        assert!(resolve_url(&col).starts_with("https://x.com/home?"));
    }

    #[test]
    fn resolve_url_unknown_falls_back_to_home() {
        assert_eq!(resolve_url(&column("unknown")), "https://x.com/home");
    }

    #[test]
    fn webview_label_uses_column_prefix() {
        assert_eq!(webview_label("abc"), "column-abc");
    }
}
```

- [ ] **Step 4: テスト・デバッグビルド確認してコミット**

```bash
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri:build:debug
git add src-tauri/src
git commit -m "refactor: webview.rsをcolumn/popup/composeモジュールに分割"
```

### Task 4.4: ラベル定数の取りこぼし修正（D3, D4）

**Files:**

- Modify: `src-tauri/src/ipc_constants.rs`
- Modify: `src-tauri/src/commands/webview/mod.rs`（`eval_in_webview` の `"column-"`）
- Modify: `src-tauri/src/lib.rs` / `src-tauri/src/commands/webview/*.rs`（`"main"`）

- [ ] **Step 1: `labels` に MAIN を追加する**

```rust
    /// メインウィンドウのラベル
    pub const MAIN: &str = "main";
```

- [ ] **Step 2: 置換する**

- `eval_in_webview` 内 `label.starts_with("column-")` → `label.starts_with(labels::COLUMN_PREFIX)`
- `get_window("main")` / `get_webview_window("main")` / `window.label() == "main"` → `labels::MAIN`（webview/ 各ファイル・lib.rs の全箇所）

- [ ] **Step 3: 取りこぼしゼロを確認する**

Run: `git grep -nE '"main"|"column-"|"popup-"' -- src-tauri/src --and --not -e ipc_constants`
Expected: `ipc_constants.rs` 以外でヒットなし

- [ ] **Step 4: テスト確認してコミット**

```bash
cargo test --manifest-path src-tauri/Cargo.toml
git add src-tauri/src
git commit -m "refactor: ウィンドウ/WebViewラベルのリテラルをipc_constantsに統一"
```

### Task 4.5: 旧プロジェクト名由来のグローバル変数名を改名（D5）

`__tvAccounts` 等（twitter-viewer 時代の命名）を `__mcx*` に統一する。**Rust（定数値）と inject TS（参照側）の同時変更が必要。**

**Files:**

- Modify: `src-tauri/src/ipc_constants.rs:52-58`
- Modify: `src-tauri/src/inject/_src/popup_toolbar.ts`（`__tv*` 参照箇所すべて）
- Modify: `src-tauri/src/inject/mod.rs`（テストのアサーション文字列）

- [ ] **Step 1: 参照箇所を洗い出す**

Run: `git grep -n "__tv" -- src-tauri src`
Expected: `ipc_constants.rs`（定数値）、`popup_toolbar.ts`（window 参照）、`mod.rs`（テスト）のみ

- [ ] **Step 2: 改名する**

| 旧                     | 新                      |
| ---------------------- | ----------------------- |
| `__tvAccounts`         | `__mcxAccounts`         |
| `__tvCurrentAccountId` | `__mcxCurrentAccountId` |
| `__tvTargetHref`       | `__mcxTargetHref`       |
| `__tvEscCloseEnabled`  | `__mcxEscCloseEnabled`  |

定数名も `TV_ACCOUNTS` → `MCX_ACCOUNTS` 等に改名。`popup_toolbar.ts` と `mod.rs` のテスト文字列も同時に更新。

- [ ] **Step 3: 再ビルド・テスト確認してコミット**

```bash
npm run build:inject
cargo test --manifest-path src-tauri/Cargo.toml
npm test
git add src-tauri/src/ipc_constants.rs src-tauri/src/inject
git commit -m "refactor: 旧プロジェクト名由来の__tv*グローバル変数名を__mcx*に改名"
```

### Task 4.6: TS↔Rust デフォルト値の契約テスト導入（C1）

二重定義自体は IPC 境界の両側にあるため残すが、ドリフトを CI で検出できるようにする。**Rust のデフォルト値を JSON fixture として共有し、両言語のテストが同じ fixture と比較する。**

**Files:**

- Create: `contracts/default-settings.json`（fixture）
- Modify: `src-tauri/src/commands/settings.rs`（fixture 一致テスト追加）
- Create: `src/types/defaults.contract.test.ts`

- [ ] **Step 1: fixture を生成する**

一時的に以下のテストを `settings.rs` に追加して実行し、出力から `contracts/default-settings.json` を作成する：

```rust
    #[test]
    fn print_default_settings_json() {
        println!(
            "{}",
            serde_json::to_string_pretty(&AppSettingsData::default()).unwrap()
        );
    }
```

Run: `cargo test --manifest-path src-tauri/Cargo.toml print_default_settings_json -- --nocapture`
出力 JSON を `contracts/default-settings.json` に保存し、一時テストは以下の恒久テストに置き換える。

- [ ] **Step 2: Rust 側の契約テストを追加する**

```rust
    #[test]
    fn default_settings_match_contract_fixture() {
        let fixture: serde_json::Value =
            serde_json::from_str(include_str!("../../../contracts/default-settings.json"))
                .unwrap();
        let actual = serde_json::to_value(AppSettingsData::default()).unwrap();
        assert_eq!(actual, fixture);
    }
```

- [ ] **Step 3: TS 側の契約テストを追加する**

```ts
// src/types/defaults.contract.test.ts
import { describe, it, expect } from "vitest";
import { DEFAULT_GLOBAL_SETTINGS } from "./index";
import fixture from "../../contracts/default-settings.json";

describe("TS/Rust デフォルト設定の契約", () => {
  it("DEFAULT_GLOBAL_SETTINGSがRust側Defaultと一致する", () => {
    // windowBounds など構造ごと比較。フィールド追加時はfixture再生成を忘れるとここで落ちる
    expect(DEFAULT_GLOBAL_SETTINGS).toEqual(fixture.globalSettings);
  });
});
```

注意: `tsconfig.json` で `resolveJsonModule` が無効ならテスト内で `import fixture from ... with { type: "json" }` か `fs.readFileSync` 方式に切り替える。TS 側デフォルトと Rust 側デフォルトに**既知の差**（`defaultScrollPosRestoreEnabled`: TS=false / Rust serde default=true 等）が見つかった場合は、どちらが正かをユーザーに確認してから揃えること。

- [ ] **Step 4: 両側のテストを確認し、types/index.ts の手動同期コメントを「契約テスト参照」に簡素化する**

```bash
cargo test --manifest-path src-tauri/Cargo.toml
npm test
git add contracts src-tauri/src/commands/settings.rs src/types
git commit -m "test: TS/Rustデフォルト設定のドリフトを検出する契約テストを追加"
```

---

## Phase 5: Kotlin リファクタリング

**警告: このフェーズの全タスクで、JNI から呼ばれる `MainActivity` のメソッド（`createColumnWebView` 等）のシグネチャは変更しない。** メソッド本体の実装を委譲に置き換えるのみとし、`proguard-rules.pro` は変更不要に保つ。各タスク後に**リリースビルドで動作確認**する。

### Task 5.1: Profile API サポート判定の共通化（E4 の一部）

**Files:**

- Create: `src-tauri/gen/android/app/src/main/java/com/natsuyasai/multicolumnx/WebViewProfiles.kt`
- Modify: `MainActivity.kt`（3 か所の重複 try/catch を置換）
- Modify: `AddAccount.kt`（同様の判定 1 か所）

- [ ] **Step 1: 共通オブジェクトを作成する**

```kotlin
package com.natsuyasai.multicolumnx

import android.util.Log
import android.webkit.WebView
import androidx.webkit.ProfileStore
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature

/** WebView Profile API（アカウントごとのセッション分離）のサポート判定と適用。 */
object WebViewProfiles {
  private const val TAG = "WebViewProfiles"
  private const val FEATURE = "PROFILE_URLS_AND_COOKIE_MANAGER"

  val isSupported: Boolean
    get() =
      try {
        WebViewFeature.isFeatureSupported(FEATURE)
      } catch (e: Exception) {
        false
      }

  /** account-{accountId} プロファイルを作成して webView に適用する。 */
  fun apply(
    webView: WebView,
    accountId: String,
    contextName: String,
  ) {
    try {
      ProfileStore.getInstance().getOrCreateProfile("account-$accountId")
      WebViewCompat.setProfile(webView, "account-$accountId")
    } catch (e: Exception) {
      Log.w(TAG, "Profile API unavailable for $contextName: ${e.message}")
    }
  }
}
```

- [ ] **Step 2: MainActivity.kt / AddAccount.kt の判定・適用箇所を置換する**

- `MainActivity.createPopupWebView` / `createColumnWebView` / `setAccountCookies` の `profileApiSupported` ローカル判定 → `WebViewProfiles.isSupported`
- `MainActivity.setupWebViewProfile` を削除し、呼び出しを `WebViewProfiles.apply(wv, accountId, "column $id")` に置換
- `AddAccount.kt` の profile 設定ブロックも `WebViewProfiles` 利用に置換（挙動: 非サポート時の Cookie クリアは現状維持）

- [ ] **Step 3: フォーマット・テスト・リリースビルド確認**

Run: `npm run format:kotlin`、`cd src-tauri/gen/android; ./gradlew.bat testDebugUnitTest`、`npm run tauri:android:build`
Expected: すべて成功。実機でカラム表示・アカウント切替・ポップアップを確認

- [ ] **Step 4: コミット**

```bash
git add src-tauri/gen/android/app/src/main/java/com/natsuyasai/multicolumnx
git commit -m "refactor: WebView Profile API判定をWebViewProfilesに共通化"
```

### Task 5.2: ブーメランジェスチャー状態機械の抽出（E4）

**Files:**

- Create: `src-tauri/gen/android/app/src/main/java/com/natsuyasai/multicolumnx/BoomerangGestureDetector.kt`
- Create: `src-tauri/gen/android/app/src/test/java/com/natsuyasai/multicolumnx/BoomerangGestureDetectorTest.kt`
- Modify: `MainActivity.kt`（`dispatchTouchEvent` 内の状態機械を委譲）

- [ ] **Step 1: 検出器クラスを設計する**

`MainActivity.dispatchTouchEvent`（110-225 行）の状態機械（`LGesturePhase` / 各 `lGesture*` フィールド / ダブルタップ検出）を、コールバックインターフェイスを持つクラスへ移動する：

```kotlin
package com.natsuyasai.multicolumnx

import android.view.MotionEvent
import android.view.VelocityTracker

/**
 * 「逆引き → 前進」ブーメランジェスチャーとダブルタップの検出器。
 * MotionEvent を渡すと状態遷移し、確定時にコールバックを呼ぶ。
 */
class BoomerangGestureDetector(
  private val density: Float,
  private val callbacks: Callbacks,
) {
  interface Callbacks {
    /** ジェスチャーが progress 状態に入った（navDir: "left" | "right"） */
    fun onSwipeProgress(navDir: String)

    /** ジェスチャーが確定した */
    fun onSwipeNavigate(navDir: String)

    /** progress 後にキャンセルされた */
    fun onSwipeCancel()

    /** ダブルタップを検出した */
    fun onDoubleTap()

    /** ジェスチャーを無効化すべき状態か（ポップアップ表示中など） */
    fun isGestureBlocked(): Boolean
  }

  fun onTouchEvent(ev: MotionEvent) {
    // MainActivity.dispatchTouchEvent の when ブロックをそのまま移動。
    // AppBridge.onSwipe* / popupWebViews.isNotEmpty() への直接参照を
    // callbacks.* / callbacks.isGestureBlocked() に置き換える。
  }
}
```

`MainActivity` 側：

```kotlin
  private val gestureDetector by lazy {
    BoomerangGestureDetector(
      resources.displayMetrics.density,
      object : BoomerangGestureDetector.Callbacks {
        override fun onSwipeProgress(navDir: String) = AppBridge.onSwipeProgress(navDir)

        override fun onSwipeNavigate(navDir: String) = AppBridge.onSwipeNavigate(navDir)

        override fun onSwipeCancel() = AppBridge.onSwipeCancel()

        override fun onDoubleTap() = AppBridge.onDoubleTap()

        override fun isGestureBlocked(): Boolean = popupWebViews.isNotEmpty()
      },
    )
  }

  override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
    gestureDetector.onTouchEvent(ev)
    return super.dispatchTouchEvent(ev)
  }
```

- [ ] **Step 2: 単体テストを書く（Robolectric なしで MotionEvent をモック）**

最低限のケース: 「左引き→右リリースで onSwipeNavigate("right")」「縦移動でキャンセル」「2 回タップで onDoubleTap」「isGestureBlocked=true なら何も発火しない」。`MotionEvent.obtain` が使えない場合は mockito-kotlin でモックする（`build.gradle.kts` に `testImplementation("org.mockito.kotlin:mockito-kotlin:5.4.0")` を追加）。

- [ ] **Step 3: テスト・リリースビルド確認してコミット**

```bash
npm run format:kotlin
cd src-tauri/gen/android && ./gradlew.bat testDebugUnitTest && cd ../../..
npm run tauri:android:build
git add src-tauri/gen/android
git commit -m "refactor: ブーメランジェスチャー状態機械をBoomerangGestureDetectorに抽出"
```

実機確認: スワイプでのカラム切替・ダブルタップでの先頭スクロールが動作すること。

### Task 5.3: WebView 生成設定の共通化（E4 の残り）

`createPopupWebView` と `createColumnWebView` の WebView 初期化（settings 5 項目 + cookie + DOCUMENT_START_SCRIPT）の重複を private ヘルパーへ。**public メソッドのシグネチャは不変。**

**Files:**

- Modify: `MainActivity.kt`

- [ ] **Step 1: ヘルパーを追加し、2 か所の生成コードを置換する**

```kotlin
  // カラム/ポップアップ共通の WebView 初期化。
  // webViewClient は呼び出し側で用途別（ColumnWebViewClient / ExternalLinkWebViewClient）に設定する。
  private fun newConfiguredWebView(
    initScript: String,
    accountId: String,
    contextName: String,
  ): WebView =
    WebView(this).also { wv ->
      wv.settings.javaScriptEnabled = true
      wv.settings.domStorageEnabled = true
      wv.settings.setSupportMultipleWindows(true)
      wv.settings.cacheMode = android.webkit.WebSettings.LOAD_CACHE_ELSE_NETWORK
      // api.x.com は別ホストのため third-party cookie を許可（無効だと v1.1 API が 401）
      CookieManager.getInstance().setAcceptThirdPartyCookies(wv, true)
      if (WebViewProfiles.isSupported && accountId.isNotEmpty()) {
        WebViewProfiles.apply(wv, accountId, contextName)
      } else if (accountId.isNotEmpty()) {
        setCookieForAccount(accountId)
      }
      if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
        WebViewCompat.addDocumentStartJavaScript(wv, initScript, setOf("*"))
      }
    }
```

注意: 現行 `createColumnWebView` は「Profile 非対応時に loadUrl **前**に Cookie 設定」という順序制約がある。ヘルパー内の分岐はこの順序を保っている（Cookie 設定は WebView 生成時 = loadUrl 前）。`createColumnWebView` 側にある「Profile 非対応時の事前 setCookieForAccount」(354-358 行) はヘルパーに吸収されるため削除する。

- [ ] **Step 2: テスト・リリースビルド・実機確認してコミット**

```bash
npm run format:kotlin
npm run tauri:android:build
git add src-tauri/gen/android
git commit -m "refactor: カラム/ポップアップWebViewの初期化重複をnewConfiguredWebViewに集約"
```

---

## Phase 6: 横断改善（エラー処理・テスト補強・最終ドキュメント）

### Task 6.1: フロントエンドのログ・エラー処理ユーティリティ（E6）

**Files:**

- Create: `src/lib/log.ts`
- Modify: `src/services/columnWebview.ts` ほか `.catch(console.error)` 箇所

- [ ] **Step 1: ユーティリティを作成する**

```ts
// src/lib/log.ts
// tauri-plugin-log 経由でファイル/stdout にも残す軽量ロガー。
// listen 系の後始末など「失敗してもユーザー影響なし」の箇所は logError を使う。
import { error as pluginError } from "@tauri-apps/plugin-log";

export function logError(context: string): (e: unknown) => void {
  return (e: unknown) => {
    const msg = `[${context}] ${e instanceof Error ? e.message : String(e)}`;
    console.error(msg);
    pluginError(msg).catch(() => {});
  };
}
```

- [ ] **Step 2: `.catch(console.error)` を文脈名付きの `logError("...")` に置換する**

対象: `src/services/columnWebview.ts`、`src/hooks/useColumns.ts`、`src/App.tsx`、`src/store/useAppStore.ts`。`.catch(() => {})`（意図的に握りつぶす箇所）はそのまま残す。1 ファイルずつ置換し、都度 `npm test`。

- [ ] **Step 3: テスト確認してコミット**

```bash
npm test
git add src/lib/log.ts src/services src/hooks src/App.tsx src/store
git commit -m "refactor: エラーログを文脈名付きlogErrorに統一しplugin-logへも出力"
```

### Task 6.2: テスト空白地帯の補強（G）

**Files:**

- Create: `src/hooks/useAccounts.test.ts`
- Create: `src/components/LinkPopupDialog/LinkPopupDialog.test.tsx`

- [ ] **Step 1: useAccounts のテストを書く**

モック方針は `useColumns.test.ts` に倣う（`@tauri-apps/api/core` / `event` / `plugin-os` を vi.mock）。最低限のケース：

```ts
// 観点のみ列挙（実装はuseColumns.test.tsのモック構成を踏襲）:
// 1. モバイル: open_add_account_window成功 → アカウントがstoreに追加され、close_windowが呼ばれる
// 2. モバイル: invoke reject（キャンセル）→ アカウントが追加されない
// 3. 連打防止: isAddingRef中の再呼び出しは何もしない
// 4. removeAccount: confirm=false なら delete_account_data が呼ばれない
```

- [ ] **Step 2: LinkPopupDialog のテストを書く**

```tsx
// 観点:
// 1. アカウント選択肢がprops.accountsから描画される
// 2. URL入力→開くボタンでonSubmit(url, accountId)が呼ばれる
// 3. 閉じるボタン/EscでonCloseが呼ばれる
```

既存ダイアログテスト（`AddColumnDialog.test.tsx`）の書き方を踏襲する。

- [ ] **Step 3: テスト確認してコミット**

```bash
npm test
git add src/hooks/useAccounts.test.ts src/components/LinkPopupDialog
git commit -m "test: useAccountsとLinkPopupDialogのテストを追加"
```

### Task 6.3: 最終ドキュメント更新

**Files:**

- Modify: `docs/architecture/2026-06-10-current-architecture.md`（解消済み項目に取り消し線 or 解消日を追記）
- Modify: `README.md` / `CLAUDE.md`（Phase 3-5 で変わった構造を反映: `src/services/`, `src/lib/`, `commands/webview/` 分割, Kotlin 新クラス）

- [ ] **Step 1: 構造変更を README のプロジェクト構成に反映する**

- [ ] **Step 2: インベントリ表の各項目に「✅ Phase N で解消」を追記する**

- [ ] **Step 3: コミット**

```bash
npm run format:ts
git add docs README.md CLAUDE.md
git commit -m "docs: リファクタリング完了後の構造をドキュメントに反映"
```

---

## 進め方の補足

- **ブランチ戦略**: フェーズごとに `refactor/phase-N-<name>` ブランチを切り、フェーズ完了で main にマージする（CLAUDE.md の「新規ブランチを作成するべきかまず確認」に従い、開始時にユーザーへ確認）。
- **Android 実機確認が必要なタスク**: 1.1, 1.4, 4.5, 5.1, 5.2, 5.3（リリースビルドで確認。デバッグビルドでは R8 が無効なため JNI/ProGuard 起因の問題を検出できない）。
- **着手しない（スコープ外）と判断したもの**:
  - `header_customizer.js`（600KB React バンドル）の軽量化 — 効果はあるが inject アーキテクチャの再設計が必要で、リファクタリング（振る舞い不変）の範囲を超える
  - `.steering/` / `aidlc-docs/` の整理（F6） — 開発ワークフローの選択はユーザー判断
  - IPC 定数の TS/Rust コード生成による一本化（C4） — 契約テスト（Task 4.6 と同様の方式）で十分と判断。必要なら別プランで
