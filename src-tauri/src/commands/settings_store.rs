//! settings.json（tauri-plugin-store）からの読み出しヘルパー。
//! スキーマは TypeScript 側 src/types/index.ts と settings.rs の構造体定義に従う。
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

pub(crate) fn load_global_settings(app: &AppHandle) -> serde_json::Value {
    app.store("settings.json")
        .ok()
        .and_then(|store| store.get("appSettings"))
        .and_then(|v| v.get("globalSettings").cloned())
        .unwrap_or(serde_json::Value::Null)
}

pub(crate) fn load_video_auto_play_stop_enabled(app: &AppHandle) -> bool {
    load_global_settings(app)
        .get("videoAutoPlayStopEnabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

pub(crate) fn load_hide_ad_enabled(app: &AppHandle) -> bool {
    load_global_settings(app)
        .get("hideAdEnabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

pub(crate) fn load_popup_esc_close_enabled(app: &AppHandle) -> bool {
    load_global_settings(app)
        .get("popupEscCloseEnabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(true)
}

pub(crate) fn load_global_ng_words(app: &AppHandle) -> Vec<String> {
    load_global_settings(app)
        .get("ngWords")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(target_os = "android")]
pub(crate) fn load_use_x_app_for_compose(app: &AppHandle) -> bool {
    load_global_settings(app)
        .get("useXAppForCompose")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

pub(crate) fn load_accounts_json(app: &AppHandle) -> String {
    app.store("settings.json")
        .ok()
        .and_then(|store| store.get("appSettings"))
        .and_then(|v| v.get("accounts").cloned())
        .and_then(|accounts| {
            let arr = accounts.as_array()?;
            let infos: Vec<serde_json::Value> = arr
                .iter()
                .filter_map(|a| {
                    Some(serde_json::json!({
                        "id": a.get("id")?.as_str()?,
                        "label": a.get("label")?.as_str()?,
                        "color": a.get("color")?.as_str()?,
                        "dataDirectory": a.get("dataDirectory")?.as_str()?,
                    }))
                })
                .collect();
            serde_json::to_string(&infos).ok()
        })
        .unwrap_or_else(|| "[]".to_string())
}
