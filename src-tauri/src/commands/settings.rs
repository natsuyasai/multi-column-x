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
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ColumnSettings {
    #[serde(rename = "autoReloadEnabled")]
    pub auto_reload_enabled: bool,
    #[serde(rename = "autoReloadInterval")]
    pub auto_reload_interval: u32,
    #[serde(rename = "showCountdown")]
    #[serde(default = "default_true")]
    pub show_countdown: bool,
    #[serde(rename = "areaRemoveEnabled")]
    pub area_remove_enabled: bool,
    #[serde(rename = "showCustomMenu")]
    #[serde(default = "default_true")]
    pub show_custom_menu: bool,
    #[serde(rename = "customCSS")]
    pub custom_css: String,
    #[serde(rename = "visibleLinks")]
    #[serde(default)]
    pub visible_links: Vec<String>,
}

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
    #[serde(rename = "showSortButtons")]
    #[serde(default = "default_true")]
    pub show_sort_buttons: bool,
    #[serde(rename = "smallImageEnabled")]
    #[serde(default)]
    pub small_image_enabled: bool,
    #[serde(rename = "smallImageWidth")]
    #[serde(default = "default_small_image_width")]
    pub small_image_width: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AppSettingsData {
    pub accounts: Vec<AccountData>,
    pub columns: Vec<ColumnData>,
    #[serde(rename = "globalSettings")]
    pub global_settings: GlobalSettingsData,
}

#[tauri::command]
pub async fn load_settings(app: AppHandle) -> Result<AppSettingsData, String> {
    let store = app.store("settings.json").map_err(|e| e.to_string())?;

    let settings = store
        .get("appSettings")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_else(|| AppSettingsData {
            accounts: vec![],
            columns: vec![],
            global_settings: GlobalSettingsData {
                theme: "dark".to_string(),
                custom_css: String::new(),
                window_bounds: WindowBounds {
                    x: 0.0,
                    y: 0.0,
                    width: 1400.0,
                    height: 900.0,
                },
                default_account_id: None,
                default_auto_reload_enabled: true,
                default_auto_reload_interval: 60,
                popup_esc_close_enabled: true,
                video_auto_play_stop_enabled: false,
                show_sort_buttons: true,
                small_image_enabled: false,
                small_image_width: "50%".to_string(),
            },
        });

    Ok(settings)
}

#[tauri::command]
pub async fn save_settings(app: AppHandle, settings: AppSettingsData) -> Result<(), String> {
    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    store.set(
        "appSettings",
        serde_json::to_value(&settings).map_err(|e| e.to_string())?,
    );
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}
