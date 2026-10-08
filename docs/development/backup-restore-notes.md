# バックアップ／リストア ノート

設定のバックアップ作成・読み込み・アカウント紐づけ・復元（Issue #206）に関する設計判断・不採用案・落とし穴を記録する。対象は Windows / macOS / Linux / Android。手動テスト項目は [backup-restore/integration-test.md](backup-restore/integration-test.md)。

## 対象ファイル

- Rust（`src-tauri/src/commands/backup/`）
  - `format.rs` — ファイル形式、読み込み検証（`parse_backup`）、エクスポート変換（`build_export`）、上限定数
  - `restore.rs` — 復元の置換計算（`compute_new_settings`）と退避付き適用（`apply_with_snapshot`）
  - `snapshot.rs` — 復元直前の自動退避（`write_snapshot`）
  - `file_io.rs` — 保存・読込の 2 関数（desktop はダイアログ、Android は SAF）
  - `mod.rs` — Tauri コマンド（`export_backup` / `read_backup` / `apply_restore`）
- Rust（その他）: `commands/account.rs`（`detect_account_user_ids`、追加完了時の `xUserId` 取得）、`android_bridge.rs`（SAF の JNI）
- TS: `src/lib/backupRestore.ts`（紐づけ・再採番・グリッド正規化・エラー文言）、`src/services/backup.ts`（IPC と復元手順 `performRestore`）、`src/hooks/useBackupFlow.ts`、`src/components/AppSettingsPanel/BackupTab.tsx`、`src/store/useAppStore.ts`（`restoreInProgress`）
- Android: `MainActivity.kt`（`startBackupExport` / `startBackupImport` / `detectXUserId`）、`AppBridge.kt`（`onBackupFileResult`）、`BackupFileCopy.kt`、`AddAccount.kt`（`xUserId` をセンチネル本文へ）、`proguard-rules.pro`

## ファイル形式

- UTF-8 JSON 1 ファイル。拡張子 `.mcxbackup.json`（保存ダイアログの既定名）。先頭の UTF-8 BOM は除いて受理する。
- エンベロープ: `format`（`multi-column-x-backup`）、`schemaVersion`（初版 1）、`appVersion`、`exportedAt`（RFC 3339 UTC）。
- `accounts[]` は `backupAccountId` / `label` / `color` / `xUserId?` のみ。`backupAccountId` は元の `account.id` を再利用する（ファイル内の参照用で、復元先には引き継がれない）。
- 読み込みの順序（崩すと将来版が「壊れたファイル」扱いになる）: サイズ → BOM 除去 → JSON → `format` → `schemaVersion`（`as_u64` で 1 以上の整数。それ以外は形式エラー、現行より大きければ `FutureVersion`）→ 移行 → 型へ変換 → 上限・URL 検証。
- 移行の枠は `migrate_to_current`。スキーマを上げるときは版ごとに「1 つ上へ変換する」処理をここに足す。
- ファイル選択フィルタは `json` のみ（二重拡張子が全 OS で効く保証が無いため）。受理は内容（`format`）で判定する。

## ホワイトリスト出力

- 出力は `BackupGlobalSettings`（端末依存項目を持たない専用型）へ変換する。`windowBounds` と `pendingDataDirectoryDeletions` は型に存在しない。アカウントの `dataDirectory` / `createdAt`、Cookie、プロファイルも出力しない。
- `GlobalSettingsData` に項目を足すと `format_tests.rs` の「キー集合 ＝ 出力キー ∪ 除外リスト」テストが失敗する。新項目は `BackupGlobalSettings`（`From` と `apply_onto`）に足すか、`EXCLUDED_GLOBAL_SETTINGS_KEYS` に追加して端末依存として扱うかを決めること。
- `defaultAccountId` は `null` でも出力する（キー集合テストのため）。TS 側（`normalizeBackupFile`）で `undefined` に正規化する。

## 上限

ファイル 5 MiB / アカウント 50 / カラム 200 / プリセット 50 / ラベル 100 文字 / `customUrl` 2048 文字 / `customCSS` 100,000 文字 / 文字列配列 1000 件 × 各 500 文字。`external` と `custom` カラムの `customUrl` は http/https のみ（同じ `resolve_url` に流れるため両方に適用）。NG ワード（正規表現構文）とリポスト非表示ユーザー ID は JS の `RegExp` 依存のため TS（`validateBackupLists`）で既存と同じ基準で検証する。

## 復元の手順と責務分担

1. TS: `beginRestore`（`restoreInProgress` を立て、自動保存・自動更新・アカウント追加／再認証を止める）
2. TS: `flushPendingSaves`（復元前に積まれた保存の完了を待つ）
3. TS: `buildRestorePayload`（`accountId` / プリセット内 / `defaultAccountId` の差し替え、全カラム `id` の再採番、グリッド正規化）
4. Rust `apply_restore`: 現在の `appSettings` を読む → 再検証（上限・URL・`id` の安全性・アカウント参照）→ **退避** → `store.set` → `save_store_atomically`（1 回）→ 置換後の設定を返す。保存失敗時はメモリ上のストアも元に戻す。
5. 失敗なら旧 WebView に触れずに終了。成功なら TS が旧 WebView 破棄 → `applyRestoredSettings`（保存しない）→ WebView 再生成。
6. `finishRestore`（`finally`）

- `saveSettings` は **要求時点**で `restoreInProgress` を判定する（チェーン内で判定すると、復元直前に積んだ保存が黙って捨てられる）。`settingsSaveBlocked` の判定は従来どおりチェーン内。
- `accounts`・`windowBounds`・削除待ち一覧は Rust が現行値を保つ（ペイロードの同名項目は型に無いので無視される）。
- 外部カラム（`pageType === "external"`）は `accountId == id`。再採番で `accountId` も新 `id` に合わせる。旧外部カラムのデータディレクトリは削除しない（退避から戻すと旧 `id` が復活するため）。
- 復元先の既存カラムと同じ `id` はペイロード検証で拒否する（外部カラムのデータディレクトリ共有を防ぐ）。

## 退避（snapshot）

- 場所: `app_data_dir/restore_snapshots/appsettings-YYYYMMDD-HHMMSS[-n].json`（UTC）。破損復旧用の `settings.json.*.bak` / `settings.json.prev` とは名前空間を共有しない。
- 内容は復元前の `AppSettingsData`（JSON）。`create_new` で書くため同一秒でも上書きしない。保持 5 世代。直前に書いた 1 件は削除せず、接頭辞が一致するファイルだけを削除対象にする。世代の並びは (タイムスタンプ, 連番) の数値順で判定する（ファイル名の辞書順だと `-1.json` が `.json` より前に並ぶ）。
- アプリ内で退避を再適用する UI は無い（要件外）。Android では退避ファイルを直接取り出せない。再生成に失敗したときは退避フォルダの場所を案内するだけ。

## ファイル入出力（4 プラットフォーム）

- desktop: `tauri-plugin-dialog` のダイアログを oneshot で受け、Rust のファイル I/O（`read_limited` で上限 + 1 バイト打ち切り）。
- Android: Kotlin の SAF（`CreateDocument` / `OpenDocument`）。`registerForActivityResult` は Activity 生成前に呼ぶ必要があるためプロパティ初期化子で登録する。読込は Kotlin が上限を超えた時点でコピーを打ち切り（`copyWithLimit`）、Rust が `read_limited` で再検査する（二重防御）。完了は `AppBridge.onBackupFileResult(status, detail)` → `file_io::deliver_bridge_result` → 待受（oneshot、10 分でタイムアウト）。
- `MainActivity.kt` にメソッドを足したので `proguard-rules.pro` の keep も同時に更新済み（`startBackupExport` / `startBackupImport` / `detectXUserId`）。`AppBridge` の native は `proguard-wry.pro` の `native <methods>` で保護される。

## ACL

`export_backup` / `read_backup` / `apply_restore` / `detect_account_user_ids` は `build.rs` の `AppManifest`、`capabilities/default.json`、`contracts/ipc-constants.json`、`src/constants/ipc.ts`、`lib.rs` の `generate_handler!` に登録済み。**`column-webview.json` には追加しない**（inject が使うコマンド集合との厳密一致テストがある）。すべて `require_main_caller` で呼び出し元を検証する。

## X ユーザー ID（`xUserId`）の取得

- 追加時: desktop は `/home` 到達時に `twid` Cookie を読み、`ACCOUNT_LOGIN_COMPLETE` の payload `{ xUserId }` で渡す（再認証と同じ `read_x_user_id`）。Android は `AddAccount.kt` がアカウントのプロファイルの `CookieManager` から読み、センチネル本文に書く（`x_user_id_from_sentinel` が数字のみを許可）。
- 既存アカウントの後追い補完（`detect_account_user_ids`）: desktop は生きているカラム WebView の `cookies_for_url`、Android は JNI `detectXUserId`（プロファイル API 非対応端末は共有 `CookieManager` でアカウントを特定できないため取得しない）。取得できなければ紐づけ画面に「再認証すると自動候補が効く」旨のヒントを出す。カラムを 1 つも持たないアカウントは補完できない。
- 自動候補は双方に `xUserId` があり一致するときだけ。同じ ID の復元先が複数あれば一覧順の先頭。

## 落とし穴

- Rust のテスト関数名に ASCII 大文字を含めない（clippy `non_snake_case`）。
- `ColumnData` は必須項目が多く serde の既定値が無いので、読み込みには専用の `BackupColumn`（欠落を既定値で補う）を使う。`ColumnData` に `#[serde(default)]` を足すと起動時の読み込み契約が変わるので足さない。
- 新しい設定項目は追加していない（`contracts/default-settings.json` の 3 箇所同期は不要）。項目を足すときは上記ホワイトリストのテストが取捨を強制する。
- Android Auto Backup（`MultiColumnXBackupAgent` / `BackupFileSelector`）は本機能と別物で、触れていない。
