//! バックアップファイルの形式・読み込み検証・エクスポート変換（純粋関数のみ）。
//!
//! - 読み込み: サイズ検査 → BOM 除去 → JSON → 形式識別子 → スキーマバージョン →
//!   移行 → 型への変換 → 上限・URL 検証、の順で行う。ストアには一切触れない。
//! - 出力: 端末依存項目を持たない専用型（ホワイトリスト）へ変換する。
//!   新しい `GlobalSettingsData` 項目が増えるとテストが失敗し、取捨の判断を強制する。

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::commands::settings::{
    AccountData, AppSettingsData, ColumnData, ColumnPresetData, ColumnSettings, GlobalSettingsData,
};

/// ファイル先頭の形式識別子。
pub const BACKUP_FORMAT: &str = "multi-column-x-backup";
/// 現行のスキーマバージョン。
pub const SCHEMA_VERSION: u32 = 1;
/// 受理する最大ファイルサイズ（バイト）。
pub const MAX_FILE_BYTES: usize = 5 * 1024 * 1024;
pub const MAX_ACCOUNTS: usize = 50;
pub const MAX_COLUMNS: usize = 200;
pub const MAX_PRESETS: usize = 50;
pub const MAX_LABEL_CHARS: usize = 100;
pub const MAX_ID_CHARS: usize = 200;
pub const MAX_URL_CHARS: usize = 2048;
pub const MAX_CSS_CHARS: usize = 100_000;
pub const MAX_LIST_ITEMS: usize = 1000;
pub const MAX_LIST_ITEM_CHARS: usize = 500;

/// ポータブルでないため、バックアップに含めない `globalSettings` のキー。
/// `GlobalSettingsData` のキー集合 ＝ 出力キー ∪ この一覧、をテストで保証する（テスト専用の定義）。
#[cfg(test)]
pub const EXCLUDED_GLOBAL_SETTINGS_KEYS: [&str; 5] = [
    "windowBounds",
    "pendingDataDirectoryDeletions",
    "hardwareVideoDecodeEnabled",
    "h264DownloadPromptDismissed",
    "uiScale",
];

const ALLOWED_THEMES: [&str; 3] = ["dark", "light", "system"];
const ALLOWED_COLUMN_SCALES: [&str; 5] = ["small", "default", "normal", "large", "xLarge"];

/// バックアップ操作のエラー。Rust 側で一度だけ分類し、TS は `kind` から文言を作る。
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum BackupError {
    /// JSON として解釈できない。
    BrokenJson { message: String },
    /// 形式識別子が違う（他アプリのファイル等）。
    FormatMismatch { found: Option<String> },
    /// 現行より新しいスキーマバージョン。
    FutureVersion { found: u64, current: u64 },
    /// ファイルサイズが上限を超えている。
    TooLarge { size: u64, limit: u64 },
    /// 件数または文字列長が上限を超えている。
    LimitExceeded { field: String, limit: u64 },
    /// 項目の値が不正（型違い、許可されない URL、安全でない id など）。
    InvalidField { field: String, reason: String },
    /// ファイル操作に失敗した。
    Io { message: String },
    /// 現在の設定を読めないため、復元の前提（退避・置換）を満たせない。
    SettingsUnreadable,
}

fn invalid(field: &str, reason: &str) -> BackupError {
    BackupError::InvalidField {
        field: field.to_string(),
        reason: reason.to_string(),
    }
}

fn limit(field: &str, limit: usize) -> BackupError {
    BackupError::LimitExceeded {
        field: field.to_string(),
        limit: limit as u64,
    }
}

// ---------------------------------------------------------------------------
// ファイル上の型
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BackupAccount {
    #[serde(rename = "backupAccountId", default)]
    pub backup_account_id: String,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub color: String,
    #[serde(rename = "xUserId", default, skip_serializing_if = "Option::is_none")]
    pub x_user_id: Option<String>,
}

/// ファイル中のカラム。欠落した項目は既定値で補う（`ColumnData` は必須項目が多いため専用型を使う）。
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(default)]
pub struct BackupColumn {
    pub id: String,
    #[serde(rename = "accountId")]
    pub account_id: String,
    #[serde(rename = "pageType")]
    pub page_type: String,
    #[serde(rename = "customUrl", skip_serializing_if = "Option::is_none")]
    pub custom_url: Option<String>,
    #[serde(rename = "homeTabName", skip_serializing_if = "Option::is_none")]
    pub home_tab_name: Option<String>,
    #[serde(rename = "searchQuery", skip_serializing_if = "Option::is_none")]
    pub search_query: Option<String>,
    #[serde(rename = "searchLiveTab")]
    pub search_live_tab: bool,
    #[serde(rename = "listId", skip_serializing_if = "Option::is_none")]
    pub list_id: Option<String>,
    pub width: f64,
    pub order: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    pub settings: ColumnSettings,
    #[serde(rename = "gridRow")]
    pub grid_row: u32,
    #[serde(rename = "gridCol")]
    pub grid_col: u32,
    #[serde(rename = "heightMode")]
    pub height_mode: String,
    #[serde(rename = "heightValue", skip_serializing_if = "Option::is_none")]
    pub height_value: Option<f64>,
    #[serde(rename = "heightUnit", skip_serializing_if = "Option::is_none")]
    pub height_unit: Option<String>,
}

impl Default for BackupColumn {
    fn default() -> Self {
        Self {
            id: String::new(),
            account_id: String::new(),
            page_type: "home".to_string(),
            custom_url: None,
            home_tab_name: None,
            search_query: None,
            search_live_tab: false,
            list_id: None,
            width: 350.0,
            order: 0,
            label: None,
            settings: ColumnSettings::default(),
            grid_row: 0,
            grid_col: 0,
            height_mode: "auto".to_string(),
            height_value: None,
            height_unit: None,
        }
    }
}

impl From<&ColumnData> for BackupColumn {
    fn from(c: &ColumnData) -> Self {
        Self {
            id: c.id.clone(),
            account_id: c.account_id.clone(),
            page_type: c.page_type.clone(),
            custom_url: c.custom_url.clone(),
            home_tab_name: c.home_tab_name.clone(),
            search_query: c.search_query.clone(),
            search_live_tab: c.search_live_tab,
            list_id: c.list_id.clone(),
            width: c.width,
            order: c.order,
            label: c.label.clone(),
            settings: c.settings.clone(),
            grid_row: c.grid_row,
            grid_col: c.grid_col,
            height_mode: c.height_mode.clone(),
            height_value: c.height_value,
            height_unit: c.height_unit.clone(),
        }
    }
}

impl From<BackupColumn> for ColumnData {
    fn from(c: BackupColumn) -> Self {
        Self {
            id: c.id,
            account_id: c.account_id,
            page_type: c.page_type,
            custom_url: c.custom_url,
            home_tab_name: c.home_tab_name,
            search_query: c.search_query,
            search_live_tab: c.search_live_tab,
            list_id: c.list_id,
            width: c.width,
            order: c.order,
            label: c.label,
            settings: c.settings,
            grid_row: c.grid_row,
            grid_col: c.grid_col,
            height_mode: c.height_mode,
            height_value: c.height_value,
            height_unit: c.height_unit,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(default)]
pub struct BackupPreset {
    pub id: String,
    pub name: String,
    pub columns: Vec<BackupColumn>,
}

/// バックアップに含める `globalSettings`（ホワイトリスト）。
/// `windowBounds`・`pendingDataDirectoryDeletions`・`hardwareVideoDecodeEnabled`・
/// `h264DownloadPromptDismissed`・`uiScale` は端末依存のため意図的に持たない。
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(default)]
pub struct BackupGlobalSettings {
    pub theme: String,
    #[serde(rename = "customCSS")]
    pub custom_css: String,
    #[serde(rename = "defaultAccountId")]
    pub default_account_id: Option<String>,
    #[serde(rename = "defaultAutoReloadEnabled")]
    pub default_auto_reload_enabled: bool,
    #[serde(rename = "defaultAutoReloadInterval")]
    pub default_auto_reload_interval: u32,
    #[serde(rename = "popupEscCloseEnabled")]
    pub popup_esc_close_enabled: bool,
    #[serde(rename = "videoAutoPlayStopEnabled")]
    pub video_auto_play_stop_enabled: bool,
    #[serde(rename = "imagePopupEnabled")]
    pub image_popup_enabled: bool,
    #[serde(rename = "videoPopupEnabled")]
    pub video_popup_enabled: bool,
    #[serde(rename = "defaultShowCountdown")]
    pub default_show_countdown: bool,
    #[serde(rename = "defaultHideHeaderEnabled")]
    pub default_hide_header_enabled: bool,
    #[serde(rename = "defaultHideTweetInputEnabled")]
    pub default_hide_tweet_input_enabled: bool,
    #[serde(rename = "defaultShowCustomMenu")]
    pub default_show_custom_menu: bool,
    #[serde(rename = "defaultScrollPosRestoreEnabled")]
    pub default_scroll_pos_restore_enabled: bool,
    #[serde(rename = "defaultColumnCustomCSS")]
    pub default_column_custom_css: String,
    #[serde(rename = "smallImageEnabled")]
    pub small_image_enabled: bool,
    #[serde(rename = "smallImageWidth")]
    pub small_image_width: String,
    #[serde(rename = "blurImageEnabled")]
    pub blur_image_enabled: bool,
    #[serde(rename = "blurImageAmount")]
    pub blur_image_amount: String,
    #[serde(rename = "hideAdEnabled")]
    pub hide_ad_enabled: bool,
    #[serde(rename = "apiRateLimitMonitorEnabled")]
    pub api_rate_limit_monitor_enabled: bool,
    #[serde(rename = "columnScale")]
    pub column_scale: String,
    #[serde(rename = "useXAppForCompose")]
    pub use_x_app_for_compose: bool,
    #[serde(rename = "mobileSwipeAreaEnabled")]
    pub mobile_swipe_area_enabled: bool,
    #[serde(rename = "mobileSwipeAreaHeight")]
    pub mobile_swipe_area_height: u32,
    #[serde(rename = "mobileSwipeAreaOpacity")]
    pub mobile_swipe_area_opacity: u8,
    #[serde(rename = "mobileTwoColumnEnabled")]
    pub mobile_two_column_enabled: bool,
    pub presets: Vec<BackupPreset>,
    #[serde(rename = "ngWords")]
    pub ng_words: Vec<String>,
    #[serde(rename = "repostHiddenUserIds")]
    pub repost_hidden_user_ids: Vec<String>,
}

impl Default for BackupGlobalSettings {
    fn default() -> Self {
        Self::from(&GlobalSettingsData::default())
    }
}

impl From<&GlobalSettingsData> for BackupGlobalSettings {
    fn from(g: &GlobalSettingsData) -> Self {
        Self {
            theme: g.theme.clone(),
            custom_css: g.custom_css.clone(),
            default_account_id: g.default_account_id.clone(),
            default_auto_reload_enabled: g.default_auto_reload_enabled,
            default_auto_reload_interval: g.default_auto_reload_interval,
            popup_esc_close_enabled: g.popup_esc_close_enabled,
            video_auto_play_stop_enabled: g.video_auto_play_stop_enabled,
            image_popup_enabled: g.image_popup_enabled,
            video_popup_enabled: g.video_popup_enabled,
            default_show_countdown: g.default_show_countdown,
            default_hide_header_enabled: g.default_hide_header_enabled,
            default_hide_tweet_input_enabled: g.default_hide_tweet_input_enabled,
            default_show_custom_menu: g.default_show_custom_menu,
            default_scroll_pos_restore_enabled: g.default_scroll_pos_restore_enabled,
            default_column_custom_css: g.default_column_custom_css.clone(),
            small_image_enabled: g.small_image_enabled,
            small_image_width: g.small_image_width.clone(),
            blur_image_enabled: g.blur_image_enabled,
            blur_image_amount: g.blur_image_amount.clone(),
            hide_ad_enabled: g.hide_ad_enabled,
            api_rate_limit_monitor_enabled: g.api_rate_limit_monitor_enabled,
            column_scale: g.column_scale.clone(),
            use_x_app_for_compose: g.use_x_app_for_compose,
            mobile_swipe_area_enabled: g.mobile_swipe_area_enabled,
            mobile_swipe_area_height: g.mobile_swipe_area_height,
            mobile_swipe_area_opacity: g.mobile_swipe_area_opacity,
            mobile_two_column_enabled: g.mobile_two_column_enabled,
            presets: g
                .presets
                .iter()
                .map(|p| BackupPreset {
                    id: p.id.clone(),
                    name: p.name.clone(),
                    columns: p.columns.iter().map(BackupColumn::from).collect(),
                })
                .collect(),
            ng_words: g.ng_words.clone(),
            repost_hidden_user_ids: g.repost_hidden_user_ids.clone(),
        }
    }
}

impl BackupGlobalSettings {
    /// 端末依存項目（`windowBounds`・削除待ち一覧・ハードウェアデコード設定・H.264 取得案内の拒否状態）は
    /// `base` の値を保ったまま、
    /// それ以外をこのバックアップの内容で置き換えた `GlobalSettingsData` を作る。
    pub fn apply_onto(self, base: &GlobalSettingsData) -> GlobalSettingsData {
        GlobalSettingsData {
            theme: self.theme,
            custom_css: self.custom_css,
            window_bounds: base.window_bounds.clone(),
            default_account_id: self.default_account_id,
            default_auto_reload_enabled: self.default_auto_reload_enabled,
            default_auto_reload_interval: self.default_auto_reload_interval,
            popup_esc_close_enabled: self.popup_esc_close_enabled,
            video_auto_play_stop_enabled: self.video_auto_play_stop_enabled,
            image_popup_enabled: self.image_popup_enabled,
            video_popup_enabled: self.video_popup_enabled,
            default_show_countdown: self.default_show_countdown,
            default_hide_header_enabled: self.default_hide_header_enabled,
            default_hide_tweet_input_enabled: self.default_hide_tweet_input_enabled,
            default_show_custom_menu: self.default_show_custom_menu,
            default_scroll_pos_restore_enabled: self.default_scroll_pos_restore_enabled,
            default_column_custom_css: self.default_column_custom_css,
            small_image_enabled: self.small_image_enabled,
            small_image_width: self.small_image_width,
            blur_image_enabled: self.blur_image_enabled,
            blur_image_amount: self.blur_image_amount,
            hide_ad_enabled: self.hide_ad_enabled,
            api_rate_limit_monitor_enabled: self.api_rate_limit_monitor_enabled,
            column_scale: self.column_scale,
            use_x_app_for_compose: self.use_x_app_for_compose,
            mobile_swipe_area_enabled: self.mobile_swipe_area_enabled,
            mobile_swipe_area_height: self.mobile_swipe_area_height,
            mobile_swipe_area_opacity: self.mobile_swipe_area_opacity,
            mobile_two_column_enabled: self.mobile_two_column_enabled,
            presets: self
                .presets
                .into_iter()
                .map(|p| ColumnPresetData {
                    id: p.id,
                    name: p.name,
                    columns: p.columns.into_iter().map(ColumnData::from).collect(),
                })
                .collect(),
            ng_words: self.ng_words,
            repost_hidden_user_ids: self.repost_hidden_user_ids,
            pending_data_directory_deletions: base.pending_data_directory_deletions.clone(),
            ui_scale: base.ui_scale.clone(),
            hardware_video_decode_enabled: base.hardware_video_decode_enabled,
            h264_download_prompt_dismissed: base.h264_download_prompt_dismissed,
        }
    }
}

/// バックアップファイル全体。
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BackupFile {
    #[serde(default)]
    pub format: String,
    #[serde(rename = "schemaVersion", default)]
    pub schema_version: u32,
    #[serde(rename = "appVersion", default)]
    pub app_version: String,
    #[serde(rename = "exportedAt", default)]
    pub exported_at: String,
    #[serde(default)]
    pub accounts: Vec<BackupAccount>,
    #[serde(default)]
    pub columns: Vec<BackupColumn>,
    #[serde(rename = "globalSettings", default)]
    pub global_settings: BackupGlobalSettings,
}

// ---------------------------------------------------------------------------
// 検証
// ---------------------------------------------------------------------------

fn check_chars(field: &str, value: &str, max: usize) -> Result<(), BackupError> {
    if value.chars().count() > max {
        Err(limit(field, max))
    } else {
        Ok(())
    }
}

fn check_opt_chars(field: &str, value: &Option<String>, max: usize) -> Result<(), BackupError> {
    match value {
        Some(v) => check_chars(field, v, max),
        None => Ok(()),
    }
}

fn check_list(field: &str, items: &[String]) -> Result<(), BackupError> {
    if items.len() > MAX_LIST_ITEMS {
        return Err(limit(field, MAX_LIST_ITEMS));
    }
    items
        .iter()
        .try_for_each(|item| check_chars(field, item, MAX_LIST_ITEM_CHARS))
}

/// http/https の URL だけを許可する（`javascript:` / `file:` / `data:` 等を拒否）。
pub(crate) fn validate_http_url(field: &str, raw: &str) -> Result<(), BackupError> {
    match url::Url::parse(raw) {
        Ok(u) if matches!(u.scheme(), "http" | "https") && u.has_host() => Ok(()),
        _ => Err(invalid(field, "http または https の URL のみ指定できます")),
    }
}

/// カラム1件の件数・文字列長・URL を検証する。
pub(crate) fn validate_column(column: &BackupColumn) -> Result<(), BackupError> {
    check_chars("columns.id", &column.id, MAX_ID_CHARS)?;
    check_chars("columns.accountId", &column.account_id, MAX_ID_CHARS)?;
    check_chars("columns.pageType", &column.page_type, MAX_LABEL_CHARS)?;
    check_opt_chars("columns.customUrl", &column.custom_url, MAX_URL_CHARS)?;
    check_opt_chars(
        "columns.homeTabName",
        &column.home_tab_name,
        MAX_LIST_ITEM_CHARS,
    )?;
    check_opt_chars(
        "columns.searchQuery",
        &column.search_query,
        MAX_LIST_ITEM_CHARS,
    )?;
    check_opt_chars("columns.listId", &column.list_id, MAX_LIST_ITEM_CHARS)?;
    check_opt_chars("columns.label", &column.label, MAX_LABEL_CHARS)?;
    check_chars(
        "columns.settings.customCSS",
        &column.settings.custom_css,
        MAX_CSS_CHARS,
    )?;
    check_list(
        "columns.settings.visibleLinks",
        &column.settings.visible_links,
    )?;
    check_list("columns.settings.ngWords", &column.settings.ng_words)?;
    check_list(
        "columns.settings.repostHiddenUserIds",
        &column.settings.repost_hidden_user_ids,
    )?;
    check_list(
        "columns.settings.whitelistWords",
        &column.settings.whitelist_words,
    )?;
    if matches!(column.page_type.as_str(), "external" | "custom") {
        if let Some(url) = &column.custom_url {
            validate_http_url("columns.customUrl", url)?;
        }
    }
    Ok(())
}

pub(crate) fn validate_columns(columns: &[BackupColumn]) -> Result<(), BackupError> {
    if columns.len() > MAX_COLUMNS {
        return Err(limit("columns", MAX_COLUMNS));
    }
    columns.iter().try_for_each(validate_column)
}

pub(crate) fn validate_global_settings(g: &BackupGlobalSettings) -> Result<(), BackupError> {
    if !ALLOWED_THEMES.contains(&g.theme.as_str()) {
        return Err(invalid("globalSettings.theme", "未対応のテーマです"));
    }
    if !ALLOWED_COLUMN_SCALES.contains(&g.column_scale.as_str()) {
        return Err(invalid("globalSettings.columnScale", "未対応の倍率です"));
    }
    check_chars("globalSettings.customCSS", &g.custom_css, MAX_CSS_CHARS)?;
    check_chars(
        "globalSettings.defaultColumnCustomCSS",
        &g.default_column_custom_css,
        MAX_CSS_CHARS,
    )?;
    check_chars(
        "globalSettings.smallImageWidth",
        &g.small_image_width,
        MAX_LABEL_CHARS,
    )?;
    check_chars(
        "globalSettings.blurImageAmount",
        &g.blur_image_amount,
        MAX_LABEL_CHARS,
    )?;
    check_opt_chars(
        "globalSettings.defaultAccountId",
        &g.default_account_id,
        MAX_ID_CHARS,
    )?;
    check_list("globalSettings.ngWords", &g.ng_words)?;
    check_list(
        "globalSettings.repostHiddenUserIds",
        &g.repost_hidden_user_ids,
    )?;
    if g.presets.len() > MAX_PRESETS {
        return Err(limit("globalSettings.presets", MAX_PRESETS));
    }
    for preset in &g.presets {
        check_chars("globalSettings.presets.id", &preset.id, MAX_ID_CHARS)?;
        check_chars("globalSettings.presets.name", &preset.name, MAX_LABEL_CHARS)?;
        validate_columns(&preset.columns)?;
    }
    Ok(())
}

fn validate_accounts(accounts: &[BackupAccount]) -> Result<(), BackupError> {
    if accounts.len() > MAX_ACCOUNTS {
        return Err(limit("accounts", MAX_ACCOUNTS));
    }
    for account in accounts {
        check_chars(
            "accounts.backupAccountId",
            &account.backup_account_id,
            MAX_ID_CHARS,
        )?;
        check_chars("accounts.label", &account.label, MAX_LABEL_CHARS)?;
        check_chars("accounts.color", &account.color, MAX_LABEL_CHARS)?;
        check_opt_chars("accounts.xUserId", &account.x_user_id, MAX_LABEL_CHARS)?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// 読み込み
// ---------------------------------------------------------------------------

/// 古いスキーマバージョンのファイルを現行へ段階的に移行する枠。
/// 初版（1）は現行そのものなので何もしない。スキーマを上げるときは、
/// `from_version` ごとに「1 つ上の版へ変換する」処理をここに足して現行まで繰り返す。
pub fn migrate_to_current(value: Value, from_version: u64) -> Result<Value, BackupError> {
    if from_version < u64::from(SCHEMA_VERSION) {
        // 現在は移行元となる古い版が存在しない。
        return Err(invalid("schemaVersion", "移行できない古いバージョンです"));
    }
    Ok(value)
}

/// バックアップファイルのバイト列を検証して読み込む（純粋関数・ストア非依存）。
pub fn parse_backup(bytes: &[u8]) -> Result<BackupFile, BackupError> {
    if bytes.len() > MAX_FILE_BYTES {
        return Err(BackupError::TooLarge {
            size: bytes.len() as u64,
            limit: MAX_FILE_BYTES as u64,
        });
    }
    let body = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(bytes);
    let value: Value = serde_json::from_slice(body).map_err(|e| BackupError::BrokenJson {
        message: e.to_string(),
    })?;

    let found_format = value.get("format").and_then(Value::as_str);
    if found_format != Some(BACKUP_FORMAT) {
        return Err(BackupError::FormatMismatch {
            found: found_format.map(str::to_string),
        });
    }

    let version = match value.get("schemaVersion").and_then(Value::as_u64) {
        Some(v) if v >= 1 => v,
        _ => return Err(invalid("schemaVersion", "1 以上の整数で指定してください")),
    };
    let current = u64::from(SCHEMA_VERSION);
    if version > current {
        return Err(BackupError::FutureVersion {
            found: version,
            current,
        });
    }

    let migrated = migrate_to_current(value, version)?;
    let file: BackupFile =
        serde_json::from_value(migrated).map_err(|e| invalid("file", &e.to_string()))?;

    validate_accounts(&file.accounts)?;
    validate_columns(&file.columns)?;
    validate_global_settings(&file.global_settings)?;
    Ok(file)
}

// ---------------------------------------------------------------------------
// エクスポート
// ---------------------------------------------------------------------------

/// 現在の設定からバックアップ内容を作る（ホワイトリスト変換）。
/// `exported_at` は RFC 3339（UTC）文字列。
pub fn build_export(
    settings: &AppSettingsData,
    app_version: &str,
    exported_at: &str,
) -> BackupFile {
    BackupFile {
        format: BACKUP_FORMAT.to_string(),
        schema_version: SCHEMA_VERSION,
        app_version: app_version.to_string(),
        exported_at: exported_at.to_string(),
        accounts: settings.accounts.iter().map(export_account).collect(),
        columns: settings.columns.iter().map(BackupColumn::from).collect(),
        global_settings: BackupGlobalSettings::from(&settings.global_settings),
    }
}

/// バックアップファイルの拡張子（保存ダイアログの既定名に付ける）。
pub const BACKUP_FILE_EXTENSION: &str = ".mcxbackup.json";

/// UTC の Unix 秒を RFC 3339（`YYYY-MM-DDTHH:MM:SSZ`）にする。
pub fn rfc3339_utc(unix_secs: u64) -> String {
    let (year, month, day, hour, minute, second) =
        crate::commands::settings::utc_datetime_parts(unix_secs);
    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}Z")
}

/// 保存ダイアログの既定ファイル名（`multi-column-x-YYYYMMDD.mcxbackup.json`）。
pub fn export_file_name(unix_secs: u64) -> String {
    let (year, month, day, ..) = crate::commands::settings::utc_datetime_parts(unix_secs);
    format!("multi-column-x-{year:04}{month:02}{day:02}{BACKUP_FILE_EXTENSION}")
}

/// アカウントはバックアップ用 ID・ラベル・色・X ユーザー ID だけを出す。
/// `backupAccountId` は元の `account.id` を再利用する（ファイル内参照用で、復元先には引き継がれない）。
fn export_account(account: &AccountData) -> BackupAccount {
    BackupAccount {
        backup_account_id: account.id.clone(),
        label: account.label.clone(),
        color: account.color.clone(),
        x_user_id: account.x_user_id.clone(),
    }
}
