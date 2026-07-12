# 改善実行計画（2026-07-02）

> **実行エージェント向け:** 本計画は sonnet5 サブエージェント（`superpowers:subagent-driven-development` または `.claude/skills/subagent-tdd-implementation`）でタスク単位に実行する。各タスクは独立にレビュー・コミット可能な粒度に分割してある。ステップはチェックボックス（`- [ ]`）で進捗管理する。

**ゴール:** 監査（`aidlc-docs/inception/reverse-engineering/2026-07-02-project-audit.md`）で特定した S（セキュリティ）/ R（リファクタリング）/ T（テスト）/ U（UX）項目を、優先度順・フェーズ単位で解消する。

**アーキテクチャ:** 既存構造は変更しない。フロントは React 19 + Zustand + フック分割、Rust は commands/ 配下のコマンド群という現行境界を維持し、その内部品質と防御層を強化する。

**技術スタック:** 既存のまま（Vitest / fast-check / Storybook / proptest / kotest。新規依存の追加はしない）。

## グローバル制約（全タスク共通）

- 回答・テストケース名は日本語。TDD は t-wada 流（Red → Green → Refactor、1 タスク 1 コミット以上）。
- 各タスク完了時に `npm run lint && npm run typecheck && npm test`（Rust 変更時はさらに `cargo clippy --all-targets -- -D warnings && cargo test`、フォーマットは `npx prettier --write` / `cargo fmt`）がオールグリーンであること。
- inject `_src` を変更したら `npm run build:inject`。ビルド済み `.js` は直接編集禁止。
- inject の DOM 依存ロジックを変更する場合は、実 DOM（claude-in-chrome）での検証要否を**ユーザーに必ず確認**する（CLAUDE.md 制約）。
- serde フィールドは `#[serde(rename = "camelCase")]` 必須。
- コミットは Conventional Commits（feat / fix / refactor / test / docs / chore）。
- フェーズごとに新規ブランチを切る（例: `fix/security-hardening`、`refactor/settings-panel` 等）。1 ブランチ = 1 PR = 1 フェーズを基本とする。

## 推奨実行順序

| フェーズ | 内容                                             | ブランチ例                    | 規模感 |
| -------- | ------------------------------------------------ | ----------------------------- | ------ |
| 1        | セキュリティ強化（S2 → S4 → S1 → S3 → S5/S6）    | `fix/security-hardening`      | 中     |
| 2        | Rust リファクタリング（R2 → R5）                 | `refactor/rust-column-init`   | 小     |
| 3        | テスト拡充・フロント（T1）                       | `test/desktop-mobile-columns` | 中     |
| 4        | テスト拡充・inject（T2）                         | `test/inject-scripts`         | 中     |
| 5        | テスト拡充・Rust（T3）                           | `test/rust-settings-store`    | 小     |
| 6        | UX: アカウントダイアログ（U1）                   | `feat/account-dialogs`        | 中     |
| 7        | UX: カラム直接移動（U2 + R3 配線）               | `feat/column-header-move`     | 小     |
| 8        | UX: ショートカット拡充（U3）                     | `feat/shortcut-reload-help`   | 中     |
| 9        | フロントリファクタリング（R1）                   | `refactor/app-settings-panel` | 中     |
| 10       | UX: 通知対象拡大（U4）・プリセットモバイル（U5） | `feat/notify-any-column`      | 中     |

フェーズ 1 が最優先。フェーズ 2 以降は独立性が高く、順序の入れ替え・並行実行が可能（ただし R1 と U 系で AppSettingsPanel を同時に触らないこと）。

---

# フェーズ 1: セキュリティ強化

## Task 1.1: delete_account_data のパス検証（S2）

**Files:**

- Modify: `src-tauri/src/commands/account.rs`
- Test: 同ファイル `#[cfg(test)] mod tests`

**Interfaces:**

- Produces: `fn is_safe_account_dir(path: &Path, accounts_root: &Path) -> bool`（純粋関数）

- [ ] **Step 1: 失敗するテストを書く**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn accounts配下のディレクトリは削除を許可する() {
        let root = Path::new("/data/app/accounts");
        assert!(is_safe_account_dir(
            Path::new("/data/app/accounts/account-abc"),
            root
        ));
    }

    #[test]
    fn accounts直下でないパスは拒否する() {
        let root = Path::new("/data/app/accounts");
        assert!(!is_safe_account_dir(Path::new("/data/app"), root));
        assert!(!is_safe_account_dir(Path::new("/etc"), root));
    }

    #[test]
    fn 親ディレクトリ参照を含むパスは拒否する() {
        let root = Path::new("/data/app/accounts");
        assert!(!is_safe_account_dir(
            Path::new("/data/app/accounts/../../../etc"),
            root
        ));
    }

    #[test]
    fn accountsルート自体は拒否する() {
        let root = Path::new("/data/app/accounts");
        assert!(!is_safe_account_dir(root, root));
    }
}
```

- [ ] **Step 2: `cargo test --manifest-path src-tauri/Cargo.toml is_safe` で FAIL を確認**（`is_safe_account_dir` 未定義エラー）

- [ ] **Step 3: 最小実装**

```rust
/// 削除対象パスが accounts ルートの「配下」であることを検証する（ルート自体・外部・.. 参照は拒否）。
/// canonicalize は存在しないパスで失敗するため、字句的な正規化（components ベース）で判定する。
fn is_safe_account_dir(path: &Path, accounts_root: &Path) -> bool {
    use std::path::Component;
    if path
        .components()
        .any(|c| matches!(c, Component::ParentDir))
    {
        return false;
    }
    path.starts_with(accounts_root) && path != accounts_root
}
```

`delete_account_data` 本体を修正（`app: AppHandle` を引数に追加して accounts ルートを解決）:

```rust
#[tauri::command]
pub async fn delete_account_data(app: AppHandle, data_directory: String) -> Result<(), String> {
    let accounts_root = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("accounts");
    let path = PathBuf::from(&data_directory);
    if !is_safe_account_dir(&path, &accounts_root) {
        return Err("invalid account data directory".to_string());
    }
    if path.exists() {
        std::fs::remove_dir_all(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}
```

- [ ] **Step 4: テスト PASS 確認 + フロント側の呼び出し（`useAccounts.ts` の `invoke(IPC_COMMANDS.DELETE_ACCOUNT_DATA, ...)`）が引数変更不要なことを確認**（`app` は Tauri が注入するため JS 側変更なし）
- [ ] **Step 5: `cargo clippy --all-targets -- -D warnings && cargo test` オールグリーン → コミット** `fix(security): delete_account_data を accounts 配下パスに制限する`

## Task 1.2: 破壊的コマンドの呼び出し元ウィンドウ検証（S4）

**Files:**

- Modify: `src-tauri/src/commands/webview/mod.rs`（`eval_in_webview`）、`src-tauri/src/commands/account.rs`（`delete_account_data` / `close_window`）、`src-tauri/src/commands/settings.rs`（`save_settings`）

**Interfaces:**

- Produces: `pub(crate) fn require_main_caller(window: &tauri::Webview) -> Result<(), String>`（`commands/mod.rs` に配置）

方針: 対象コマンドのシグネチャに `webview: tauri::Webview` を追加し、`webview.label() == labels::MAIN` でなければ `Err` を返す。`report_*` 系・`open_popup_window`・`get_mobile_insets` などカラム/ポップアップからの呼び出しが正当なコマンドは**対象外**（変更しない）。

- [ ] **Step 1: `require_main_caller` のテストを書く**（ラベル文字列判定の純粋関数 `is_main_label(label: &str) -> bool` に切り出してテスト。テスト名: `mainラベルのみ許可する` / `columnプレフィックスのラベルは拒否する`）
- [ ] **Step 2: FAIL 確認 → 実装 → PASS 確認**
- [ ] **Step 3: 各対象コマンドに検証を追加し、既存の呼び出し元（main の React からの invoke）が通ることを `npm test`（columnWebview.test 等の契約テスト）で確認**
- [ ] **Step 4: クオリティゲート → コミット** `fix(security): 破壊的コマンドをmainウィンドウ呼び出しに限定する`

**注意:** Tauri v2 でコマンド引数に `tauri::Webview` / `tauri::Window` を取る場合の呼び出し元解決は公式ドキュメント（Commands > Accessing the Window）に従うこと。カラム WebView は Linux で `WebviewWindow`、他 OS で child `Webview` のため、`tauri::Webview` を受けてラベル判定するのが両対応。

## Task 1.3: remote capability のドメイン限定（S1）

**Files:**

- Modify: `src-tauri/capabilities/column-webview.json`

- [ ] **Step 1: `remote.urls` を `["https://x.com/*", "https://*.x.com/*", "https://twitter.com/*", "https://*.twitter.com/*"]` に変更し、`http://*` を削除**
- [ ] **Step 2: `npm run tauri:build:debug` でビルドし、実アプリで以下を手動確認**（確認結果をタスク報告に含める）:
  - カラムの新着バッジ（`report_new_posts_count` = x.com 上の invoke）が動く
  - 画像クリック → ポップアップ（`open_popup_window`）が動く
  - リンクポップアップで x.com 以外の URL を開いたとき、ページ表示は正常でツールバーの invoke 系のみ無効化されている
- [ ] **Step 3: README「アーキテクチャ上の注意点」に remote capability の設計（対象ドメイン・縮退挙動）を追記**
- [ ] **Step 4: コミット** `fix(security): remote capabilityをx.com系ドメインに限定する`

**注意:** ワイルドカードのマッチング仕様が期待と異なる場合（例: `https://x.com/*` がパス付きで一致しない等）は、Tauri の `CapabilityRemote` 仕様を確認して URL パターンを調整すること。**このタスクだけは実機確認が完了条件**。Android への影響（capability はデスクトップ/モバイル共通）も `npm run tauri:android:build` で確認する。

## Task 1.4: CSP の設定（S3）

**Files:**

- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: `app.security.csp` に `"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https:"` を設定**（SCSS Modules のインライン style と GitHub API（リリースノート取得）を考慮）
- [ ] **Step 2: `npm run tauri:dev` で main UI の全機能（設定パネル・ダイアログ・更新チェック・What's New）がコンソールエラーなしで動くことを確認。CSP 違反が出た場合はディレクティブを最小限で緩める**
- [ ] **Step 3: コミット** `fix(security): mainウィンドウにCSPを設定する`

## Task 1.5: ログインポーリング終了・ログ統一（S5 + S6）

**Files:**

- Modify: `src-tauri/src/commands/account.rs`

- [ ] **Step 1: desktop ポーリングループを `notified` 後に `break` させ、開始から 10 分で打ち切るタイムアウトを追加**（mobile 側の `MAX_POLLS` と同値）
- [ ] **Step 2: mobile 実装の `println!` 8 箇所を `log::info!` / `log::warn!` に置換**（`Cargo.toml` に `log` クレートが依存済みであることを確認。無ければ tauri-plugin-log の re-export を使用）
- [ ] **Step 3: クオリティゲート → コミット** `fix: ログイン検出ポーリングの終了条件とログ出力を整える`

---

# フェーズ 2: Rust リファクタリング

## Task 2.1: カラム init script 構築の重複排除（R2）

**Files:**

- Modify: `src-tauri/src/commands/webview/column.rs`

**Interfaces:**

- Produces: `fn build_column_init_script(app: &AppHandle, column: &ColumnData, is_mobile: bool) -> String`

- [ ] **Step 1: 既存テスト（`cargo test` の column.rs テスト群）がグリーンであることを確認**（リファクタリングの網）
- [ ] **Step 2: desktop 版 `create_column_webview` の設定読み出し + `InitScriptParams` 構築（column.rs:69-91）を `build_column_init_script` へ抽出し、desktop/mobile 両実装から呼ぶ**。挙動差分は `is_mobile` のみ
- [ ] **Step 3: `cargo clippy && cargo test` グリーン → コミット** `refactor(rust): カラムinit script構築をbuild_column_init_scriptに集約する`

## Task 2.2: registry ロックの expect 統一（R5）

- [ ] **Step 1: 本番コード内の `state.registry.lock().unwrap()` を `lock().expect("registry mutex poisoned")` に統一**（テストコードは対象外）
- [ ] **Step 2: クオリティゲート → コミット** `refactor(rust): registryロックのパニックメッセージを統一する`

---

# フェーズ 3: フロントテスト拡充（T1）

## Task 3.1: useDesktopColumns の単体テスト

**Files:**

- Create: `src/hooks/useDesktopColumns.test.ts`

既存の `useColumns.test.ts` のモック構成（`@tauri-apps/api` / `services/columnWebview` の vi.mock、`useAppStore` の初期化ヘルパー）を踏襲する。**実装をなぞらず仕様をエンコードする**こと（CLAUDE.md の Linux デグレ教訓）。

- [ ] **Step 1: 以下のテストケースを Red → Green で追加**
  - `ウィンドウリサイズは100msデバウンス後に全カラムを再配置する`（vi.useFakeTimers + resize イベント発火 → resizeColumnWebview 呼び出し検証）
  - `ダイアログ表示中のウィンドウリサイズでは再配置しない`（dialogOpenRef.current = true）
  - `スクロールバー操作は1フレームに1回だけ再配置する`（rafThrottle: 同一フレーム内で handleScrollbarScroll を複数回呼び → requestAnimationFrame フラッシュ後 resizeColumnWebview が 1 回であること）
  - `restoreDesktopColumnsはカラムごとにWebViewを作成し最後に全体を再配置する`（createColumnWebview がカラム数分 + 最後に resizeColumnWebview）
  - `アカウントが見つからないカラムはWebViewを作成しない`
- [ ] **Step 2: `npm test` グリーン → コミット** `test: useDesktopColumnsの再配置・間引き仕様をテストで固定する`

## Task 3.2: useMobileColumns の単体テスト

**Files:**

- Create: `src/hooks/useMobileColumns.test.ts`

- [ ] **Step 1: 以下のテストケースを Red → Green で追加**
  - `setActiveColumnはリサイズ前にアクティブカラムのCookieを切り替える`（呼び出し順序の検証: setColumnCookies → resizeColumnWebview）
  - `restoreMobileColumnsはlocalStorageのアクティブカラムを復元する`
  - `保存されたアクティブカラムIDが存在しない場合はorder最小のカラムにフォールバックする`
  - `navigateColumnは端のカラムでは何もしない`
  - `ダイアログ表示中はnavigateColumnが無効になる`
  - `カラム切替時にswipeStateがswitchingになり400ms後に解除される`（fake timers）
- [ ] **Step 2: `npm test` グリーン → コミット** `test: useMobileColumnsのアクティブカラム管理仕様をテストで固定する`

---

# フェーズ 4: inject テスト拡充（T2）

共通パターン: `ng_word.test.ts` / `custom_css.test.ts` と同様に「IIFE を jsdom で import すると `window.__multiColumnXConfig` を読み、`window.__multiColumnX` に API を公開する」性質を利用する。ビルド構成（vite.inject.config.ts）は変更しない。**DOM セレクタ依存の薄い契約（設定フラグの有効/無効、公開 API の入出力）に限定**し、X の実 DOM 構造そのものはテストしない。

- [ ] **Task 4.1**: `auto_reload.test.ts` — `スクロール中は自動リロードをスキップする` / `設定間隔ごとにリロードを実行する` / `新着数をreport_new_posts_countで報告する`（fake timers + invoke モック）。コミット `test(inject): auto_reloadの自動更新仕様をテストで固定する`
- [ ] **Task 4.2**: `scroll_pos_restore.test.ts` — `設定が無効なら何もしない` / `写真ページから戻ったときスクロール位置を復元する`。コミット `test(inject): scroll_pos_restoreの復元仕様をテストで固定する`
- [ ] **Task 4.3**: `tab_selector.test.ts` — `指定タブ名に一致するタブをクリックする` / `一致するタブがなければ何もしない`。コミット `test(inject): tab_selectorのタブ選択仕様をテストで固定する`
- [ ] **Task 4.4**: `small_image.test.ts` + `blur_image.test.ts` — `設定幅がCSSとして適用される` / `無効時はスタイルを注入しない`（設定値 → 生成 CSS の契約）。コミット `test(inject): 画像縮小・ぼかしのCSS適用仕様をテストで固定する`
- [ ] **Task 4.5**: `scroll_event.test.ts` — `横ホイールでreport_webview_scrollを呼ぶ` / `縦ホイールでは呼ばない`。コミット `test(inject): scroll_eventの中継仕様をテストで固定する`
- [ ] **Task 4.6**（任意・低優先）: hide_ad / sidebar_hide / mobile_area_hide / context_menu / header_customizer は「フラグ無効時に何もしない」ことのみ検証する薄いテストを追加

---

# フェーズ 5: Rust テスト拡充（T3）

## Task 5.1: settings_store の純粋関数化とテスト

**Files:**

- Modify: `src-tauri/src/commands/settings_store.rs`

- [ ] **Step 1: `load_xxx(app)` 系の JSON 取り出しロジックを `fn bool_flag(settings: &serde_json::Value, key: &str, default: bool) -> bool` / `fn string_list(settings: &serde_json::Value, key: &str) -> Vec<String>` / `fn accounts_to_json(accounts: &serde_json::Value) -> String` に分離**（`load_xxx` はストア読み出し + これらの適用だけにする）
- [ ] **Step 2: テストを追加**: `キーが存在しない場合はデフォルト値を返す` / `bool以外の型はデフォルト値を返す` / `ngWordsは文字列要素のみ抽出する` / `アカウントは必須フィールドが揃ったものだけJSON化する`
- [ ] **Step 3: クオリティゲート → コミット** `test(rust): settings_storeの設定パースを純粋関数化してテストする`

## Task 5.2: parse_url / update コマンドのテスト

- [ ] **Step 1: `webview/mod.rs` の `parse_url` にテスト追加**: `httpsのURLをパースできる` / `不正なURLはエラーメッセージを返す`
- [ ] **Step 2: `update.rs` にテスト追加**（非 Android）: `Android以外ではinstall_apk_updateが未対応エラーを返す`（`tokio::test` または `futures::executor::block_on`。既存テストの async 実行方法に合わせる）
- [ ] **Step 3: クオリティゲート → コミット** `test(rust): parse_urlとinstall_apk_updateのガードをテストする`

---

# フェーズ 6: UX — アカウント操作のダイアログ化（U1）

## Task 6.1: アカウント名入力ダイアログ

**Files:**

- Create: `src/components/AccountNameDialog/AccountNameDialog.tsx` + `.module.scss` + `.test.tsx` + `.stories.tsx`（コロケーション。バレル index.ts は作らない）
- Modify: `src/hooks/useAccounts.ts`、`src/App.tsx`（または AccountManager 内に統合）

**Interfaces:**

- Produces: `<AccountNameDialog defaultValue={string} title={string} onSubmit={(name: string) => void} onCancel={() => void} />`

方針: `createAccountFromResult` の `prompt()` を廃止し、ログイン完了後に AccountNameDialog を表示 → 確定でアカウント登録する。ダイアログ表示中はカラム WebView 退避が必要（`useDialogState` に組み込み、`dialogOpen` 集約に含める）。

- [ ] **Step 1: Storybook Story を先に作成**（storybook-dev の Story-First。ダーク/ライト両テーマ確認）
- [ ] **Step 2: テストを書く**: `初期値が入力欄に表示される` / `確定でonSubmitに入力値が渡される` / `空文字ではonSubmitが呼ばれない` / `Escapeでキャンセルされる`
- [ ] **Step 3: 実装 → useAccounts の prompt 置換（フロー: invoke → イベント → ダイアログ表示 → onSubmit で addAccount + close_window）**
- [ ] **Step 4: クオリティゲート（test:story 含む）→ コミット** `feat: アカウント名入力をpromptから専用ダイアログに置き換える`

## Task 6.2: 削除確認ダイアログと AccountManager のアカウント編集

**Files:**

- Create: `src/components/ConfirmDialog/ConfirmDialog.tsx` 一式（汎用の確認ダイアログ）
- Modify: `src/components/AccountManager/AccountManager.tsx`、`src/hooks/useAccounts.ts`、`src/store/useAppStore.ts`（`updateAccount` アクション追加）

- [ ] **Step 1: ConfirmDialog を Story → テスト → 実装**（`確認メッセージが表示される` / `OKでonConfirm` / `キャンセルでonCancel`）
- [ ] **Step 2: useAccounts の `confirm()` を ConfirmDialog に置換**
- [ ] **Step 3: useAppStore に `updateAccount(id, patch: Partial<Pick<Account, "label" | "color">>)` を TDD で追加**（`アカウント名を変更できる` / `色を変更できる` / `存在しないIDは何もしない`。保存が walk through されること = save_settings 呼び出し検証）
- [ ] **Step 4: AccountManager に名前編集（インライン input）と色選択（ACCOUNT_COLORS パレット）を追加。テスト: `名前を編集して保存できる` / `色を変更できる`**
- [ ] **Step 5: クオリティゲート → コミット**（Step 単位でコミット分割可）`feat: アカウントの削除確認・名前変更・色変更をアプリ内UIで行う`

---

# フェーズ 7: UX — カラムヘッダーからの直接移動（U2 + R3）

## Task 7.1: ColumnHeader に ◀/▶ 移動ボタン

**Files:**

- Modify: `src/components/ColumnHeader/ColumnHeader.tsx` + `.test.tsx` + `.stories.tsx`、`src/App.tsx`（`handleMoveColumn` を配線）

**Interfaces:**

- Consumes: `useColumns().handleMoveColumn(columnId, "left" | "right")`（既存・未配線）

- [ ] **Step 1: テストを書く**: `左移動ボタンでonMoveがleftで呼ばれる` / `右移動ボタンでonMoveがrightで呼ばれる`（ColumnHeader は表示のみ、端の判定は store 側 moveColumn が既に no-op）
- [ ] **Step 2: 実装（既存ボタン群と同じスタイル・aria-label 付与。a11y 警告を新規に増やさない）**
- [ ] **Step 3: Story 更新 → クオリティゲート → コミット** `feat: カラムヘッダーから左右移動できるようにする`

**注:** このタスクを実施しない判断になった場合は、代わりに `handleMoveColumn` / store `moveColumn` を削除するタスクに差し替える（デッドコードを残さない）。

---

# フェーズ 8: UX — ショートカット拡充（U3）

## Task 8.1: `r` でフォーカスカラムのリロード + `?` ヘルプ

**Files:**

- Modify: `src/hooks/useKeyboardShortcuts.ts` + `.test.ts`、`src-tauri/src/inject/_src/keyboard_shortcut.ts` + `.test.ts`、`src/App.tsx`
- Create: `src/components/ShortcutHelpDialog/ShortcutHelpDialog.tsx` 一式

**重要:** ショートカット追加は **3 箇所同期**（`useKeyboardShortcuts` のキーマップ 2 箇所 + inject `keyboard_shortcut.ts` の転送対象キー）。メモリ `project_keyboard_shortcut_forwarding` と CLAUDE.md を参照。

- [ ] **Step 1: 対象カラムの定義を決める**（推奨: 最後に 1-9 ジャンプ / ヘッダー操作したカラム ID を App 側で保持。無ければ先頭カラム）— 実装前に定義をタスク報告に明記
- [ ] **Step 2: useKeyboardShortcuts のテスト追加**: `rキーでonReloadColumnが呼ばれる` / `?キーでonToggleHelpが呼ばれる` / `input要素フォーカス中は発火しない`（既存ガードの踏襲確認）
- [ ] **Step 3: inject keyboard_shortcut.ts に `r` / `?` の転送を追加 + テスト**（`rキーがreport_keyboard_shortcutで転送される` 等）→ `npm run build:inject`
- [ ] **Step 4: ShortcutHelpDialog（一覧表示のみの静的ダイアログ）を Story → テスト → 実装。dialogOpen 集約へ組み込み**
- [ ] **Step 5: クオリティゲート → コミット**（機能単位で分割）`feat: rキーのカラム更新と?キーのショートカットヘルプを追加する`

---

# フェーズ 9: AppSettingsPanel リファクタリング（R1）

## Task 9.1: ドラフト state の一本化

**Files:**

- Modify: `src/components/AppSettingsPanel/AppSettingsPanel.tsx`

- [ ] **Step 1: 既存テスト・Story がグリーンであることを確認**（挙動不変の網。テストは変更しない）
- [ ] **Step 2: 22 個の useState を `useState<SettingsDraft>`（GlobalSettings のフォーム部分集合）+ `const set = <K extends keyof SettingsDraft>(key: K, value: SettingsDraft[K]) => ...` に置換。handleSubmit / handleApplyColumnDefaults はドラフトから組み立てる**
- [ ] **Step 3: `npm test`（AppSettingsPanel.test 変更なしで pass）→ コミット** `refactor: AppSettingsPanelのフォームstateをドラフトオブジェクトに一本化する`

## Task 9.2: セクションの子コンポーネント分割

- [ ] **Step 1: フォームセクションを `GeneralSettingsSections.tsx`（同ディレクトリ）等へ抽出**（`draft` と `set` を props で渡す。1 ファイル 300 行以下を目安）
- [ ] **Step 2: テスト・Story 変更なしでグリーン → コミット** `refactor: AppSettingsPanelのセクションを子コンポーネントへ分割する`

---

# フェーズ 10: UX — 通知対象拡大（U4）・プリセットモバイル対応（U5）

## Task 10.1: カラム別「新着をデスクトップ通知」設定

**Files:**

- Modify: `src/types/index.ts`（`ColumnSettings.desktopNotifyEnabled?: boolean`）、`src/components/SettingsPanel/SettingsPanel.tsx`、`src/hooks/useWebviewEvents.ts` + `.test.ts`、`src-tauri/src/commands/settings.rs`（ColumnSettings 構造体）
- 契約: `src/types/defaults.contract.test.ts` / `src/constants/ipc.contract.test.ts` への影響確認

- [ ] **Step 1: 型 + Rust 構造体 + デフォルト値（false）を追加**（serde rename 必須。契約テストの fixture 更新）
- [ ] **Step 2: useNewPostsNotification のテスト追加**: `desktopNotifyEnabledが有効なカラムは通知される` / `無効なカラムはバッジのみ更新される` / `notificationsカラムは従来どおり通知される`（後方互換）
- [ ] **Step 3: SettingsPanel にトグル追加（テスト: `新着通知トグルが設定に反映される`）**
- [ ] **Step 4: クオリティゲート → コミット** `feat: 任意カラムの新着デスクトップ通知を設定できるようにする`

## Task 10.2: プリセットのモバイル対応（読み込みのみ）

- [ ] **Step 1: AppSettingsPanel のプリセットタブの `!isMobile` ガードを外し、モバイルでは読み込み・削除のみ表示（保存はデスクトップのグリッド前提のため非表示のまま）**
- [ ] **Step 2: モバイルでのプリセット読み込み後の WebView 再構築フロー（replaceColumns → 全 WebView 再生成）を確認・実装**
- [ ] **Step 3: テスト（`モバイルではプリセットの保存ボタンが表示されない` / `プリセット読み込みでカラムが置き換わる`）→ クオリティゲート → コミット** `feat: モバイルでプリセットを読み込めるようにする`

---

# セルフレビュー済みの注意点

- **S1（Task 1.3）は唯一「実機確認が完了条件」のタスク**。capability の remote マッチング仕様が不明確なため、ビルド検証を省略しないこと。
- フェーズ 6/8/10 は `dialogOpen` 集約（App.tsx の `anyDialogOpen`）への組み込みを忘れると「ダイアログの裏にネイティブ WebView が残る」バグになる。新規ダイアログは必ず `useDialogState` 経由にする。
- フェーズ 10 の型追加は「7 箇所配線チェーン」（メモリ `project_global_settings_inject_wiring`）に該当しない（inject まで届ける必要がない）が、TS 型 / Rust 構造体 / 契約テストの 3 点同期は必要。
- 各フェーズ完了時は `superpowers:requesting-code-review` 相当のレビューを経て main / develop へ PR する（PR 本文に `## リリースノート` セクションを含めるとリリースノートに自動反映される）。
