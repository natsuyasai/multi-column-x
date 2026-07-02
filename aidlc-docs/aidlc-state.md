# aidlc-state: 改善計画の実行状態

最終更新: 2026-07-02（このファイルはウェーブの起動・完了・検証のたびに必ず更新すること）

## 参照ドキュメント

- 監査（問題インベントリ S/R/T/U/D）: `aidlc-docs/inception/reverse-engineering/2026-07-02-project-audit.md`
- 実行計画（10 フェーズ・タスク詳細）: `aidlc-docs/construction/plans/2026-07-02-improvement-plan.md`
- どちらもブランチ `docs/project-audit-2026-07`（コミット 6989a9d）にのみ存在。**develop へ未マージ**

## 実行方式

- 各フェーズ = 1 ブランチ = sonnet サブエージェント（worktree 分離）で実行
- ファイル競合しないフェーズのみ並列化（ウェーブ方式）
- サブエージェントの worktree は `main` から作成される点に注意（計画ドキュメントが無いため、起動後に 2 ドキュメントを worktree へコピーして渡している。`docs/project-audit-2026-07` を develop / main へマージすれば不要になる）

## フェーズ進捗

| フェーズ | 内容                                                        | ブランチ                      | 状態                                                                                                        |
| -------- | ----------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1        | セキュリティ強化（S2→S4→S1→S3→S5/S6）                       | `fix/security-hardening`      | 🔄 ウェーブ1 実行中（2026-07-02 起動）                                                                      |
| 3        | useDesktopColumns / useMobileColumns テスト                 | `test/desktop-mobile-columns` | ✅ 完了・検証済み（a8b9971, b021085。テスト11件追加、Vitest 472件、プロダクトコード変更なしを差分確認済み） |
| 4        | inject スクリプトテスト                                     | `test/inject-scripts`         | 🔄 ウェーブ1 実行中（2026-07-02 起動）                                                                      |
| 2        | Rust リファクタ（R2 init script 重複 / R5 lock expect）     | `refactor/rust-column-init`   | ⏳ ウェーブ2 待機（フェーズ1完了後。column.rs 等が競合するため）                                            |
| 5        | Rust テスト（settings_store 純関数化 / parse_url / update） | `test/rust-settings-store`    | ⏳ ウェーブ2 待機（フェーズ1と webview/mod.rs が競合）                                                      |
| 9        | AppSettingsPanel リファクタ（R1）                           | `refactor/app-settings-panel` | ⏳ ウェーブ2 待機（他と競合しないため前倒し可）                                                             |
| 6        | アカウント操作のダイアログ化（U1）                          | `feat/account-dialogs`        | ⏳ ウェーブ3 待機（6/7/8 は App.tsx が相互競合。順次 or 慎重に並列）                                        |
| 7        | カラムヘッダー直接移動（U2+R3）                             | `feat/column-header-move`     | ⏳ ウェーブ3 待機                                                                                           |
| 8        | ショートカット拡充 r/?（U3）                                | `feat/shortcut-reload-help`   | ⏳ ウェーブ3 待機                                                                                           |
| 10       | 通知対象拡大（U4）/ プリセットモバイル（U5）                | `feat/notify-any-column`      | ⏳ ウェーブ4 待機（フェーズ9完了後。AppSettingsPanel 依存）                                                 |

凡例: ✅ 完了・検証済み / 🔄 実行中 / ⏳ 待機 / ❌ 失敗・要対応

## ウェーブ完了時の検証手順（メインセッションの仕事）

1. エージェントの最終報告を確認（コミットハッシュ・ゲート結果・逸脱）
2. 対象ブランチで `git log --oneline` と差分確認、必要なら worktree で品質ゲートを再実行
3. 問題なければこの表を ✅ に更新し、次ウェーブを起動
4. 計画ドキュメント（aidlc-docs の 2 ファイル）が誤ってコミットされていないか確認

## 未処理の手動確認（ユーザー依頼事項）

- [ ] フェーズ1 Task 1.3（capability の x.com 限定）: 実機で「新着バッジ」「画像ポップアップ」「x.com 以外のリンクポップアップの縮退」を確認（計画書 Task 1.3 Step 2 のチェックリスト）
- [ ] フェーズ1 Task 1.4（CSP）: `npm run tauri:dev` で main UI 全機能がコンソールエラーなしで動くこと
- [ ] `docs/project-audit-2026-07` ブランチの PR / develop へのマージ

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
