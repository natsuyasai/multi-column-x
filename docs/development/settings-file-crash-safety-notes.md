# 設定ファイルの破損耐性ノート

Android でアプリ起動直後〜ページ読み込み中に kill すると、アカウント・カラム・設定がすべて初期状態に戻る問題への対策（`settings.json` のアトミック書き込み・起動時の検査と復旧）に関する設計判断・不採用案・落とし穴を記録する。

## 対象ファイル

- `src-tauri/src/commands/settings_file.rs` — アトミック書き込み、`recover_settings_file`、`save_store_atomically`
- `src-tauri/src/commands/settings.rs` — `save_settings` / `load_settings`（`apply_recovery`）
- `src-tauri/src/lib.rs` — `setup` 冒頭の復旧・ストア登録、`save_window_bounds`
- `src/store/useAppStore.ts` — `settingsSaveBlocked`（読み込み失敗時の保存ガード）

## 原因

1. アカウント・カラム・設定は `tauri-plugin-store` の `settings.json` の `appSettings` 1キーに入っている。
2. プラグインの `Store::save` は `fs::write`（truncate してから書く非アトミック書き込み）。書き込み中に kill されると空/途中で切れた JSON が残る。
3. プラグインはストア生成時の読み込みエラーを握りつぶす（空のキャッシュになる）。
4. `load_settings` は `appSettings` キーが無ければ初回起動扱い。壊れたファイルは通知も退避もなく初期状態で起動し、次の保存で空設定が正式データとして上書きされていた。

## 設計

プラグインの `Store` はメモリ上のキャッシュ/リーダーとして残し、ディスクへの書き込みだけを自前のアトミック書き込みに置き換える。読み出し側（`app.store("settings.json")`）は無変更。

- `setup` 冒頭で `recover_settings_file` → `SettingsRecoveryState` を manage → `StoreBuilder::...disable_auto_save().build()` の順に実行する。**順序が重要**: ストア生成前に直さないと、壊れたファイルをプラグインが握りつぶして読む。自動保存を無効にしないとアトミック化をすり抜ける。
- 保存は `write_settings_atomically`: 現在の main が正常な JSON オブジェクトなら `settings.json.prev` へコピー（直前世代）→ `settings.json.tmp` へ書き込み → `sync_all` → `rename`。
- `save_settings` と desktop の `save_window_bounds` が並行しても一時ファイルが衝突しないよう、`save_store_atomically` が `SAVE_LOCK` を取る。`Store::save` を直接呼ぶ箇所を作らないこと。
- 復旧結果は `load_settings` が1回だけ `take()` する。`Unrecoverable` のときだけ既定値＋`loadFailed: true`＋`backupPath` を返し、フロントの既存通知（`SETTINGS_LOAD_FAILED_*`）を流用する。退避ファイル名は既存の `backup_file_name` を再利用する。

### 復旧ロジック

| main                 | prev            | 動作                                               | 結果            |
| -------------------- | --------------- | -------------------------------------------------- | --------------- |
| 存在しない           | -               | 何もしない（初回起動。意図的な削除もリセット扱い） | `Healthy`       |
| 正常                 | -               | 何もしない                                         | `Healthy`       |
| 壊れている（空含む） | 正常            | main を退避 → prev を main へコピー                | `Restored`      |
| 壊れている（空含む） | 無い/壊れている | main を退避。main は触らない                       | `Unrecoverable` |

「正常」= JSON としてパースでき、トップレベルがオブジェクト。退避に失敗しても起動は継続する（`backup_path: None`）。

## 判断記録

- **親ディレクトリの fsync は unix のみ best-effort**: `rename` 後に親ディレクトリを `sync_all` する（Android は unix 扱い）。失敗しても保存は成功扱い（`log::warn!` のみ）。Windows はディレクトリを開いて同期できないため cfg で除外。目的はプロセス kill への耐性で、電源断までの完全な耐性は目的外。
- **`.prev` 復元は通知しない**: 直前世代からの復元（`Restored`）は `log::warn!` のみ。ユーザーのデータは直前の保存時点まで残っており、通知しても取れる行動が無いため。
- **フロントの保存ガード**: `load_settings` の IPC 自体が例外を投げた場合、既定状態のまま進んで保存すると保存済みの設定を空で上書きしてしまう。`settingsSaveBlocked` を立てて保存を止め、通知を出す（再起動まで解除しない）。`loadFailed: true`（バックエンドが退避済み）は保存してよい。`saveSettings` は実行時点のフラグで判定する。

## 不採用案

- `.bak` コピーのみで `fs::write` は残す案: 自動保存の書き込みが非アトミックのまま残り、壊れる頻度自体が下がらない。
- プラグインを捨てて自前ストアへ全面移行する案: 読み出し側の変更範囲が大きく、目的に対して過剰。

## 落とし穴

- `StoreBuilder` の登録を `recover_settings_file` より前、または他の `app.store("settings.json")` より後にしない。
- `store.set` の後は必ず `save_store_atomically` を呼ぶ（自動保存は無効）。
- Android でも `tauri::Manager` が必要（`lib.rs` で cfg 無しに import している）。
- Rust のテスト関数名に ASCII 大文字を含めない（clippy `non_snake_case`）。
- 実機（Android）での kill 耐性は手動確認が必要（起動直後〜ページ読み込み中の強制終了を繰り返し、設定が残ること）。
