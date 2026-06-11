# 現状アーキテクチャドキュメント（2026-06-10 時点）

リファクタリング計画の前提となる、コードベースの現状構造・依存関係・問題点の棚卸し。

> **2026-06-11 追記**: 全面リファクタリング（`docs/superpowers/plans/2026-06-10-full-refactoring.md`）の Phase 0〜6 が完了。
> 「5. 問題点インベントリ」の各項目に解消状況を追記した。行数・構造の記述は 2026-06-10 時点のスナップショットであり、
> 現在の構造は `README.md` のプロジェクト構成を参照。

## 1. システム全体像

Multi Column X は「メイン WebView（React UI シェル）+ カラムごとのネイティブ WebView（x.com 表示）」という二層 WebView 構成の Tauri v2 アプリ。

```
+----------------------------------------------------------------------+
|  メインウィンドウ                                                      |
|  +----------------------------------------------------------------+  |
|  | React メイン WebView (src/)                                     |  |
|  |  TopBar / MobileTabBar / ColumnHeader / 各種ダイアログ            |  |
|  +----------------------------------------------------------------+  |
|  +-----------+ +-----------+ +-----------+                          |
|  | column-A  | | column-B  | | column-C  |  ← x.com を表示する        |
|  | WebView   | | WebView   | | WebView   |    ネイティブ WebView      |
|  | (inject済)| | (inject済)| | (inject済)|    (z-index 無効)         |
|  +-----------+ +-----------+ +-----------+                          |
+----------------------------------------------------------------------+

           ↑ invoke / emit (Tauri IPC)
+----------------------------------------------------------------------+
| Rust バックエンド (src-tauri/src/)                                     |
|  lib.rs → commands/{settings,webview,account}.rs                     |
|  inject/mod.rs (init script 組み立て)                                 |
|  state.rs (WebView レジストリ)                                        |
+----------------------------------------------------------------------+
           ↑ JNI (Android のみ)
+----------------------------------------------------------------------+
| Kotlin (src-tauri/gen/android/.../multicolumnx/)                     |
|  MainActivity.kt (カラム/ポップアップ WebView 管理・ジェスチャー)        |
|  AddAccount.kt (ログインActivity) / AppBridge.kt (JNI 窓口)           |
+----------------------------------------------------------------------+
```

### プラットフォーム別のカラム WebView 実装

| プラットフォーム | 実装                                                             | 該当コード                                      |
| ---------------- | ---------------------------------------------------------------- | ----------------------------------------------- |
| Windows / macOS  | `window.add_child()` の子 WebView                                | `webview.rs` `#[cfg(not(target_os = "linux"))]` |
| Linux            | 独立した undecorated WebviewWindow                               | `webview.rs` `#[cfg(target_os = "linux")]`      |
| Android          | ネイティブ Android WebView を content FrameLayout にオーバーレイ | `android_bridge.rs` → JNI → `MainActivity.kt`   |

## 2. レイヤー構成と主要ファイル

### 2.1 React フロントエンド（src/）

| ファイル                        | 行数   | 責務                                                                                                           |
| ------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------- |
| `App.tsx`                       | 476    | ルート。ダイアログ表示制御、IPC イベント listen、各種ハンドラ、WebView 退避制御                                |
| `hooks/useColumns.ts`           | 576    | グリッド座標計算（純関数）、WebView 作成/リサイズ/削除 IPC、モバイルのアクティブカラム・スワイプ、リサイズ監視 |
| `hooks/useAccounts.ts`          | 153    | アカウント追加（desktop/mobile で別フロー）・削除                                                              |
| `hooks/useDialogState.ts`       | 60     | ダイアログ開閉 state 集約                                                                                      |
| `hooks/useKeyboardShortcuts.ts` | 96     | キーボードショートカット                                                                                       |
| `hooks/useAutoReload.ts`        | 70     | 自動更新カウントダウン                                                                                         |
| `store/useAppStore.ts`          | 170    | Zustand。accounts/columns/globalSettings の CRUD + 永続化（全 mutation で saveSettings）                       |
| `types/index.ts`                | 217    | 型定義 + デフォルト値 + URL/ラベル解決ヘルパー                                                                 |
| `constants/ipc.ts`              | 121    | IPC コマンド/イベント/ラベル/eval スクリプト定数                                                               |
| `components/*`                  | ~2,000 | 機能別フォルダ（コンポーネント + scss + テスト）                                                               |

### 2.2 Rust バックエンド（src-tauri/src/）

| ファイル               | 行数 | 責務                                                                                                                                                        |
| ---------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `commands/webview.rs`  | 777  | カラム WebView CRUD、ポップアップ/コンポーズウィンドウ、設定読み出しヘルパー群、eval、イベント中継。desktop/mobile/linux/android の 4 通りの cfg 分岐が同居 |
| `commands/settings.rs` | 316  | 設定データ構造（serde）+ load/save + デフォルト値                                                                                                           |
| `commands/account.rs`  | 201  | アカウント追加ウィンドウ（desktop: URL ポーリング / mobile: センチネルファイル）                                                                            |
| `android_bridge.rs`    | 366  | JNI 双方向ブリッジ（Rust→Kotlin メソッド呼び出し、Kotlin→Rust イベント emit）                                                                               |
| `inject/mod.rs`        | 273  | init script 組み立て（include_str! で .js を埋め込み）                                                                                                      |
| `lib.rs`               | 154  | Tauri ビルダー、コマンド登録、ウィンドウ位置復元                                                                                                            |
| `state.rs`             | 60   | WebView ラベル → columnId/accountId/dataDirectory のレジストリ                                                                                              |
| `ipc_constants.rs`     | 59   | イベント名/ラベル/グローバル変数名定数                                                                                                                      |

### 2.3 inject スクリプト（src-tauri/src/inject/）

- `_src/*.ts` が TypeScript ソース。`vite.inject.config.ts` で `inject/*.js` にバンドル（**ビルド成果物は gitignore、`keyboard_shortcut.js` のみ手書き JS として直接管理**という例外あり）。
- `header_customizer.js` は React 同梱 IIFE バンドル（約 600KB）。
- `mod.rs` の `build_init_script()` がフラグに応じて文字列連結し、WebView 作成時に注入する。

### 2.4 Kotlin（src-tauri/gen/android/）

| ファイル          | 行数 | 責務                                                                                                                                  |
| ----------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `MainActivity.kt` | 550  | カラム/ポップアップ WebView の生成・表示切替・Cookie/Profile 管理、ブーメランジェスチャー状態機械、ダブルタップ検出、バックボタン処理 |
| `AddAccount.kt`   | 181  | ログイン用 Activity。URL ポーリング → センチネルファイル書き込み                                                                      |
| `AppBridge.kt`    | 56   | JNI external 関数宣言（Rust 側 `android_bridge.rs` と対）                                                                             |
| `generated/*`     | —    | tauri/wry 生成コード（RustWebChromeClient.kt は手パッチあり）                                                                         |

## 3. 主要データフロー

### 設定の永続化

```
Zustand mutation → saveSettings() → invoke("save_settings") → tauri-plugin-store (settings.json)
起動時: loadSettings() → invoke("load_settings") → serde デシリアライズ（デフォルト値補完）
```

Rust 側コマンド（webview.rs のヘルパー群）も同じ settings.json を **store 経由で直接読む**ため、設定のスキーマ知識が TS / Rust 双方に存在する。

### カラム WebView のライフサイクル

```
restoreColumns (App.tsx isLoaded 後)
  → calculateGridBounds (デスクトップ) / アクティブカラムのみ表示 (モバイル)
  → invoke("create_column_webview") → init script 組み立て → プラットフォーム別生成
ダイアログ表示中: hideColumnWebviews() で画面外退避（z-index 不可のため）
```

### Android JNI 双方向

```
Rust → Kotlin: android_bridge::call_activity_method → env.call_method(文字列指定)
                ※ proguard-rules.pro の keep ルールと手動同期（壊すとリリースビルドのみクラッシュ）
Kotlin → Rust: AppBridge.onSwipeNavigate 等 → #[no_mangle] JNI fn → app.emit → React listen
```

## 4. テスト・ビルドの現状（2026-06-10 計測）

| 項目                  | 状態                                                                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test` (Vitest)   | **179 件中 1 件失敗**（`SettingsPanel.test.tsx`「再読み込みボタンで onClose が呼ばれない」期待が実装と不一致）                                 |
| `cargo check --tests` | **コンパイルエラー**。`inject/mod.rs` のテストが削除済みフィールド `zoom_level` を参照（zoom 機能を columnScale に置き換えた際にテスト未更新） |
| cargo 警告            | 未使用変数 2 件、デスクトップビルドで dead な `load_use_x_app_for_compose`                                                                     |
| CI                    | なし（テスト・lint の自動実行なし）                                                                                                            |
| Kotlin テスト         | `MainActivityTest.kt`（72 行）のみ                                                                                                             |

## 5. 問題点インベントリ

### A. 壊れているもの（最優先）

| #   | 内容                                                                                                               | 場所                        |
| --- | ------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| A1  | Rust テストがコンパイル不能（`zoom_level` 残骸）✅ Phase 0 で解消                                                  | `inject/mod.rs:164,212`     |
| A2  | Vitest 1 件失敗（仕様とテストの不一致）✅ Phase 0 で解消                                                           | `SettingsPanel.test.tsx:70` |
| A3  | CI 不在のため A1/A2 が長期間検出されなかった ✅ Phase 0 で解消（vitest/cargo test/フォーマットチェックの CI 導入） | —                           |

### B. デッドコード

| #   | 内容                                                                                                                                                                                                 | 場所                                                      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| B1  | IPC コマンド `notify_account_logged_in` / `mark_login_complete` / `check_login_complete` と `LoginCompleteFlag` state。呼び出し元ゼロ（Android はセンチネルファイル方式に移行済み）✅ Phase 1 で解消 | `account.rs:140-203`, `lib.rs:64,150-152`, `ipc.ts:32-34` |
| B2  | `getMobileInsets()`：エクスポートされているが呼び出し元ゼロ。内部で生文字列 invoke ✅ Phase 1 で解消                                                                                                 | `useColumns.ts:29-59`                                     |
| B3  | `src/lib/logger.ts`：plugin-log の再エクスポートのみ、import 元ゼロ ✅ Phase 1 で解消（Phase 6 で文脈名付き `log.ts` として再導入）                                                                  | `src/lib/logger.ts`                                       |
| B4  | `zoom.ts` / `zoom.js`：ビルドエントリに残るが `mod.rs` はもう include しない（columnScale 方式に移行済み）✅ Phase 1 で解消                                                                          | `_src/zoom.ts`, `vite.inject.config.ts:23`                |
| B5  | `window_fullscreen.js` / `assets/constants-DF8PymUN.js` / `tauri.svg` / `vite.svg`：ソースなし・参照なしの残骸 ✅ Phase 1 で解消                                                                     | `src-tauri/src/inject/`                                   |
| B6  | `load_use_x_app_for_compose`：desktop ビルドで dead（cfg 漏れ）✅ Phase 0 で解消（cargo 警告解消の一環）                                                                                             | `webview.rs:393`                                          |
| B7  | `uuid` パッケージ + `@types/uuid`：使用箇所は AddColumnDialog の 1 か所のみ（他は `crypto.randomUUID()`）✅ Phase 1 で解消                                                                           | `package.json`, `AddColumnDialog.tsx:2`                   |

### C. 二重実装・ドリフト（TS ↔ Rust ↔ Kotlin）

| #   | 内容                                                                                                                                                                                                                                | 場所                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| C1  | デフォルト設定値が TS（`DEFAULT_COLUMN_SETTINGS`/`DEFAULT_GLOBAL_SETTINGS`）と Rust（serde default + `impl Default`）に二重定義。コメントによる手動同期規約のみで、自動検証なし ✅ Phase 4 で解消（ドリフト検出の契約テストを追加） | `types/index.ts:111-183`, `settings.rs:58-132`    |
| C2  | カラム URL 解決が二重実装、かつ**既にドリフト**：Rust `resolve_url` は `home_tab_name` をクエリに付与するが TS `resolveColumnUrl` は付与しない ✅ Phase 1 で解消（本番未使用の TS 側を削除）                                        | `webview.rs:20-41`, `types/index.ts:217-230`      |
| C3  | ページ種別ラベル変換が再び二重化（過去のリファクタリングで共通化した `getPageTypeLabel` があるのに `ColumnLayoutTab.getPageLabel` が別実装）✅ Phase 2 で解消                                                                       | `types/index.ts:198`, `ColumnLayoutTab.tsx:23-36` |
| C4  | IPC 定数が TS/Rust に二重定義（設計上の判断だが、整合性の自動検証なし）— スコープ外（コード生成は別プラン。現状維持と判断）                                                                                                         | `ipc.ts`, `ipc_constants.rs`                      |
| C5  | `types/index.ts` のフィールド対応表コメントに削除済みの `zoomLevel` 行が残存 ✅ Phase 1 で解消                                                                                                                                      | `types/index.ts:157`                              |

### D. マジック値・命名の負債

| #   | 内容                                                                                                                               | 場所                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| D1  | `invoke("create_column_webview")` 生文字列（`IPC_COMMANDS` 不使用の取りこぼし）✅ Phase 2 で解消                                   | `useColumns.ts:427`                          |
| D2  | 画面外退避座標 `-99999`（モバイル）/ `-9999`（デスクトップ）がリテラル散在 ✅ Phase 2 で解消                                       | `useColumns.ts:212,287,398,443,450`          |
| D3  | Rust 側のラベル定数取りこぼし：`eval_in_webview` の `"column-"`、`switch_popup_session` の `format!("popup-{}")` ✅ Phase 4 で解消 | `webview.rs:675,730`                         |
| D4  | `"main"` ウィンドウラベルのリテラルが Rust 全域に散在 ✅ Phase 4 で解消                                                            | `webview.rs`, `lib.rs`                       |
| D5  | 旧プロジェクト名 "twitter-viewer" 由来の `__tvAccounts` 等のグローバル変数名 ✅ Phase 4 で解消（`__mcx*` に改名）                  | `ipc_constants.rs:52-58`, `popup_toolbar.ts` |
| D6  | localStorage キー `"mcx_activeColumnId"` がリテラル散在 ✅ Phase 2 で解消                                                          | `useColumns.ts:191,270,299`                  |

### E. 構造的な問題（大きいファイル・責務の混在）

| #   | 内容                                                                                                                                                                                                                                                                                                                                                            | 場所                                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| E1  | `webview.rs`（777 行）：カラム/ポップアップ/コンポーズ/設定読み出し/イベント中継が 1 ファイル。ポップアップ系 5 コマンドで `load_accounts_json` + `load_popup_esc_close_enabled` + `build_popup_init_script` + ラベル生成のボイラープレートが反復 ✅ Phase 4 で解消（`settings_store.rs` 抽出・`build_popup_init` 集約・`webview/{column,popup,compose}` 分割） | `webview.rs`                              |
| E2  | `useColumns.ts`（576 行）：純関数のレイアウト計算、IPC オーケストレーション、モバイル専用 state（アクティブカラム・スワイプ）、グローバルイベント listen が混在 ✅ Phase 3 で解消（`lib/gridLayout.ts`・`services/columnWebview.ts`・`useMobileColumns`/`useDesktopColumns` に分割）                                                                            | `useColumns.ts`                           |
| E3  | `App.tsx`（476 行）：listen effect 4 つ + ハンドラ 15 個 + 7 ダイアログのレンダリングが同居 ✅ Phase 3 で一部解消（listen を `useWebviewEvents` へ抽出。ハンドラ・ダイアログ群は許容範囲として残置）                                                                                                                                                            | `App.tsx`                                 |
| E4  | `MainActivity.kt`（550 行）：WebView 管理 + Cookie/Profile + ジェスチャー状態機械（~120 行）+ ダブルタップ検出が 1 クラス。Profile API サポート判定の try/catch が 3 回重複 ✅ Phase 5 で解消（`WebViewProfiles`・`BoomerangGestureDetector` 抽出・`newConfiguredWebView` 集約）                                                                                | `MainActivity.kt:268-273,347-352,454-459` |
| E5  | `handleApplySettings` が 4 回の `eval_in_webview` を直列 invoke（スクリプト適用の抽象化なし）✅ Phase 3 で解消（`applyColumnSettingsScripts` に集約）                                                                                                                                                                                                           | `App.tsx:244-268`                         |
| E6  | エラー処理が `.catch(console.error)` / `.catch(() => {})` の散在（約 30 か所）。ロガー基盤（plugin-log）は導入済みなのに未使用（B3）✅ Phase 6 で解消（文脈名付き `logError` に統一。意図的な握りつぶしは現状維持）                                                                                                                                             | TS 全域                                   |

### F. ドキュメント・リポジトリ衛生

| #   | 内容                                                                                                                                                                                                                                                                                 | 場所                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| F1  | **`CALUDE.md` がファイル名 typo**（正: `CLAUDE.md`）。このためエージェントのプロジェクトメモリとして機能していない ✅ Phase 1 で解消                                                                                                                                                 | リポジトリルート                |
| F2  | inject ビルド成果物の管理方針が矛盾：CALUDE.md「リポジトリ管理対象」 vs README/.gitignore「管理対象外」（実態は gitignore + `keyboard_shortcut.js` のみ追跡）✅ Phase 1 で解消（`keyboard_shortcut.ts` を TS ソース化）                                                              | `CALUDE.md:53`, `README.md:177` |
| F3  | README のプロジェクト構成が古い：存在しない `Sidebar/` 記載、`TopBar`/`TabActionDialog`/`LinkPopupDialog`/`constants/`/`android_bridge.rs`/Kotlin 層の記載なし。モバイルのカラム実装説明も旧方式（WebviewWindowBuilder）のまま ✅ Phase 1 で解消（Phase 6 で 3〜5 の構造変更も反映） | `README.md:82-128,168-173`      |
| F4  | `account.rs` のコメントが存在しないフロー（visibilitychange → check_login_complete）を案内 ✅ Phase 1 で解消                                                                                                                                                                         | `account.rs:160`                |
| F5  | 完了済み `REFACTORING_PLAN.md` がルートに残存 ✅ Phase 1 で解消                                                                                                                                                                                                                      | リポジトリルート                |
| F6  | `.steering/` / `aidlc-docs/` は別ワークフロー（AIDLC）の資材で、現在の開発フロー（superpowers）と二重化 — スコープ外（開発ワークフローの選択はユーザー判断）                                                                                                                         | `.steering/`, `aidlc-docs/`     |

### G. テストの空白地帯

- `App.tsx`・`useAccounts.ts`・`useAutoReload.ts`・`LinkPopupDialog` にテストなし ✅ Phase 6 で一部解消（`useAccounts`・`LinkPopupDialog` のテストを追加。`App.tsx`・`useAutoReload.ts` は未対応）
- Rust は `settings.rs` / `inject/mod.rs` のみ（後者は壊れている）。`webview.rs` の純粋ロジック（`resolve_url`, `webview_label`, `get_popup_bounds`）にテストなし ✅ Phase 4 で一部解消（`resolve_url` 等のテストと TS/Rust デフォルト設定の契約テストを追加。`get_popup_bounds` は未対応）
- inject スクリプト（`_src/*.ts`）は全てテストなし — 未対応（inject アーキテクチャ再設計が必要なためスコープ外）
- Kotlin は `MainActivityTest.kt` のみ（ジェスチャー状態機械はテスト不能な形で Activity に埋め込み）✅ Phase 5 で解消（`BoomerangGestureDetector` 抽出 + 特性テスト 11 件）

## 6. 制約（リファクタリング時に壊してはいけないもの）

1. **JNI シグネチャ同期**: `MainActivity.kt` のメソッドを変更したら `android_bridge.rs` の `call_method` 文字列と `proguard-rules.pro` を必ず同時更新。デバッグビルドでは症状が出ない。
2. **effect 順序**: `App.tsx` で `setIsMobile` は `loadSettings` より先に同期完了が必要。
3. **serde rename**: Tauri v2 は JS→Rust のケース変換をしないため `#[serde(rename)]` 必須。
4. **z-index 回避**: ダイアログ表示中の `hideColumnWebviews()` → 閉時 `recalculateAllBounds()` のフローは仕様。
5. **モバイルの Cookie 切替順序**: `set_column_cookies` は `resize_column_webview` より先に呼ぶ。
6. **inject ビルド**: `_src` 変更後は `npm run build:inject` が必要（`.js` 直接編集禁止、例外は `keyboard_shortcut.js` — これ自体が解消対象）。
