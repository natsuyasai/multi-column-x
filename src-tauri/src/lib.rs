mod state;
mod inject;
mod commands;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(AppState::new())
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
