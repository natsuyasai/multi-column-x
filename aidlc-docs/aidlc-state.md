# aidlc-state: 改善計画の実行状態

最終更新: 2026-07-03（このファイルはウェーブの起動・完了・検証のたびに必ず更新すること）

## 参照ドキュメント

- 監査（問題インベントリ S/R/T/U/D）: `aidlc-docs/inception/reverse-engineering/2026-07-02-project-audit.md`
- 実行計画（10 フェーズ・タスク詳細）: `aidlc-docs/construction/plans/2026-07-02-improvement-plan.md`
- どちらもブランチ `docs/project-audit-2026-07` に存在。**PR #26** で develop へレビュー中

## 実行方式

- 各フェーズ = 1 ブランチ = sonnet サブエージェント（worktree 分離）で実行
- ファイル競合しないフェーズのみ並列化（ウェーブ方式）
- サブエージェントの worktree は `main` から作成される点に注意（計画ドキュメントが無いため、起動後に 2 ドキュメントを worktree へコピーして渡している。`docs/project-audit-2026-07` を develop / main へマージすれば不要になる）

## フェーズ進捗

| フェーズ | 内容                                                        | ブランチ                      | 状態                                                                                                                                                                                                                                   |
| -------- | ----------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| 1        | セキュリティ強化（S2→S4→S1→S3→S5/S6）                       | `fix/security-hardening`      | ✅ コード完了・自動ゲート検証済み（bde83b9〜1668db2 の5コミット。cargo test 57件・Vitest 461件をメイン側で再検証済み）。**実機手動確認のみ未了**（下記チェックリスト）。**PR #27**                                                     |
| 3        | useDesktopColumns / useMobileColumns テスト                 | `test/desktop-mobile-columns` | ✅ 完了・検証済み（a8b9971, b021085。テスト11件追加、Vitest 472件、プロダクトコード変更なしを差分確認済み。**PR #28**）                                                                                                                |
| 4        | inject スクリプトテスト                                     | `test/inject-scripts`         | ✅ 完了・検証済み（8127536〜baeb87e の6コミット。テスト31件追加、Vitest 492件、テストファイル7件のみの差分を確認済み。**PR #29**）                                                                                                     |
| 2        | Rust リファクタ（R2 init script 重複 / R5 lock expect）     | `refactor/rust-column-init`   | ✅ 完了・検証済み（a541ac2, 94f392b。column.rs/popup.rs のみの差分で net -16 行、cargo test 57件不変を確認。**PR #30**（#27へのスタック））                                                                                            |
| 5        | Rust テスト（settings_store 純関数化 / parse_url / update） | `test/rust-settings-store`    | ✅ 完了・検証済み（5018ede, 0c2e7b5。テスト9件追加で計66件、許可3ファイルのみの差分を確認、メイン側で cargo test 再検証済み。**PR #31**（#27へのスタック））                                                                           |
| 9        | AppSettingsPanel リファクタ（R1）                           | `refactor/app-settings-panel` | 🔄 実行中（Task 9.1 は 93b384b でコミット済み。低速化した初代エージェントをユーザーが停止 → 2026-07-04 に新エージェントが既存 worktree を引き継いで Task 9.2 の残り＝セクション4ファイルの AppSettingsPanel.tsx への組み込みを実施中） |
| 6        | アカウント操作のダイアログ化（U1）                          | `feat/account-dialogs`        | ✅ 完了・検証済み（f2929cc, ea189e0。ダイアログ2種+アカウント編集、テスト26件追加、Vitest 481件を再検証済み。**PR #32**。実機確認未了）                                                                                                |     |
| 7        | カラムヘッダー直接移動（U2+R3）                             | `feat/column-header-move`     | ✅ 完了・検証済み（228fe84。テスト2件追加、Vitest 482件を再検証済み、差分4ファイルのみ。**PR #33**（#32へのスタック））                                                                                                                |     |
| 8        | ショートカット拡充 r/?（U3）                                | `feat/shortcut-reload-help`   | ✅ 完了・検証済み（a19f9d3, fee26d0。テスト27件追加、Vitest 505件を再検証済み、3箇所同期実施。**PR #34**（#33へのスタック））                                                                                                          |
| 10       | 通知対象拡大（U4）/ プリセットモバイル（U5）                | `feat/notify-any-column`      | ✅ Task 10.1 完了・検証済み（fe1d3e3, 6a7e709, 42e8812。テスト7件追加、Vitest 467件・cargo test 58件を再検証済み。**PR #36**（#27へのスタック））。⏳ Task 10.2（プリセットモバイル）はフェーズ9完了待ち                               |

凡例: ✅ 完了・検証済み / 🔄 実行中 / ⏳ 待機 / ❌ 失敗・要対応

## PR 一覧（スタック関係に注意）

| PR  | 内容                                                    | base                       | マージ順                                 |
| --- | ------------------------------------------------------- | -------------------------- | ---------------------------------------- |
| #26 | 監査・計画・README 現行化（docs/project-audit-2026-07） | develop                    | いつでも可                               |
| #27 | フェーズ1 セキュリティ強化                              | develop                    | 実機確認後、最優先                       |
| #28 | フェーズ3 フックテスト                                  | develop                    | いつでも可                               |
| #29 | フェーズ4 inject テスト                                 | develop                    | いつでも可                               |
| #30 | フェーズ2 Rust リファクタ                               | **fix/security-hardening** | #27 の後（マージ後 develop へ retarget） |
| #31 | フェーズ5 Rust テスト                                   | **fix/security-hardening** | #27 の後（マージ後 develop へ retarget） |

**CI 状況（2026-07-03 確認）: PR #26〜#34 すべて frontend / rust / android の 3 ジョブがグリーン**（Ubuntu 上の Linux 固有コード・prettier・test:story・Android ビルドを含む）。

#30 と #31 は相互に独立だが、どちらも #27 に積んである。フェーズ 6〜10 は完了・検証のたびに同様に PR を作成する（6→7→8 はスタック予定）。

## ウェーブ完了時の検証手順（メインセッションの仕事）

1. エージェントの最終報告を確認（コミットハッシュ・ゲート結果・逸脱）
2. 対象ブランチで `git log --oneline` と差分確認、必要なら worktree で品質ゲートを再実行
3. 問題なければこの表を ✅ に更新し、次ウェーブを起動
4. 計画ドキュメント（aidlc-docs の 2 ファイル）が誤ってコミットされていないか確認

## 未処理の手動確認（ユーザー依頼事項）

- [ ] フェーズ1 Task 1.3（capability の x.com 限定）: 実機で「新着バッジ」「画像ポップアップ」「x.com 以外のリンクポップアップの縮退」を確認（計画書 Task 1.3 Step 2 のチェックリスト）
- [ ] フェーズ1 Task 1.4（CSP）: `npm run tauri:dev` で main UI 全機能がコンソールエラーなしで動くこと
- [ ] フェーズ1 Task 1.2: カラム再読み込み（⟳）・自動リロードが main 呼び出しで正常動作すること（実機）
- [ ] PR #26〜#32 のレビューとマージ（順序は PR 一覧参照）
- [ ] フェーズ6: アカウント追加（実ログイン→名前ダイアログ）・削除確認・名前/色変更の実機確認（desktop / Android）

## 既知の環境問題（トラブルシューティング）

- **`generate_context!` の「trailing comma」proc-macro panic**（clippy / cargo test --doc で発生）: worktree の `src-tauri/target/debug/build/multicolumnx-*` 生成物が並行ビルドで破損することがある。ソースの問題ではなく、該当ディレクトリを削除して再ビルドで解消（フェーズ1で2回発生・解消済み）。
- 各 worktree には `src-tauri/gen/android/gradlew.bat` の改行差分が最初から出る。コミットに含めないこと。

## セッション再開手順（新しいセッションで続きから）

1. このファイルと上記 2 参照ドキュメントを読む
2. `git worktree list` と `git branch -a` で実行中/完了のブランチ状態を確認（worktree が残っていればエージェント実行中の可能性。各ブランチの `git log --oneline main..<branch>` でコミット有無を確認）
3. 実行中エージェントが消えている場合: ブランチのコミット内容から到達点を判定し、残タスクを新エージェントで再開（計画書の該当フェーズのチェックボックス参照）
4. 次ウェーブの起動は下記テンプレートを使用

### サブエージェント起動プロンプトのテンプレート

各エージェントには以下を必ず含める（ウェーブ1で実績あり）:

- 最初に `CLAUDE.md` → 計画書の「グローバル制約」+ 該当フェーズ → 監査ドキュメントの該当項目を読む
- worktree が main 起点で計画ドキュメントが無い場合はメインリポジトリからコピーして渡す（起動後に `.claude/worktrees/<agent>/aidlc-docs/...` へ cp）
- `git checkout -b <フェーズのブランチ名>` → `npm ci`（worktree に node_modules が無い）
- プロダクトコード変更の可否（テスト系フェーズは変更禁止・報告のみ）
- 完了条件: lint / typecheck / npm test（Rust 変更時は cargo fmt / clippy -D warnings / cargo test）オールグリーン、タスク毎コミット（Conventional Commits + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`）
- 最終報告: 実施タスクとコミットハッシュ / ゲート結果 / 手動確認項目 / 逸脱・発見事項

## マージ戦略（全ウェーブ完了後）

各フェーズブランチは main（4375e26）起点。推奨順: フェーズ1 → 2 → 5（Rust 系はこの順で rebase/merge、webview/mod.rs・column.rs の競合を最小化）→ 3 / 4（テスト追加のみ、順不同）→ 6 / 7 / 8（App.tsx 競合は後着 rebase で解消）→ 9 → 10。PR 本文には `## リリースノート` セクションを含める（What's New 自動反映）。
