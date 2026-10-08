//! 復元の置換処理。現在の設定とフロントが作った復元ペイロードから、置換後の設定を作る。
//!
//! - `accounts`、`windowBounds`、削除待ち一覧は現在の値を保つ（ペイロードの値は無視）。
//! - ペイロードはフロントから届くため、上限・URL・id の安全性・アカウント参照を再検証する。
//! - 退避（`write_snapshot`）は検証に成功した後、結果を返す前に行う。

use std::collections::HashSet;
use std::path::Path;

use serde::Deserialize;

use super::format::{
    validate_column, validate_global_settings, BackupColumn, BackupError, BackupGlobalSettings,
    MAX_COLUMNS,
};
use super::snapshot::write_snapshot;
use crate::commands::settings::{AppSettingsData, ColumnData};

/// フロントが紐づけ・再採番・グリッド正規化を済ませて送る復元内容。
#[derive(Deserialize, Debug)]
pub struct RestorePayload {
    pub columns: Vec<BackupColumn>,
    #[serde(rename = "globalSettings", default)]
    pub global_settings: BackupGlobalSettings,
}

fn invalid(field: &str, reason: &str) -> BackupError {
    BackupError::InvalidField {
        field: field.to_string(),
        reason: reason.to_string(),
    }
}

/// カラム id がデータディレクトリ名等に使われても安全か。
fn is_safe_column_id(id: &str) -> bool {
    !id.is_empty() && !id.contains("..") && !id.contains('/') && !id.contains('\\')
}

/// カラム1件の id とアカウント参照を検証し、使用済み id に登録する。
fn check_column_reference(
    column: &BackupColumn,
    account_ids: &HashSet<&str>,
    seen_ids: &mut HashSet<String>,
    forbidden_ids: &HashSet<&str>,
) -> Result<(), BackupError> {
    validate_column(column)?;
    if !is_safe_column_id(&column.id) {
        return Err(invalid("columns.id", "カラム id が安全ではありません"));
    }
    if forbidden_ids.contains(column.id.as_str()) {
        return Err(invalid(
            "columns.id",
            "復元先の既存カラム id と重複しています",
        ));
    }
    if !seen_ids.insert(column.id.clone()) {
        return Err(invalid("columns.id", "カラム id が重複しています"));
    }
    if column.page_type == "external" {
        if column.account_id != column.id {
            return Err(invalid(
                "columns.accountId",
                "外部カラムの accountId はカラム自身の id と一致する必要があります",
            ));
        }
    } else if !account_ids.contains(column.account_id.as_str()) {
        return Err(invalid(
            "columns.accountId",
            "復元先に存在しないアカウントを参照しています",
        ));
    }
    Ok(())
}

/// 置換後の設定を計算する（純粋関数）。ディスクにも退避にも触れない。
pub fn compute_new_settings(
    current: &AppSettingsData,
    payload: RestorePayload,
) -> Result<AppSettingsData, BackupError> {
    if payload.columns.len() > MAX_COLUMNS {
        return Err(BackupError::LimitExceeded {
            field: "columns".to_string(),
            limit: MAX_COLUMNS as u64,
        });
    }
    validate_global_settings(&payload.global_settings)?;

    let account_ids: HashSet<&str> = current.accounts.iter().map(|a| a.id.as_str()).collect();
    let forbidden_ids: HashSet<&str> = current.columns.iter().map(|c| c.id.as_str()).collect();
    let mut seen_ids = HashSet::new();

    for column in &payload.columns {
        check_column_reference(column, &account_ids, &mut seen_ids, &forbidden_ids)?;
    }
    for preset in &payload.global_settings.presets {
        for column in &preset.columns {
            check_column_reference(column, &account_ids, &mut seen_ids, &forbidden_ids)?;
        }
    }
    if let Some(default_account) = &payload.global_settings.default_account_id {
        if !account_ids.contains(default_account.as_str()) {
            return Err(invalid(
                "globalSettings.defaultAccountId",
                "復元先に存在しないアカウントを参照しています",
            ));
        }
    }

    let mut next = current.clone();
    next.columns = payload.columns.into_iter().map(ColumnData::from).collect();
    next.global_settings = payload.global_settings.apply_onto(&current.global_settings);
    Ok(next)
}

/// 検証 → 現在の設定の退避 → 置換結果を返す。退避に失敗したら置換結果を返さない。
pub fn apply_with_snapshot(
    snapshot_dir: &Path,
    unix_secs: u64,
    current: &AppSettingsData,
    payload: RestorePayload,
) -> Result<AppSettingsData, BackupError> {
    let next = compute_new_settings(current, payload)?;
    let current_bytes = serde_json::to_vec_pretty(current).map_err(|e| BackupError::Io {
        message: e.to_string(),
    })?;
    write_snapshot(snapshot_dir, unix_secs, &current_bytes).map_err(|e| BackupError::Io {
        message: e.to_string(),
    })?;
    Ok(next)
}
