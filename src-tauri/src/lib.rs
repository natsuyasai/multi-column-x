mod state;
mod inject;
mod commands;

use state::AppState;
use tauri::{Manager, PhysicalPosition, PhysicalSize};
use tauri_plugin_store::StoreExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(AppState::new())
        .setup(|app| {
            let store = app.store("settings.json").map_err(|e| e.to_string())?;
            if let Some(value) = store.get("appSettings") {
                if let Some(bounds) = value
                    .get("globalSettings")
                    .and_then(|gs| gs.get("windowBounds"))
                {
                    let x = bounds.get("x").and_then(|v| v.as_f64()).unwrap_or(0.0);
                    let y = bounds.get("y").and_then(|v| v.as_f64()).unwrap_or(0.0);
                    let w = bounds.get("width").and_then(|v| v.as_f64()).unwrap_or(1400.0);
                    let h = bounds.get("height").and_then(|v| v.as_f64()).unwrap_or(900.0);

                    if let Some(window) = app.get_webview_window("main") {
                        let monitors = window.available_monitors().unwrap_or_default();
                        let on_screen = monitors.iter().any(|m| {
                            let pos = m.position();
                            let size = m.size();
                            x >= pos.x as f64
                                && y >= pos.y as f64
                                && x < (pos.x as f64 + size.width as f64)
                                && y < (pos.y as f64 + size.height as f64)
                        });

                        if on_screen {
                            let _ = window.set_position(PhysicalPosition::new(x as i32, y as i32));
                        }
                        let clamped_w = w.max(600.0) as u32;
                        let clamped_h = h.max(400.0) as u32;
                        let _ = window.set_size(PhysicalSize::new(clamped_w, clamped_h));
                    }
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::settings::load_settings,
            commands::settings::save_settings,
            commands::webview::create_column_webview,
            commands::webview::remove_column_webview,
            commands::webview::resize_column_webview,
            commands::webview::open_popup_window,
            commands::webview::switch_popup_session,
            commands::webview::eval_in_webview,
            commands::webview::report_webview_scroll,
            commands::webview::open_in_browser,
            commands::account::open_add_account_window,
            commands::account::notify_account_logged_in,
            commands::account::delete_account_data,
            commands::account::close_window,
            commands::webview::open_compose_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
