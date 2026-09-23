use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tauri_plugin_store::StoreExt;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AccountData {
    pub id: String,
    pub label: String,
    #[serde(rename = "dataDirectory")]
    pub data_directory: String,
    pub color: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "xUserId", default)]
    pub x_user_id: Option<String>,
}

// ColumnSettings は構造体レベルの #[serde(default)] により、キーが欠落しているフィールドは
// すべて impl Default for ColumnSettings（このすぐ下）の値にフォールバックする。
// フィールドごとの既定値の唯一の定義元は impl Default であり、#[serde(default = "...")] は使わない。
// TypeScript 側の対応定義: src/types/index.ts の DEFAULT_COLUMN_SETTINGS
// 値を変更するときは TypeScript 側も必ず合わせること。
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(default)]
pub struct ColumnSettings {
    #[serde(rename = "autoReloadEnabled")]
    pub auto_reload_enabled: bool,
    #[serde(rename = "autoReloadInterval")]
    pub auto_reload_interval: u32,
    #[serde(rename = "showCountdown")]
    pub show_countdown: bool,
    #[serde(rename = "hideHeaderEnabled")]
    pub hide_header_enabled: bool,
    #[serde(rename = "hideTweetInputEnabled")]
    pub hide_tweet_input_enabled: bool,
    #[serde(rename = "showCustomMenu")]
    pub show_custom_menu: bool,
    #[serde(rename = "customCSS")]
    pub custom_css: String,
    #[serde(rename = "scrollPosRestoreEnabled")]
    pub scroll_pos_restore_enabled: bool,
    #[serde(rename = "visibleLinks")]
    pub visible_links: Vec<String>,
    #[serde(rename = "smallImageEnabled")]
    pub small_image_enabled: bool,
    #[serde(rename = "smallImageWidth")]
    pub small_image_width: String,
    #[serde(rename = "blurImageEnabled")]
    pub blur_image_enabled: bool,
    #[serde(rename = "blurImageAmount")]
    pub blur_image_amount: String,
    #[serde(rename = "ngWords")]
    pub ng_words: Vec<String>,
    #[serde(rename = "repostHiddenUserIds")]
    pub repost_hidden_user_ids: Vec<String>,
    #[serde(rename = "whitelistEnabled")]
    pub whitelist_enabled: bool,
    #[serde(rename = "whitelistWords")]
    pub whitelist_words: Vec<String>,
    #[serde(rename = "desktopNotifyEnabled")]
    pub desktop_notify_enabled: bool,
}

// ColumnSettings のデフォルト値（新規インストール時 / キー欠落時の唯一の定義元）。
// TypeScript 側の対応定義: src/types/index.ts の DEFAULT_COLUMN_SETTINGS
// 値を変更するときは TypeScript 側も必ず合わせること（契約テスト: contracts/default-settings.json の columnSettings）。
impl Default for ColumnSettings {
    fn default() -> Self {
        Self {
            auto_reload_enabled: true,
            auto_reload_interval: 600,
            show_countdown: true,
            hide_header_enabled: true,
            hide_tweet_input_enabled: true,
            show_custom_menu: false,
            custom_css: String::new(),
            scroll_pos_restore_enabled: true,
            visible_links: vec![],
            small_image_enabled: false,
            small_image_width: "50%".to_string(),
            blur_image_enabled: false,
            blur_image_amount: "10px".to_string(),
            ng_words: vec![],
            repost_hidden_user_ids: vec![],
            whitelist_enabled: false,
            whitelist_words: vec![],
            desktop_notify_enabled: false,
        }
    }
}

// デシリアライズ時のデフォルト値ヘルパー関数。
// ColumnData / GlobalSettingsData の一部フィールドで個別に参照する。
fn default_height_mode() -> String {
    "auto".to_string()
}
fn default_column_scale() -> String {
    "default".to_string()
}

impl Default for WindowBounds {
    fn default() -> Self {
        Self {
            x: 0.0,
            y: 0.0,
            width: 1400.0,
            height: 900.0,
        }
    }
}

// GlobalSettingsData のデフォルト値。
// TypeScript 側の対応定義: src/types/index.ts の DEFAULT_GLOBAL_SETTINGS
// 値を変更するときは TypeScript 側も必ず合わせること。
impl Default for GlobalSettingsData {
    fn default() -> Self {
        Self {
            theme: "dark".to_string(),
            custom_css: String::new(),
            window_bounds: WindowBounds::default(),
            default_account_id: None,
            default_auto_reload_enabled: true,
            default_auto_reload_interval: 600,
            default_show_countdown: true,
            default_hide_header_enabled: true,
            default_hide_tweet_input_enabled: true,
            default_show_custom_menu: false,
            default_scroll_pos_restore_enabled: false,
            default_column_custom_css: String::new(),
            popup_esc_close_enabled: true,
            video_auto_play_stop_enabled: true,
            image_popup_enabled: true,
            video_popup_enabled: true,
            show_sort_buttons: false,
            small_image_enabled: false,
            small_image_width: "50%".to_string(),
            blur_image_enabled: false,
            blur_image_amount: "10px".to_string(),
            hide_ad_enabled: true,
            api_rate_limit_monitor_enabled: true,
            column_scale: default_column_scale(),
            use_x_app_for_compose: false,
            mobile_swipe_area_enabled: true,
            mobile_swipe_area_height: 28,
            mobile_swipe_area_opacity: 50,
            mobile_two_column_enabled: true,
            presets: vec![],
            ng_words: vec![],
            repost_hidden_user_ids: vec![],
            pending_data_directory_deletions: vec![],
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ColumnData {
    pub id: String,
    #[serde(rename = "accountId")]
    pub account_id: String,
    #[serde(rename = "pageType")]
    pub page_type: String,
    #[serde(rename = "customUrl")]
    pub custom_url: Option<String>,
    #[serde(rename = "homeTabName")]
    pub home_tab_name: Option<String>,
    #[serde(rename = "searchQuery")]
    pub search_query: Option<String>,
    /// 検索カラムを追加した時点で「最新」タブ指定を記録するフラグ。既存の保存済みカラムには存在しないため false。
    #[serde(rename = "searchLiveTab")]
    #[serde(default)]
    pub search_live_tab: bool,
    #[serde(rename = "listId")]
    pub list_id: Option<String>,
    pub width: f64,
    pub order: u32,
    pub label: Option<String>,
    pub settings: ColumnSettings,
    #[serde(rename = "gridRow")]
    #[serde(default)]
    pub grid_row: u32,
    #[serde(rename = "gridCol")]
    #[serde(default)]
    pub grid_col: u32,
    #[serde(rename = "heightMode")]
    #[serde(default = "default_height_mode")]
    pub height_mode: String,
    #[serde(rename = "heightValue")]
    pub height_value: Option<f64>,
    #[serde(rename = "heightUnit")]
    pub height_unit: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct WindowBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ColumnPresetData {
    pub id: String,
    pub name: String,
    pub columns: Vec<ColumnData>,
}

// GlobalSettingsData は構造体レベルの #[serde(default)] により、キーが欠落しているフィールドは
// すべて impl Default for GlobalSettingsData（このすぐ下）の値にフォールバックする。
// フィールドごとの既定値の唯一の定義元は impl Default であり、#[serde(default = "...")] は使わない。
// TypeScript 側の対応定義: src/types/index.ts の DEFAULT_GLOBAL_SETTINGS
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(default)]
pub struct GlobalSettingsData {
    pub theme: String,
    #[serde(rename = "customCSS")]
    pub custom_css: String,
    #[serde(rename = "windowBounds")]
    pub window_bounds: WindowBounds,
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
    #[serde(rename = "showSortButtons")]
    pub show_sort_buttons: bool,
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
    pub presets: Vec<ColumnPresetData>,
    #[serde(rename = "ngWords")]
    pub ng_words: Vec<String>,
    #[serde(rename = "repostHiddenUserIds")]
    pub repost_hidden_user_ids: Vec<String>,
    /// アカウント削除時にデータフォルダ削除へ失敗した保存先パスの再実行対象一覧。
    /// アプリ設定画面から手動で再実行できる（詳細: docs/development ではなく本フィールド追加時の plan.md 参照）。
    #[serde(rename = "pendingDataDirectoryDeletions")]
    #[serde(default)]
    pub pending_data_directory_deletions: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AppSettingsData {
    pub accounts: Vec<AccountData>,
    pub columns: Vec<ColumnData>,
    #[serde(rename = "globalSettings")]
    pub global_settings: GlobalSettingsData,
}

/// 旧 areaRemoveEnabled / defaultAreaRemoveEnabled を新フィールド
/// (hideHeaderEnabled / hideTweetInputEnabled, defaultHideHeaderEnabled / defaultHideTweetInputEnabled)
/// へ引き継ぐ。新フィールドが既に存在する場合は上書きしない（冪等）。
/// globalSettings.defaultAreaRemoveEnabled、トップレベル columns[].settings、
/// globalSettings.presets[].columns[].settings の3箇所を対象にする。
fn migrate_area_remove_enabled(value: &mut serde_json::Value) {
    fn migrate_column_settings(settings: &mut serde_json::Value) {
        let Some(obj) = settings.as_object_mut() else {
            return;
        };
        if let Some(old) = obj.get("areaRemoveEnabled").cloned() {
            obj.entry("hideHeaderEnabled")
                .or_insert_with(|| old.clone());
            obj.entry("hideTweetInputEnabled").or_insert(old);
        }
    }

    fn migrate_columns(columns: &mut serde_json::Value) {
        let Some(arr) = columns.as_array_mut() else {
            return;
        };
        for column in arr {
            if let Some(settings) = column.get_mut("settings") {
                migrate_column_settings(settings);
            }
        }
    }

    let Some(root) = value.as_object_mut() else {
        return;
    };

    if let Some(columns) = root.get_mut("columns") {
        migrate_columns(columns);
    }

    let Some(global) = root.get_mut("globalSettings") else {
        return;
    };
    let Some(gobj) = global.as_object_mut() else {
        return;
    };

    if let Some(old) = gobj.get("defaultAreaRemoveEnabled").cloned() {
        gobj.entry("defaultHideHeaderEnabled")
            .or_insert_with(|| old.clone());
        gobj.entry("defaultHideTweetInputEnabled").or_insert(old);
    }

    if let Some(presets) = gobj.get_mut("presets") {
        if let Some(parr) = presets.as_array_mut() {
            for preset in parr {
                if let Some(pcolumns) = preset.get_mut("columns") {
                    migrate_columns(pcolumns);
                }
            }
        }
    }
}

/// 保存済みの appSettings（無ければ None）を解析した結果。
/// `Loaded`/`Invalid` は AppSettingsData を含み比較的サイズが大きいため、
/// enum 全体のサイズを抑えるために Box に包む（clippy::large_enum_variant 対策）。
pub(crate) enum ParsedSettings {
    /// 正常に解析できた。
    Loaded(Box<AppSettingsData>),
    /// appSettings キー自体が保存されていない（初回起動）。
    Missing,
    /// 解析に失敗した。raw はマイグレーション前の元の JSON 値（退避用）。
    Invalid {
        raw: Box<serde_json::Value>,
        error: String,
    },
}

/// 保存済みの appSettings を解析する。マイグレーションは解析前に適用するが、
/// 退避用に返す raw はマイグレーション前の値にする（手で復旧できるように）。
pub(crate) fn parse_stored_settings(stored: Option<serde_json::Value>) -> ParsedSettings {
    let Some(raw) = stored else {
        return ParsedSettings::Missing;
    };

    let mut migrated = raw.clone();
    migrate_area_remove_enabled(&mut migrated);

    match serde_json::from_value::<AppSettingsData>(migrated) {
        Ok(settings) => ParsedSettings::Loaded(Box::new(settings)),
        Err(e) => ParsedSettings::Invalid {
            raw: Box::new(raw),
            error: e.to_string(),
        },
    }
}

/// UTC の Unix 秒からグレゴリオ暦の年月日を求める（Howard Hinnant の
/// civil_from_days アルゴリズム）。参考: http://howardhinnant.github.io/date_algorithms.html
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}

/// 退避ファイル名を生成する（純粋関数）。既存の退避ファイルを上書きしないよう
/// タイムスタンプ（UTC, YYYYMMDD-HHMMSS）を含める。
pub(crate) fn backup_file_name(unix_secs: u64) -> String {
    let days = (unix_secs / 86400) as i64;
    let secs_of_day = unix_secs % 86400;
    let (year, month, day) = civil_from_days(days);
    let hour = secs_of_day / 3600;
    let minute = (secs_of_day % 3600) / 60;
    let second = secs_of_day % 60;
    format!("settings.json.{year:04}{month:02}{day:02}-{hour:02}{minute:02}{second:02}.bak")
}

/// 解析に失敗した元データを app_data_dir 配下へ退避する。
/// 退避に失敗しても起動は継続するため、失敗時は None を返しログに出す。
fn backup_invalid_settings(app: &AppHandle, raw: &serde_json::Value) -> Option<String> {
    let dir = match app.path().app_data_dir() {
        Ok(d) => d,
        Err(e) => {
            log::error!("設定の退避先ディレクトリの取得に失敗しました: {e}");
            return None;
        }
    };
    if let Err(e) = std::fs::create_dir_all(&dir) {
        log::error!("設定の退避先ディレクトリの作成に失敗しました: {e}");
        return None;
    }

    let unix_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let path = dir.join(backup_file_name(unix_secs));

    let content = match serde_json::to_string_pretty(raw) {
        Ok(c) => c,
        Err(e) => {
            log::error!("退避データのシリアライズに失敗しました: {e}");
            return None;
        }
    };

    match std::fs::write(&path, content) {
        Ok(()) => Some(path.to_string_lossy().to_string()),
        Err(e) => {
            log::error!("設定の退避に失敗しました: {e}");
            None
        }
    }
}

/// load_settings の戻り値。解析に失敗したときは既定値で起動しつつ、
/// loadFailed / backupPath でフロントへ通知する。
#[derive(Serialize)]
pub struct LoadSettingsResult {
    pub settings: AppSettingsData,
    #[serde(rename = "loadFailed")]
    pub load_failed: bool,
    #[serde(rename = "backupPath")]
    pub backup_path: Option<String>,
}

#[tauri::command]
pub async fn load_settings(
    caller: tauri::Webview,
    app: AppHandle,
) -> Result<LoadSettingsResult, String> {
    crate::commands::require_main_caller(&caller)?;
    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    let stored = store.get("appSettings");

    match parse_stored_settings(stored) {
        ParsedSettings::Loaded(settings) => Ok(LoadSettingsResult {
            settings: *settings,
            load_failed: false,
            backup_path: None,
        }),
        ParsedSettings::Missing => Ok(LoadSettingsResult {
            settings: AppSettingsData::default(),
            load_failed: false,
            backup_path: None,
        }),
        ParsedSettings::Invalid { raw, error } => {
            log::error!("設定の読み込みに失敗しました: {error}");
            let backup_path = backup_invalid_settings(&app, &raw);
            Ok(LoadSettingsResult {
                settings: AppSettingsData::default(),
                load_failed: true,
                backup_path,
            })
        }
    }
}

#[tauri::command]
pub async fn save_settings(
    caller: tauri::Webview,
    app: AppHandle,
    settings: AppSettingsData,
) -> Result<(), String> {
    crate::commands::require_main_caller(&caller)?;
    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    store.set(
        "appSettings",
        serde_json::to_value(&settings).map_err(|e| e.to_string())?,
    );
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn window_bounds_default_values() {
        let wb = WindowBounds::default();
        assert_eq!(wb.x, 0.0);
        assert_eq!(wb.y, 0.0);
        assert_eq!(wb.width, 1400.0);
        assert_eq!(wb.height, 900.0);
    }

    #[test]
    fn global_settings_default_theme_is_dark() {
        let gs = GlobalSettingsData::default();
        assert_eq!(gs.theme, "dark");
    }

    #[test]
    fn global_settings_default_column_scale_is_default() {
        let gs = GlobalSettingsData::default();
        assert_eq!(gs.column_scale, "default");
    }

    #[test]
    fn global_settings_default_popup_esc_close_enabled() {
        let gs = GlobalSettingsData::default();
        assert!(gs.popup_esc_close_enabled);
    }

    #[test]
    fn global_settings_default_image_popup_enabled() {
        let gs = GlobalSettingsData::default();
        assert!(gs.image_popup_enabled);
    }

    #[test]
    fn global_settings_default_video_popup_enabled() {
        let gs = GlobalSettingsData::default();
        assert!(gs.video_popup_enabled);
    }

    #[test]
    fn global_settings_default_mobile_swipe_area() {
        let gs = GlobalSettingsData::default();
        assert!(gs.mobile_swipe_area_enabled);
        assert_eq!(gs.mobile_swipe_area_height, 28);
        assert_eq!(gs.mobile_swipe_area_opacity, 50);
    }

    #[test]
    fn global_settings_default_mobile_two_column_enabled() {
        let gs = GlobalSettingsData::default();
        assert!(gs.mobile_two_column_enabled);
    }

    /// mobileTwoColumnEnabled 追加前に保存された旧 GlobalSettings JSON を
    /// デシリアライズしてもエラーにならず、デフォルト値 true にフォールバックすることを確認する。
    #[test]
    fn mobile_two_column_enabledが無い旧設定はデフォルトでtrueになる() {
        let json = serde_json::json!({
            "theme": "dark",
            "customCSS": "",
            "windowBounds": { "x": 0.0, "y": 0.0, "width": 1400.0, "height": 900.0 },
            "defaultAccountId": null,
        });
        let settings: GlobalSettingsData = serde_json::from_value(json).unwrap();
        assert!(settings.mobile_two_column_enabled);
    }

    #[test]
    fn global_settings_default_auto_reload_interval() {
        let gs = GlobalSettingsData::default();
        assert_eq!(gs.default_auto_reload_interval, 600);
    }

    #[test]
    fn app_settings_default_has_empty_collections() {
        let settings = AppSettingsData::default();
        assert!(settings.accounts.is_empty());
        assert!(settings.columns.is_empty());
    }

    /// TS 側（src/types/defaults.contract.test.ts）と同じ fixture を参照する契約テスト。
    /// デフォルト値を変更したら contracts/default-settings.json を再生成すること。
    /// fixture にはカラム設定の既定値契約用の `columnSettings` キーも同居しているため、
    /// AppSettingsData に対応する accounts / columns / globalSettings の3キーのみを比較する。
    #[test]
    fn default_settings_match_contract_fixture() {
        let fixture: serde_json::Value =
            serde_json::from_str(include_str!("../../../contracts/default-settings.json")).unwrap();
        let expected = serde_json::json!({
            "accounts": fixture["accounts"],
            "columns": fixture["columns"],
            "globalSettings": fixture["globalSettings"],
        });
        let actual = serde_json::to_value(AppSettingsData::default()).unwrap();
        assert_eq!(actual, expected);
    }

    /// キーが全く無い空の全体設定 JSON（`{}`）を読み込んだ結果が、
    /// 新規インストール時の既定値（contracts/default-settings.json の globalSettings）と一致することを確認する。
    #[test]
    fn 空の全体設定を読み込むと新規インストール時の既定値と一致する() {
        let fixture: serde_json::Value =
            serde_json::from_str(include_str!("../../../contracts/default-settings.json")).unwrap();
        let settings: GlobalSettingsData = serde_json::from_value(serde_json::json!({})).unwrap();
        let actual = serde_json::to_value(&settings).unwrap();
        assert_eq!(actual, fixture["globalSettings"]);
    }

    /// showSortButtons が欠落した旧全体設定は、新規インストール時と同じ false になる
    /// （旧 serde 既定値 true から変更）。
    #[test]
    fn showsortbuttonsが無い旧全体設定はデフォルトでfalseになる() {
        let settings: GlobalSettingsData = serde_json::from_value(serde_json::json!({})).unwrap();
        assert!(!settings.show_sort_buttons);
    }

    /// defaultScrollPosRestoreEnabled が欠落した旧全体設定は、新規インストール時と同じ false になる
    /// （旧 serde 既定値 true から変更）。
    #[test]
    fn defaultscrollposrestoreenabledが無い旧全体設定はデフォルトでfalseになる() {
        let settings: GlobalSettingsData = serde_json::from_value(serde_json::json!({})).unwrap();
        assert!(!settings.default_scroll_pos_restore_enabled);
    }

    /// videoAutoPlayStopEnabled が欠落した旧全体設定は、新規インストール時と同じ true になる
    /// （旧 serde 既定値 false から変更）。
    #[test]
    fn videoautoplaystopenabledが無い旧全体設定はデフォルトでtrueになる() {
        let settings: GlobalSettingsData = serde_json::from_value(serde_json::json!({})).unwrap();
        assert!(settings.video_auto_play_stop_enabled);
    }

    /// hideAdEnabled が欠落した旧全体設定は、新規インストール時と同じ true になる
    /// （旧 serde 既定値 false から変更）。
    #[test]
    fn hideadenabledが無い旧全体設定はデフォルトでtrueになる() {
        let settings: GlobalSettingsData = serde_json::from_value(serde_json::json!({})).unwrap();
        assert!(settings.hide_ad_enabled);
    }

    /// defaultAccountId 等これまで必須だったフィールドが欠落していても
    /// エラーにならず既定値（None）になることを確認する。
    #[test]
    fn defaultaccountidが無い旧全体設定はデフォルトでnoneになる() {
        let settings: GlobalSettingsData = serde_json::from_value(serde_json::json!({})).unwrap();
        assert_eq!(settings.default_account_id, None);
    }

    /// カラム設定の showCustomMenu が欠落しているとき、新規インストール時と同じ false（無効）になる。
    #[test]
    fn カラム設定のカスタムメニューのキーが無いときは無効になる() {
        let json = serde_json::json!({
            "autoReloadEnabled": true,
            "autoReloadInterval": 600,
            "customCSS": "",
        });
        let settings: ColumnSettings = serde_json::from_value(json).unwrap();
        assert!(!settings.show_custom_menu);
    }

    /// キーが全く無い空のカラム設定 JSON（`{}`）を読み込んだ結果が、
    /// 新規インストール時の既定値（contracts/default-settings.json の columnSettings、
    /// TS の DEFAULT_COLUMN_SETTINGS 相当）と一致することを確認する。
    #[test]
    fn 空のカラム設定を読み込むと新規インストール時の既定値と一致する() {
        let fixture: serde_json::Value =
            serde_json::from_str(include_str!("../../../contracts/default-settings.json")).unwrap();
        let settings: ColumnSettings = serde_json::from_value(serde_json::json!({})).unwrap();
        let actual = serde_json::to_value(&settings).unwrap();
        assert_eq!(actual, fixture["columnSettings"]);
    }

    /// 新フィールド追加前に保存された旧カラム設定 JSON（desktopNotifyEnabled 欠落）を
    /// デシリアライズしてもエラーにならず、デフォルト値 false にフォールバックすることを確認する。
    #[test]
    fn 通知設定フィールドが無い旧カラム設定はデフォルトで通知しない() {
        let json = serde_json::json!({
            "autoReloadEnabled": true,
            "autoReloadInterval": 600,
            "areaRemoveEnabled": true,
            "customCSS": "",
        });
        let settings: ColumnSettings = serde_json::from_value(json).unwrap();
        assert!(!settings.desktop_notify_enabled);
    }

    /// リポスト非表示ユーザーID追加前に保存された旧カラム設定 JSON（repostHiddenUserIds 欠落）を
    /// デシリアライズしてもエラーにならず、空配列にフォールバックすることを確認する。
    #[test]
    fn 旧バージョンのカラム設定はリポスト元ユーザーidが空として読み込まれる() {
        let json = serde_json::json!({
            "autoReloadEnabled": true,
            "autoReloadInterval": 600,
            "customCSS": "",
        });
        let settings: ColumnSettings = serde_json::from_value(json).unwrap();
        assert!(settings.repost_hidden_user_ids.is_empty());
    }

    /// 同上の全体設定版。repostHiddenUserIds が欠落した旧 GlobalSettings JSON は空配列になる。
    #[test]
    fn 旧バージョンの全体設定はリポスト元ユーザーidが空として読み込まれる() {
        let json = serde_json::json!({
            "theme": "dark",
            "customCSS": "",
            "windowBounds": { "x": 0.0, "y": 0.0, "width": 1400.0, "height": 900.0 },
            "defaultAccountId": null,
        });
        let settings: GlobalSettingsData = serde_json::from_value(json).unwrap();
        assert!(settings.repost_hidden_user_ids.is_empty());
    }

    /// アカウント削除時のデータフォルダ削除リトライ機能追加前に保存された旧 GlobalSettings JSON
    /// （pendingDataDirectoryDeletions 欠落）をデシリアライズしてもエラーにならず、
    /// 空配列にフォールバックすることを確認する。
    #[test]
    fn 旧バージョンの全体設定は削除保留フォルダが空として読み込まれる() {
        let json = serde_json::json!({
            "theme": "dark",
            "customCSS": "",
            "windowBounds": { "x": 0.0, "y": 0.0, "width": 1400.0, "height": 900.0 },
            "defaultAccountId": null,
        });
        let settings: GlobalSettingsData = serde_json::from_value(json).unwrap();
        assert!(settings.pending_data_directory_deletions.is_empty());
    }

    /// 削除保留フォルダは JSON のキー名 pendingDataDirectoryDeletions で読み書きでき、
    /// 保存→読み込み（アプリ再起動相当）を経ても内容が保持される。
    #[test]
    fn 削除保留フォルダはjsonのキー名pendingdatadirectorydeletionsで読み書きできてラウンドトリップする(
    ) {
        let json = serde_json::json!({
            "theme": "dark",
            "customCSS": "",
            "windowBounds": { "x": 0.0, "y": 0.0, "width": 1400.0, "height": 900.0 },
            "defaultAccountId": null,
            "pendingDataDirectoryDeletions": ["/data/accounts/account-a"],
        });
        let settings: GlobalSettingsData = serde_json::from_value(json).unwrap();
        assert_eq!(
            settings.pending_data_directory_deletions,
            vec!["/data/accounts/account-a".to_string()]
        );
        let value = serde_json::to_value(&settings).unwrap();
        assert_eq!(
            value["pendingDataDirectoryDeletions"],
            serde_json::json!(["/data/accounts/account-a"])
        );
        // 保存→読み込みで保持される（アプリ再起動を想定したラウンドトリップ）
        let restored: GlobalSettingsData = serde_json::from_value(value).unwrap();
        assert_eq!(
            restored.pending_data_directory_deletions,
            settings.pending_data_directory_deletions
        );
    }

    #[test]
    fn リポスト元ユーザーidはjsonのキー名reposthiddenuseridsで読み書きできる() {
        let json = serde_json::json!({
            "autoReloadEnabled": true,
            "autoReloadInterval": 600,
            "customCSS": "",
            "repostHiddenUserIds": ["alice", "Bob_1"],
        });
        let settings: ColumnSettings = serde_json::from_value(json).unwrap();
        assert_eq!(
            settings.repost_hidden_user_ids,
            vec!["alice".to_string(), "Bob_1".to_string()]
        );
        let value = serde_json::to_value(&settings).unwrap();
        assert_eq!(
            value["repostHiddenUserIds"],
            serde_json::json!(["alice", "Bob_1"])
        );
    }

    #[test]
    fn app_settings_default_roundtrips_through_json() {
        let settings = AppSettingsData::default();
        let json = serde_json::to_value(&settings).unwrap();
        let restored: AppSettingsData = serde_json::from_value(json).unwrap();
        assert_eq!(
            restored.global_settings.theme,
            settings.global_settings.theme
        );
        assert_eq!(
            restored.global_settings.column_scale,
            settings.global_settings.column_scale
        );
    }

    /// xUserId 追加前に保存された旧 account JSON をデシリアライズしてもエラーにならず、
    /// x_user_id が None にフォールバックすることを確認する。
    #[test]
    fn xuserid無しの既存jsonをデシリアライズできる() {
        let json = serde_json::json!({
            "id": "acc-1",
            "label": "テストアカウント",
            "dataDirectory": "/path/to/data",
            "color": "#1d9bf0",
            "createdAt": "2026-05-02T00:00:00Z",
        });
        let account: AccountData = serde_json::from_value(json).unwrap();
        assert_eq!(account.x_user_id, None);
    }

    #[test]
    fn xuserid有りのjsonをデシリアライズできる() {
        let json = serde_json::json!({
            "id": "acc-1",
            "label": "テストアカウント",
            "dataDirectory": "/path/to/data",
            "color": "#1d9bf0",
            "createdAt": "2026-05-02T00:00:00Z",
            "xUserId": "1234567890",
        });
        let account: AccountData = serde_json::from_value(json).unwrap();
        assert_eq!(account.x_user_id, Some("1234567890".to_string()));
    }

    /// トップレベル columns[].settings の旧 areaRemoveEnabled: false が、
    /// 新フィールド hideHeaderEnabled / hideTweetInputEnabled の両方に false として移行されることを確認する。
    #[test]
    fn 旧arearemoveenabledがfalseの場合両方の新フィールドがfalseに移行される() {
        let mut json = serde_json::json!({
            "columns": [
                {
                    "id": "col-1",
                    "settings": {
                        "areaRemoveEnabled": false,
                        "customCSS": "",
                    }
                }
            ]
        });

        migrate_area_remove_enabled(&mut json);

        let settings = &json["columns"][0]["settings"];
        assert_eq!(settings["hideHeaderEnabled"], serde_json::json!(false));
        assert_eq!(settings["hideTweetInputEnabled"], serde_json::json!(false));
    }

    /// areaRemoveEnabled: false と hideHeaderEnabled: true が両方存在する場合、
    /// マイグレーション後も hideHeaderEnabled は true のまま変わらない（新フィールド優先・冪等性）。
    #[test]
    fn 新フィールドが既に存在する場合は旧フィールドで上書きされない() {
        let mut json = serde_json::json!({
            "columns": [
                {
                    "id": "col-1",
                    "settings": {
                        "areaRemoveEnabled": false,
                        "hideHeaderEnabled": true,
                        "customCSS": "",
                    }
                }
            ]
        });

        migrate_area_remove_enabled(&mut json);

        let settings = &json["columns"][0]["settings"];
        assert_eq!(settings["hideHeaderEnabled"], serde_json::json!(true));
        // hideTweetInputEnabled は未設定だったので areaRemoveEnabled の値(false)が移行される。
        assert_eq!(settings["hideTweetInputEnabled"], serde_json::json!(false));
    }

    /// globalSettings.defaultAreaRemoveEnabled の値が defaultHideHeaderEnabled /
    /// defaultHideTweetInputEnabled の両方に伝播することを確認する。
    #[test]
    fn globalsettingsのdefaultarearemoveenabledが両方の新フィールドに移行される() {
        let mut json = serde_json::json!({
            "globalSettings": {
                "defaultAreaRemoveEnabled": false,
            }
        });

        migrate_area_remove_enabled(&mut json);

        let global = &json["globalSettings"];
        assert_eq!(global["defaultHideHeaderEnabled"], serde_json::json!(false));
        assert_eq!(
            global["defaultHideTweetInputEnabled"],
            serde_json::json!(false)
        );
    }

    /// globalSettings.presets[].columns[].settings の areaRemoveEnabled も
    /// トップレベル columns と同様に移行されることを確認する（見落としやすい箇所）。
    #[test]
    fn プリセット内カラム設定のarearemoveenabledも移行される() {
        let mut json = serde_json::json!({
            "globalSettings": {
                "presets": [
                    {
                        "id": "preset-1",
                        "name": "プリセット1",
                        "columns": [
                            {
                                "id": "col-1",
                                "settings": {
                                    "areaRemoveEnabled": false,
                                    "customCSS": "",
                                }
                            }
                        ]
                    }
                ]
            }
        });

        migrate_area_remove_enabled(&mut json);

        let settings = &json["globalSettings"]["presets"][0]["columns"][0]["settings"];
        assert_eq!(settings["hideHeaderEnabled"], serde_json::json!(false));
        assert_eq!(settings["hideTweetInputEnabled"], serde_json::json!(false));
    }

    /// contracts/default-settings.json（実際にアプリが保存する既定値と同じ形の JSON）は
    /// 正常に解析できる（false-positive でバックアップ・通知が発生しないことの回帰ガード）。
    #[test]
    fn contracts配下の既定設定jsonは正常に解析できる() {
        let fixture: serde_json::Value =
            serde_json::from_str(include_str!("../../../contracts/default-settings.json")).unwrap();
        let result = parse_stored_settings(Some(fixture));
        assert!(matches!(result, ParsedSettings::Loaded(_)));
    }

    #[test]
    fn 解析できない設定は退避対象として返る() {
        let json = serde_json::json!({
            "accounts": "壊れた値",
            "columns": [],
            "globalSettings": {},
        });
        let result = parse_stored_settings(Some(json));
        assert!(matches!(result, ParsedSettings::Invalid { .. }));
    }

    #[test]
    fn 正しい設定は読み込まれる() {
        let json = serde_json::to_value(AppSettingsData::default()).unwrap();
        let result = parse_stored_settings(Some(json));
        match result {
            ParsedSettings::Loaded(settings) => {
                assert_eq!(settings.global_settings.theme, "dark");
            }
            _ => panic!("Loaded になるはず"),
        }
    }

    #[test]
    fn 保存済み設定が無いときは未保存として扱う() {
        let result = parse_stored_settings(None);
        assert!(matches!(result, ParsedSettings::Missing));
    }

    /// GlobalSettingsData のうち #[serde(default)] が付いていないフィールド
    /// (theme, customCSS, windowBounds, defaultAccountId) だけを含む JSON でも解析できる。
    #[test]
    fn 必須項目だけの設定でも解析できる() {
        let json = serde_json::json!({
            "accounts": [],
            "columns": [],
            "globalSettings": {
                "theme": "dark",
                "customCSS": "",
                "windowBounds": { "x": 0.0, "y": 0.0, "width": 1400.0, "height": 900.0 },
                "defaultAccountId": null,
            },
        });
        let result = parse_stored_settings(Some(json));
        assert!(matches!(result, ParsedSettings::Loaded(_)));
    }

    /// 退避されるのはマイグレーション前の元の値であること（手で復旧できるようにするため）。
    /// areaRemoveEnabled のような旧フィールドがそのまま残り、移行後の hideHeaderEnabled は
    /// 追加されていないことを確認する。
    #[test]
    fn 退避されるrawはマイグレーション前の値のまま() {
        let json = serde_json::json!({
            "accounts": "壊れた値",
            "columns": [
                {
                    "id": "col-1",
                    "settings": {
                        "areaRemoveEnabled": true,
                        "customCSS": "",
                    }
                }
            ],
            "globalSettings": {},
        });
        let result = parse_stored_settings(Some(json));
        match result {
            ParsedSettings::Invalid { raw, .. } => {
                let settings = &raw["columns"][0]["settings"];
                assert_eq!(settings["areaRemoveEnabled"], serde_json::json!(true));
                assert!(settings.get("hideHeaderEnabled").is_none());
            }
            _ => panic!("Invalid になるはず"),
        }
    }

    #[test]
    fn 退避ファイル名はタイムスタンプを含む() {
        assert_eq!(backup_file_name(0), "settings.json.19700101-000000.bak");
        assert_eq!(
            backup_file_name(1_700_000_000),
            "settings.json.20231114-221320.bak"
        );
    }

    mod properties {
        use super::*;
        use proptest::prelude::*;

        /// フィールドが「存在しない」「存在してtrue」「存在してfalse」の3状態を表現する。
        fn maybe_bool() -> impl Strategy<Value = Option<bool>> {
            prop_oneof![Just(None), any::<bool>().prop_map(Some)]
        }

        /// Option<bool> を settings オブジェクトへ、Some(b) なら該当キーを b で追加し、
        /// None ならキー自体を追加しない、という形で組み立てるヘルパー。
        fn insert_if_some(
            obj: &mut serde_json::Map<String, serde_json::Value>,
            key: &str,
            v: Option<bool>,
        ) {
            if let Some(b) = v {
                obj.insert(key.to_string(), serde_json::json!(b));
            }
        }

        /// 任意個数(0〜3件)の column の settings に areaRemoveEnabled: old のみを設定した
        /// (hideHeaderEnabled / hideTweetInputEnabled は未設定の) JSON を組み立てる。
        fn build_columns_with_old_only(old: bool, count: usize) -> serde_json::Value {
            let columns: Vec<serde_json::Value> = (0..count)
                .map(|i| {
                    serde_json::json!({
                        "id": format!("col-{i}"),
                        "settings": {
                            "areaRemoveEnabled": old,
                            "customCSS": "",
                        }
                    })
                })
                .collect();
            serde_json::json!({ "columns": columns })
        }

        /// 任意の bool 値の組み合わせ(areaRemoveEnabled の値、hideHeaderEnabled /
        /// hideTweetInputEnabled が既に存在するかどうかとその値)を持つ、単一 column の
        /// settings JSON を組み立てる。
        fn build_column_settings(
            area_remove_enabled: Option<bool>,
            hide_header_enabled: Option<bool>,
            hide_tweet_input_enabled: Option<bool>,
        ) -> serde_json::Value {
            let mut obj = serde_json::Map::new();
            obj.insert("customCSS".to_string(), serde_json::json!(""));
            insert_if_some(&mut obj, "areaRemoveEnabled", area_remove_enabled);
            insert_if_some(&mut obj, "hideHeaderEnabled", hide_header_enabled);
            insert_if_some(&mut obj, "hideTweetInputEnabled", hide_tweet_input_enabled);
            serde_json::json!({
                "columns": [
                    { "id": "col-1", "settings": serde_json::Value::Object(obj) }
                ]
            })
        }

        proptest! {
            /// 性質1: 新フィールドが元々存在しない場合、areaRemoveEnabled(old) の値が
            /// すべての column の hideHeaderEnabled / hideTweetInputEnabled 両方に伝播する。
            #[test]
            fn 新フィールド未設定なら旧フィールドの値が全columnの新フィールドへ伝播する(
                old in any::<bool>(),
                count in 0usize..=3,
            ) {
                let mut json = build_columns_with_old_only(old, count);

                migrate_area_remove_enabled(&mut json);

                let columns = json["columns"].as_array().unwrap();
                prop_assert_eq!(columns.len(), count);
                for column in columns {
                    let settings = &column["settings"];
                    prop_assert_eq!(&settings["hideHeaderEnabled"], &serde_json::json!(old));
                    prop_assert_eq!(&settings["hideTweetInputEnabled"], &serde_json::json!(old));
                }
            }

            /// 性質2: migrate_area_remove_enabled は冪等である。
            /// areaRemoveEnabled / hideHeaderEnabled / hideTweetInputEnabled の
            /// 存在有無・値の任意の組み合わせに対し、1回適用した結果と
            /// さらにもう1回適用した結果が完全に一致する。
            #[test]
            fn マイグレーションは2回適用しても1回適用と同じ結果になる(
                area_remove_enabled in maybe_bool(),
                hide_header_enabled in maybe_bool(),
                hide_tweet_input_enabled in maybe_bool(),
            ) {
                let mut json = build_column_settings(
                    area_remove_enabled,
                    hide_header_enabled,
                    hide_tweet_input_enabled,
                );

                migrate_area_remove_enabled(&mut json);
                let once = json.clone();

                migrate_area_remove_enabled(&mut json);
                let twice = json;

                prop_assert_eq!(once, twice);
            }
        }
    }
}
