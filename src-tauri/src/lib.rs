#[cfg(target_os = "android")]
mod android_bridge;
mod commands;
mod inject;
mod ipc_constants;
mod state;

use state::AppState;
#[cfg(desktop)]
use tauri::{Manager, PhysicalPosition, PhysicalSize};
#[cfg(desktop)]
use tauri_plugin_store::StoreExt;

#[cfg(desktop)]
fn save_window_bounds(window: &tauri::Window) {
    use crate::commands::settings::{AppSettingsData, WindowBounds};
    let Ok(pos) = window.outer_position() else {
        return;
    };
    let Ok(size) = window.outer_size() else {
        return;
    };
    let Ok(store) = window.app_handle().store("settings.json") else {
        return;
    };
    let mut settings = store
        .get("appSettings")
        .and_then(|v| serde_json::from_value::<AppSettingsData>(v).ok())
        .unwrap_or_default();
    settings.global_settings.window_bounds = WindowBounds {
        x: pos.x as f64,
        y: pos.y as f64,
        width: size.width as f64,
        height: size.height as f64,
    };
    let Ok(value) = serde_json::to_value(&settings) else {
        return;
    };
    store.set("appSettings", value);
    if let Err(e) = store.save() {
        log::error!("failed to save window bounds: {e}");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(
            tauri_plugin_log::Builder::new()
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::Stdout,
                ))
                .level(if cfg!(debug_assertions) {
                    log::LevelFilter::Debug
                } else {
                    log::LevelFilter::Warn
                })
                .build(),
        )
        .manage(AppState::new())
        .setup(|app| {
            #[cfg(desktop)]
            {
                use crate::commands::settings::AppSettingsData;
                let store = app.store("settings.json").map_err(|e| e.to_string())?;
                if let Some(settings) = store
                    .get("appSettings")
                    .and_then(|v| serde_json::from_value::<AppSettingsData>(v).ok())
                {
                    let wb = &settings.global_settings.window_bounds;
                    if let Some(window) = app.get_webview_window("main") {
                        let monitors = window.available_monitors().unwrap_or_default();
                        let min_visible = 100.0_f64;
                        let on_screen = monitors.iter().any(|m| {
                            let pos = m.position();
                            let size = m.size();
                            let mx = pos.x as f64;
                            let my = pos.y as f64;
                            let mw = size.width as f64;
                            let mh = size.height as f64;
                            wb.x + min_visible > mx
                                && wb.x < mx + mw
                                && wb.y + min_visible > my
                                && wb.y < my + mh
                        });
                        if on_screen {
                            let _ = window
                                .set_position(PhysicalPosition::new(wb.x as i32, wb.y as i32));
                        }
                        let clamped_w = wb.width.max(600.0) as u32;
                        let clamped_h = wb.height.max(400.0) as u32;
                        let _ = window.set_size(PhysicalSize::new(clamped_w, clamped_h));
                    }
                }
            }
            #[cfg(target_os = "android")]
            crate::android_bridge::store_app_handle(app.handle().clone());
            #[cfg(not(desktop))]
            let _ = app;
            Ok(())
        });

    #[cfg(desktop)]
    let builder = builder.on_window_event(|window, event| {
        if let tauri::WindowEvent::CloseRequested { .. } = event {
            if window.label() == "main" {
                save_window_bounds(window);
                // Linux ではカラム/ポップアップ WebView が独立ウィンドウのため明示的に閉じる。
                // 他の OS では子 WebView として管理されるため不要。
                #[cfg(target_os = "linux")]
                {
                    use crate::ipc_constants::labels;
                    let app = window.app_handle();
                    for (label, ww) in app.webview_windows() {
                        if label.starts_with(labels::COLUMN_PREFIX)
                            || label.starts_with(labels::POPUP_PREFIX)
                            || label.starts_with(labels::COMPOSE_PREFIX)
                        {
                            let _ = ww.close();
                        }
                    }
                }
            }
        }
    });

    builder
        .invoke_handler(tauri::generate_handler![
            commands::settings::load_settings,
            commands::settings::save_settings,
            commands::webview::create_column_webview,
            commands::webview::remove_column_webview,
            commands::webview::resize_column_webview,
            commands::webview::open_popup_window,
            commands::webview::open_link_popup_window,
            commands::webview::close_popup_window,
            commands::webview::switch_popup_session,
            commands::webview::eval_in_webview,
            commands::webview::report_webview_scroll,
            commands::webview::report_new_posts_count,
            commands::webview::report_keyboard_shortcut,
            commands::webview::get_mobile_insets,
            commands::webview::set_column_cookies,
            commands::webview::open_in_browser,
            commands::account::open_add_account_window,
            commands::account::delete_account_data,
            commands::account::close_window,
            commands::webview::open_compose_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
