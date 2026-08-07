use serde::{Deserialize, Serialize};
use tauri::AppHandle;
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

// ColumnSettings の #[serde(default)] はカラム設定 JSON にフィールドが存在しない場合のフォールバック値。
// TypeScript 側の対応定義: src/types/index.ts の DEFAULT_COLUMN_SETTINGS
// 値を変更するときは TypeScript 側も必ず合わせること。
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ColumnSettings {
    #[serde(rename = "autoReloadEnabled")]
    pub auto_reload_enabled: bool,
    #[serde(rename = "autoReloadInterval")]
    pub auto_reload_interval: u32,
    #[serde(rename = "showCountdown")]
    #[serde(default = "default_true")]
    pub show_countdown: bool,
    #[serde(rename = "hideHeaderEnabled")]
    #[serde(default = "default_true")]
    pub hide_header_enabled: bool,
    #[serde(rename = "hideTweetInputEnabled")]
    #[serde(default = "default_true")]
    pub hide_tweet_input_enabled: bool,
    #[serde(rename = "showCustomMenu")]
    #[serde(default = "default_true")]
    pub show_custom_menu: bool,
    #[serde(rename = "customCSS")]
    pub custom_css: String,
    #[serde(rename = "scrollPosRestoreEnabled")]
    #[serde(default = "default_true")]
    pub scroll_pos_restore_enabled: bool,
    #[serde(rename = "visibleLinks")]
    #[serde(default)]
    pub visible_links: Vec<String>,
    #[serde(rename = "smallImageEnabled")]
    #[serde(default)]
    pub small_image_enabled: bool,
    #[serde(rename = "smallImageWidth")]
    #[serde(default = "default_small_image_width")]
    pub small_image_width: String,
    #[serde(rename = "blurImageEnabled")]
    #[serde(default)]
    pub blur_image_enabled: bool,
    #[serde(rename = "blurImageAmount")]
    #[serde(default = "default_blur_image_amount")]
    pub blur_image_amount: String,
    #[serde(rename = "ngWords")]
    #[serde(default)]
    pub ng_words: Vec<String>,
    #[serde(rename = "desktopNotifyEnabled")]
    #[serde(default)]
    pub desktop_notify_enabled: bool,
}

// デシリアライズ時のデフォルト値ヘルパー関数。
// TypeScript 側の対応定義: src/types/index.ts の DEFAULT_COLUMN_SETTINGS / DEFAULT_GLOBAL_SETTINGS
// 値を変更するときは TypeScript 側の対応定数も必ず合わせること。
fn default_true() -> bool {
    true
}
fn default_height_mode() -> String {
    "auto".to_string()
}
fn default_auto_reload_interval() -> u32 {
    600
}
fn default_small_image_width() -> String {
    "50%".to_string()
}
fn default_blur_image_amount() -> String {
    "10px".to_string()
}
fn default_column_scale() -> String {
    "default".to_string()
}
fn default_mobile_swipe_area_height() -> u32 {
    28
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
            mobile_two_column_enabled: true,
            presets: vec![],
            ng_words: vec![],
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

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct GlobalSettingsData {
    pub theme: String,
    #[serde(rename = "customCSS")]
    pub custom_css: String,
    #[serde(rename = "windowBounds")]
    pub window_bounds: WindowBounds,
    #[serde(rename = "defaultAccountId")]
    pub default_account_id: Option<String>,
    #[serde(rename = "defaultAutoReloadEnabled")]
    #[serde(default = "default_true")]
    pub default_auto_reload_enabled: bool,
    #[serde(rename = "defaultAutoReloadInterval")]
    #[serde(default = "default_auto_reload_interval")]
    pub default_auto_reload_interval: u32,
    #[serde(rename = "popupEscCloseEnabled")]
    #[serde(default = "default_true")]
    pub popup_esc_close_enabled: bool,
    #[serde(rename = "videoAutoPlayStopEnabled")]
    #[serde(default)]
    pub video_auto_play_stop_enabled: bool,
    #[serde(rename = "imagePopupEnabled")]
    #[serde(default = "default_true")]
    pub image_popup_enabled: bool,
    #[serde(rename = "videoPopupEnabled")]
    #[serde(default = "default_true")]
    pub video_popup_enabled: bool,
    #[serde(rename = "showSortButtons")]
    #[serde(default = "default_true")]
    pub show_sort_buttons: bool,
    #[serde(rename = "defaultShowCountdown")]
    #[serde(default = "default_true")]
    pub default_show_countdown: bool,
    #[serde(rename = "defaultHideHeaderEnabled")]
    #[serde(default = "default_true")]
    pub default_hide_header_enabled: bool,
    #[serde(rename = "defaultHideTweetInputEnabled")]
    #[serde(default = "default_true")]
    pub default_hide_tweet_input_enabled: bool,
    #[serde(rename = "defaultShowCustomMenu")]
    #[serde(default)]
    pub default_show_custom_menu: bool,
    #[serde(rename = "defaultScrollPosRestoreEnabled")]
    #[serde(default = "default_true")]
    pub default_scroll_pos_restore_enabled: bool,
    #[serde(rename = "defaultColumnCustomCSS")]
    #[serde(default)]
    pub default_column_custom_css: String,
    #[serde(rename = "smallImageEnabled")]
    #[serde(default)]
    pub small_image_enabled: bool,
    #[serde(rename = "smallImageWidth")]
    #[serde(default = "default_small_image_width")]
    pub small_image_width: String,
    #[serde(rename = "blurImageEnabled")]
    #[serde(default)]
    pub blur_image_enabled: bool,
    #[serde(rename = "blurImageAmount")]
    #[serde(default = "default_blur_image_amount")]
    pub blur_image_amount: String,
    #[serde(rename = "hideAdEnabled")]
    #[serde(default)]
    pub hide_ad_enabled: bool,
    #[serde(rename = "apiRateLimitMonitorEnabled")]
    #[serde(default = "default_true")]
    pub api_rate_limit_monitor_enabled: bool,
    #[serde(rename = "columnScale")]
    #[serde(default = "default_column_scale")]
    pub column_scale: String,
    #[serde(rename = "useXAppForCompose")]
    #[serde(default)]
    pub use_x_app_for_compose: bool,
    #[serde(rename = "mobileSwipeAreaEnabled")]
    #[serde(default = "default_true")]
    pub mobile_swipe_area_enabled: bool,
    #[serde(rename = "mobileSwipeAreaHeight")]
    #[serde(default = "default_mobile_swipe_area_height")]
    pub mobile_swipe_area_height: u32,
    #[serde(rename = "mobileTwoColumnEnabled")]
    #[serde(default = "default_true")]
    pub mobile_two_column_enabled: bool,
    #[serde(default)]
    pub presets: Vec<ColumnPresetData>,
    #[serde(rename = "ngWords")]
    #[serde(default)]
    pub ng_words: Vec<String>,
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

#[tauri::command]
pub async fn load_settings(app: AppHandle) -> Result<AppSettingsData, String> {
    let store = app.store("settings.json").map_err(|e| e.to_string())?;

    let settings = store
        .get("appSettings")
        .map(|mut v| {
            migrate_area_remove_enabled(&mut v);
            v
        })
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    Ok(settings)
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
    #[test]
    fn default_settings_match_contract_fixture() {
        let fixture: serde_json::Value =
            serde_json::from_str(include_str!("../../../contracts/default-settings.json")).unwrap();
        let actual = serde_json::to_value(AppSettingsData::default()).unwrap();
        assert_eq!(actual, fixture);
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
