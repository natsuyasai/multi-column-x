//! WebView 関連の Tauri コマンド。
//! カラム / ポップアップ / コンポーズはサブモジュールに分割し、
//! lib.rs の generate_handler! からは従来どおり commands::webview::xxx で参照できるよう再エクスポートする。
mod column;
mod compose;
mod popup;

pub use column::*;
pub use compose::*;
pub use popup::*;

use crate::ipc_constants::events;
use tauri::{AppHandle, Emitter, Manager};

// Android はポップアップ/カラムとも URL 文字列を JNI 経由でそのまま渡すため、
// 到達可能な呼び出し元がなく dead_code になる（参照自体は残るため cfg では消せない）。
#[cfg_attr(target_os = "android", allow(dead_code))]
fn parse_url(s: &str) -> Result<tauri::Url, String> {
    s.parse().map_err(|e: url::ParseError| e.to_string())
}

/// ステータスバーとナビゲーションバーの高さ（dp）を返す。
/// Kotlin の WindowInsetsCompat から取得した値を JNI 経由で保存したもの。
#[tauri::command]
pub async fn get_mobile_insets() -> serde_json::Value {
    #[cfg(target_os = "android")]
    {
        let (top, bottom) = crate::android_bridge::get_system_bar_insets();
        serde_json::json!({ "top": top, "bottom": bottom })
    }
    #[cfg(not(target_os = "android"))]
    {
        serde_json::json!({ "top": 0, "bottom": 0 })
    }
}

#[tauri::command]
pub async fn eval_in_webview(app: AppHandle, label: String, script: String) -> Result<(), String> {
    // Android のカラム WebView はネイティブ Android WebView で管理しているため
    // Tauri の get_webview では見つからない。android_bridge 経由で評価する。
    #[cfg(target_os = "android")]
    if label.starts_with(crate::ipc_constants::labels::COLUMN_PREFIX) {
        return crate::android_bridge::eval_in_column_webview(&label, &script);
    }

    if let Some(webview) = app.get_webview(&label) {
        webview.eval(&script).map_err(|e| e.to_string())?;
    } else if let Some(webview_window) = app.get_webview_window(&label) {
        webview_window.eval(&script).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn report_webview_scroll(app: AppHandle, delta: f64) -> Result<(), String> {
    app.emit(events::WEBVIEW_SCROLL, delta)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn report_new_posts_count(
    app: AppHandle,
    label: String,
    count: u32,
) -> Result<(), String> {
    app.emit(
        events::WEBVIEW_NEW_POSTS_COUNT,
        serde_json::json!({ "label": label, "count": count }),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn report_keyboard_shortcut(app: AppHandle, key: String) -> Result<(), String> {
    app.emit(events::WEBVIEW_KEYBOARD_SHORTCUT, key)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn open_in_browser(url: String) -> Result<(), String> {
    tauri_plugin_opener::open_url(url, None::<&str>).map_err(|e| e.to_string())
}
