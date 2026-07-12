# プロジェクト全体監査（2026-07-02）

前回の全面リファクタリング（2026-06-10 計画 → 2026-06-11 完了、`docs/superpowers/plans/2026-06-10-full-refactoring.md`）以降の状態に対する監査。CI/CD・自動更新・Linux クラッシュ対策・フロントエンド品質ツール導入後のコードベースが対象。

## 基線状態（2026-07-02 時点・develop ブランチ）

すべての品質ゲートがグリーンであることを実測で確認済み:

| ゲート                                      | 結果                                                                                                        |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                         | ✅ pass                                                                                                     |
| `npm run lint`                              | ✅ pass（警告 0）                                                                                           |
| `npm test`（Vitest unit）                   | ✅ 51 ファイル / 461 件 pass                                                                                |
| `npm run test:property`（fast-check）       | ✅ pass                                                                                                     |
| `cargo clippy --all-targets -- -D warnings` | ✅ pass                                                                                                     |
| `cargo test`                                | ✅ pass                                                                                                     |
| CI（.github/workflows/ci.yml）              | prettier / lint / typecheck / build:inject / test / test:story / fmt / clippy / cargo test / Android を網羅 |

TODO / FIXME コメント: フロント 0 件、Rust 0 件。構造的な腐敗はない。以下は「壊れている」ではなく「より良くできる」項目のインベントリである。

---

## S: セキュリティ・実装上の問題（優先度順）

### S1【高】remote capability が `https://*` 全体に IPC を開放している

`src-tauri/capabilities/column-webview.json` は `windows: ["column-*", "popup-*", "compose-*", "add-account", "main"]` に対し `remote.urls: ["https://*", "http://*"]` で IPC を注入している。

- inject スクリプト（`auto_reload.ts` / `scroll_event.ts` / `image_popup.ts` 等）は x.com 上で `window.__TAURI__.core.invoke` を使うため、リモート IPC 注入自体は設計上必要。
- しかし `open_link_popup_window` は**ユーザーが入力した任意の URL** を `popup-*` ウィンドウで開くため、任意の https サイトのページ JS がアプリの全カスタムコマンドを invoke できる。
- Tauri v2 ではアプリ定義コマンドは capability で個別ゲートされないため、リモートページから `delete_account_data`（任意パス削除）、`eval_in_webview`（他アカウントのカラムで任意 JS 実行 = セッション横断）、`close_window` 等が呼べる。
- x.com 自体もリモートコンテンツであり、X 側のスクリプト変更・サプライチェーン侵害時の被害半径が「アプリの全権限」になる。

**修正方針**: (a) `remote.urls` を `https://x.com/*`・`https://*.x.com/*`・`https://twitter.com/*`・`https://*.twitter.com/*` に限定（inject 側は `if (invoke)` ガード済みのため、対象外サイトではポップアップツールバー等が段階的縮退する）。(b) 破壊的コマンド（`delete_account_data`・`eval_in_webview`・`close_window`・`create/remove/resize_column_webview`・`save_settings`）に呼び出し元ウィンドウ検証（`window.label() == "main"`）を追加する多層防御。
**注意**: capability の `remote` マッチング仕様（サブドメインパターン・パス部の扱い）は実ビルドで検証してから確定すること。

### S2【高】`delete_account_data` が任意パスを削除できる

`src-tauri/src/commands/account.rs:130` — JS から渡された `data_directory` を検証なしで `remove_dir_all` する。S1 と組み合わさると任意 https ページからの任意ディレクトリ削除になる。単体でも、main ウィンドウ側のバグ一発で任意削除が起きる構造は危険。

**修正方針**: `app_data_dir()/accounts/` 配下であることを検証する純粋関数を切り出し（canonicalize + prefix 検証、`..` 拒否）、テストファーストで実装。

### S3【中】CSP が null

`src-tauri/tauri.conf.json` の `app.security.csp: null`。main ウィンドウはローカル React UI なので、`default-src 'self'` ベースの CSP を設定して inject/XSS 経路を封じるべき（Tauri は IPC 用 nonce を自動付与する）。

### S4【中】`eval_in_webview` の呼び出し元制限がない

任意ラベル・任意スクリプトを受け付ける。S1 の多層防御として、呼び出し元が `main` ウィンドウであることを必須にする（`report_*` 系はカラムからの呼び出しが正当なので対象外）。

### S5【低】ログイン検出ポーリングが完了後も回り続ける

`account.rs:35-51`（desktop）— `notified = true` の後も 500ms ループがウィンドウクローズまで継続する。`notified` 後に `break` してよい（イベント emit 後の仕事はない）。タイムアウトも無い（mobile 側は 10 分タイムアウトあり）。

### S6【低】mobile アカウント追加が `println!` でログしている

`account.rs` mobile 実装に `println!` が 8 箇所。`tauri-plugin-log`（`log::info!` 等）へ統一する。

---

## R: リファクタリング候補（優先度順）

### R1【中】AppSettingsPanel.tsx（628 行・useState × 22）

`src/components/AppSettingsPanel/AppSettingsPanel.tsx` — 設定 22 項目がそれぞれ独立 `useState`。項目追加のたびに「state 宣言 + handleSubmit の patch + handleApplyColumnDefaults」の 3 箇所同期が必要で、追加漏れが起きやすい構造。

**方針**: フォームドラフトを単一オブジェクト state（`useState<GlobalSettingsDraft>` + フィールド更新ヘルパー）へ統合し、セクション（表示 / カラムデフォルト / ポップアップ / モバイル / NG ワード…）を子コンポーネントへ分割。既存テスト・Story を仕様の網として使う（挙動不変のリファクタリング）。

### R2【中】`create_column_webview` desktop/mobile の InitScriptParams 構築が重複

`column.rs:69-91` と `column.rs:174-196` — settings_store 読み出し 5 連発 + `InitScriptParams` 構築（約 25 行）が `is_mobile` フラグ以外完全に同一。`fn build_column_init_script(app: &AppHandle, column: &ColumnData, is_mobile: bool) -> String` へ抽出する。設定フラグを inject へ配線する際の同期箇所が 2→1 になる（メモリ済みの「7 箇所配線チェーン」の削減）。

### R3【低】`handleMoveColumn` が UI 未配線のデッドコード

`useColumns.ts:224-230` — store の `moveColumn` を包むが、どのコンポーネントからも呼ばれていない（並べ替えは ColumnLayoutTab が担当）。U2（カラムヘッダーからの直接移動）で配線するか、U2 を採用しないなら削除する。

### R4【低】ColumnLayoutTab.tsx（482 行）

グリッドエディタ部分と行/列操作ロジックの分離余地はあるが、テスト済み・単一責務なので優先度低。触る機会があれば分割。

### R5【低】`registry.lock().unwrap()` の poisoning パニック

本番コード 5 箇所前後。実害はほぼ無い（poisoning 時は再起動が正しい）ため、`expect("registry mutex poisoned")` へのメッセージ統一のみで十分。

### 非推奨事項（やらないこと）

- App.tsx（550 行）の分割: ハンドラは各フックへ委譲済みで、残りは配線と JSX。これ以上の分割は間接化のコストが上回る。
- `.steering` / `aidlc-docs` の再編: 2026-06 にユーザー判断で現状維持と決定済み。

---

## T: テストの不足（優先度順）

### T1【高】useDesktopColumns / useMobileColumns の直接テストがない

`src/hooks/useDesktopColumns.ts`（169 行）/ `useMobileColumns.ts`（174 行）は `useColumns.test.ts` のファサード経由で一部しか通らない。未検証の重要挙動:

- リサイズ 100ms デバウンス・ダイアログ表示中のリサイズ無視（`dialogOpenRef`）
- スクロール → rafThrottle 経由の再配置（クラッシュ予防の要。デグレると Linux クラッシュが再発する）
- `restoreMobileColumns` の localStorage 復元（保存 ID が消えたカラムを指す場合のフォールバック）
- `navigateColumn` の端カラムでの no-op・ダイアログ中の抑止

### T2【中】inject スクリプト 11 モジュールが未テスト

テスト有: custom_css, ng_word, keyboard_shortcut, popup_toolbar, image_popup, popup_video_autoplay, video_control。
**未テスト**: auto_reload, blur_image, context_menu, header_customizer(+useHeaderCustomizer), hide_ad, mobile_area_hide, scroll_event, scroll_pos_restore, sidebar_hide, small_image, tab_selector。

優先順: **auto_reload**（スクロール中スキップ・カウントダウン・新着数報告のロジック密度が最大）→ **scroll_pos_restore** → **tab_selector** → **small_image / blur_image**（設定値の CSS 反映）→ 残り。既存の「IIFE を jsdom で import して `window.__multiColumnX` API を検証する」パターン（`ng_word.test.ts` 参照）を踏襲する。X の実 DOM 依存が強いモジュール（hide_ad, sidebar_hide, mobile_area_hide）はセレクタ変更で壊れやすいため、ユニットテストは「設定フラグでの有効/無効切替」など安定した契約に限定する。

### T3【中】Rust 未テストモジュール

テスト有: state.rs, ipc_constants.rs, settings.rs, popup.rs, column.rs, inject/mod.rs。
**未テスト**: account.rs, settings_store.rs, compose.rs, update.rs, webview/mod.rs（`parse_url`）。

- settings_store.rs: store 依存を剥がし、`serde_json::Value` を受ける純粋関数（`parse_bool_flag(value, key, default)` 等）へ分離してテスト。
- S2 のパス検証関数は新規テスト必須（テストファースト）。
- account.rs のウィンドウ生成・ポーリングは統合的で費用対効果が低い — スコープ外とし、純関数化できる部分（ラベル生成・パス構築）のみ。

### T4【低】Kotlin

主要ロジックはテスト済み（8 テストファイル）。AddAccount.kt / AppBridge.kt は Activity/JNI 依存で単体テスト対象外が妥当。現状維持。

---

## U: UX・機能拡張候補（推奨順）

### U1【高】`prompt()` / `confirm()` の廃止とアカウント編集機能

`useAccounts.ts` がアカウント名入力に `window.prompt`、削除確認に `window.confirm` を使用。WebView 実装によっては `prompt` が動作しない（WKWebView は未実装、Android は ChromeClient 依存）うえ、スタイルも統一できない。既存ダイアログ（AddColumnDialog 等）と同じ React ダイアログへ置換し、あわせて **AccountManager にアカウント名変更・色変更**（現状作成後に変更不可）を追加する。

### U2【中】カラムヘッダーからの直接並べ替え

現状カラムの並べ替えは アプリ設定 > カラム配置タブ でしかできない。ColumnHeader に ◀/▶ 移動ボタン（またはヘッダー D&D）を追加し、未配線の `handleMoveColumn`（R3）を活用する。TweetDeck 系クライアントの定番操作。

### U3【中】キーボードショートカット拡充

既存: 投稿 / リンクポップアップ / カラム追加 / アカウント管理 / 設定 / TopBar 開閉 / カラム 1-9 ジャンプ。追加候補:

- `r`: フォーカス中（最後にジャンプした）カラムのタイムライン更新
- `?`: ショートカット一覧のヘルプオーバーレイ
- 追加時は CLAUDE.md 記載の 3 箇所同期（useKeyboardShortcuts × 2 + inject keyboard_shortcut.ts）を厳守。

### U4【中】新着デスクトップ通知の対象カラム拡大

現在デスクトップ通知は `pageType === "notifications"` のカラムのみ（`useWebviewEvents.ts`）。カラム設定に「新着をデスクトップ通知」トグルを追加し、検索・リストカラムの監視用途に対応する。

### U5【低】プリセットのモバイル対応

PresetsTab が `!isMobile` 限定。モバイルでもプリセット切替（読み込みのみでも）できると複数レイアウト運用が可能になる。

### U6【低・提案のみ】i18n

UI 文言は日本語ハードコード。国際化はコスト大のため、需要が出るまで着手しない。

---

## D: ドキュメントの陳腐化（本セッションで修正）

| #   | 箇所                                 | 問題                                                                                                                                                                                                                                                                 |
| --- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | README「機能」                       | 「サイドバーからツイート作成」— サイドバーは TopBar に置換済み。キーボードショートカット・テーマ・NG ワード・プリセット・新着バッジ・アプリ自動更新・What's New・スワイプバー・クラッシュ自動復旧が未記載                                                            |
| D2  | README「外部 WebView での IPC 不可」 | **現状と矛盾**。capability の remote 設定で IPC は注入されており、inject スクリプトは invoke を多用している。ログインウィンドウ（add-account、URL ポーリング）の経緯説明として書き直す必要                                                                           |
| D3  | README コマンド一覧 / 構成図         | `install_apk_update` 欠落。inject `_src` 一覧に ng_word / blur_image / small_image / hide_ad / keyboard_shortcut / mobile_area_hide / popup_video_autoplay / scroll_pos_restore / sidebar_hide 欠落。Kotlin 一覧に PopupGestureBlock.kt / PopupSessionBridge.kt 欠落 |
| D4  | README「テスト」                     | `npm test` のみ記載。品質ゲート一式（lint / typecheck / property / story / clippy / cargo test）へ更新                                                                                                                                                               |

---

## 実行計画への参照

上記の対応順序・タスク分割・TDD 手順は `aidlc-docs/construction/plans/2026-07-02-improvement-plan.md` に定義。実装は sonnet5 サブエージェントに委譲する前提でタスクを自己完結に分割してある。
