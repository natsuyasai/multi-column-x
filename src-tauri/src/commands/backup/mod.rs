//! バックアップ／リストア機能。
//!
//! - `format`: ファイル形式・検証・エクスポート変換（純粋関数）
//! - `restore`: 復元の置換計算と退避付き適用（純粋関数）
//! - `snapshot`: 復元直前の自動退避（専用ファイル・世代制限）
//! - `file_io`: 保存・読込（desktop はダイアログ、Android は SAF）
//!
//! このファイルは Tauri コマンド（メインウィンドウ専用）で、各処理を組み合わせるだけにする。

pub mod file_io;
pub mod format;
pub mod restore;
pub mod snapshot;

#[cfg(test)]
mod file_io_tests;
#[cfg(test)]
mod format_tests;
#[cfg(test)]
mod restore_tests;
#[cfg(test)]
mod snapshot_tests;

use tauri::{AppHandle, Manager};
use tauri_plugin_store::StoreExt;

use self::format::{
    build_export, export_file_name, parse_backup, rfc3339_utc, BackupError, BackupFile,
};
use self::restore::{apply_with_snapshot, RestorePayload};
use crate::commands::settings::{parse_stored_settings, AppSettingsData, ParsedSettings};
use crate::commands::settings_file::save_store_atomically;

/// 復元直前の退避を置くディレクトリ名（app_data_dir 配下）。
const SNAPSHOT_DIR_NAME: &str = "restore_snapshots";

fn io_error(e: impl std::fmt::Display) -> BackupError {
    BackupError::Io {
        message: e.to_string(),
    }
}

fn now_unix_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// ストアに保存されている現在の設定を読む。解析できない設定は `SettingsUnreadable`。
/// 未保存（初回起動）は既定値として扱う。
fn load_current_settings(
    store: &tauri_plugin_store::Store<tauri::Wry>,
) -> Result<AppSettingsData, BackupError> {
    match parse_stored_settings(store.get("appSettings")) {
        ParsedSettings::Loaded(settings) => Ok(*settings),
        ParsedSettings::Missing => Ok(AppSettingsData::default()),
        ParsedSettings::Invalid { .. } => Err(BackupError::SettingsUnreadable),
    }
}

/// 現在の設定をバックアップファイルとして書き出す。保存ダイアログをキャンセルしたら `false`。
#[tauri::command]
pub async fn export_backup(caller: tauri::Webview, app: AppHandle) -> Result<bool, BackupError> {
    crate::commands::require_main_caller(&caller).map_err(io_error)?;
    let store = app.store("settings.json").map_err(io_error)?;
    let settings = load_current_settings(&store)?;

    let now = now_unix_secs();
    let file = build_export(
        &settings,
        &app.package_info().version.to_string(),
        &rfc3339_utc(now),
    );
    let bytes = serde_json::to_vec_pretty(&file).map_err(io_error)?;
    file_io::save_backup_file(&app, &export_file_name(now), bytes).await
}

/// バックアップファイルを選んで検証する。ストアには一切触れない。選択をキャンセルしたら `None`。
#[tauri::command]
pub async fn read_backup(
    caller: tauri::Webview,
    app: AppHandle,
) -> Result<Option<BackupFile>, BackupError> {
    crate::commands::require_main_caller(&caller).map_err(io_error)?;
    match file_io::pick_backup_file(&app).await? {
        Some(bytes) => parse_backup(&bytes).map(Some),
        None => Ok(None),
    }
}

/// 現在の設定を退避してから、カラムと設定を復元内容で置き換える。
/// 保存は `save_store_atomically` による 1 回のアトミック書き込み。保存に失敗したら
/// メモリ上のストアも元に戻す。置換後の設定を返す。
#[tauri::command]
pub async fn apply_restore(
    caller: tauri::Webview,
    app: AppHandle,
    payload: RestorePayload,
) -> Result<AppSettingsData, BackupError> {
    crate::commands::require_main_caller(&caller).map_err(io_error)?;
    let store = app.store("settings.json").map_err(io_error)?;
    let previous = store.get("appSettings");
    let current = load_current_settings(&store)?;

    let snapshot_dir = app
        .path()
        .app_data_dir()
        .map_err(io_error)?
        .join(SNAPSHOT_DIR_NAME);
    let next = apply_with_snapshot(&snapshot_dir, now_unix_secs(), &current, payload)?;

    store.set(
        "appSettings",
        serde_json::to_value(&next).map_err(io_error)?,
    );
    if let Err(e) = save_store_atomically(&app, &store) {
        match previous {
            Some(value) => store.set("appSettings", value),
            None => {
                store.delete("appSettings");
            }
        }
        return Err(io_error(e));
    }
    Ok(next)
}
