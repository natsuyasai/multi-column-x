//! ツイート作成ウィンドウ。
#[cfg(not(target_os = "android"))]
use super::parse_url;
use super::popup::{build_popup_init, PopupInit};
#[cfg(target_os = "android")]
use crate::commands::settings_store::load_use_x_app_for_compose;
use crate::ipc_constants::labels;
use tauri::AppHandle;
#[cfg(desktop)]
use tauri::Manager;
#[cfg(not(target_os = "android"))]
use tauri::WebviewUrl;

#[cfg(desktop)]
#[tauri::command]
pub async fn open_compose_window(
    app: AppHandle,
    #[allow(non_snake_case)] accountId: String,
    #[allow(non_snake_case)] dataDirectory: String,
) -> Result<(), String> {
    let data_dir = std::path::PathBuf::from(&dataDirectory);

    let PopupInit {
        label: compose_label,
        init_script: popup_init,
    } = build_popup_init(&app, labels::COMPOSE_PREFIX, &accountId, "");

    const COMPOSE_WIDTH: f64 = 600.0;
    const COMPOSE_WINDOW_HEIGHT: f64 = 580.0; // コンテンツ 540px + ツールバー 40px

    let mut builder = tauri::WebviewWindowBuilder::new(
        &app,
        &compose_label,
        WebviewUrl::External(parse_url("https://x.com/compose/post")?),
    )
    .title("X - ツイート")
    .inner_size(COMPOSE_WIDTH, COMPOSE_WINDOW_HEIGHT)
    .initialization_script(&popup_init)
    .data_directory(data_dir);

    if let Some(window) = app.get_window("main") {
        if let (Ok(pos), Ok(size)) = (window.outer_position(), window.outer_size()) {
            let scale = window.scale_factor().unwrap_or(1.0);
            let center_x = pos.x as f64 + (size.width as f64 - COMPOSE_WIDTH * scale) / 2.0;
            let center_y =
                pos.y as f64 + (size.height as f64 - COMPOSE_WINDOW_HEIGHT * scale) / 2.0;
            builder = builder.position(center_x / scale, center_y / scale);
        }
    }

    builder.build().map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg(mobile)]
#[tauri::command]
pub async fn open_compose_window(
    app: AppHandle,
    #[allow(non_snake_case)] accountId: String,
    #[allow(non_snake_case)] dataDirectory: String,
) -> Result<(), String> {
    let PopupInit {
        label: compose_label,
        init_script: popup_init,
    } = build_popup_init(&app, labels::COMPOSE_PREFIX, &accountId, "");

    #[cfg(target_os = "android")]
    {
        let _ = (dataDirectory,);
        if load_use_x_app_for_compose(&app) {
            return crate::android_bridge::launch_compose_tweet_intent();
        }
        return crate::android_bridge::create_popup_webview(
            &compose_label,
            "https://x.com/compose/post",
            &popup_init,
            &accountId,
        );
    }

    #[cfg(not(target_os = "android"))]
    {
        let data_dir = std::path::PathBuf::from(&dataDirectory);
        tauri::WebviewWindowBuilder::new(
            &app,
            &compose_label,
            WebviewUrl::External(parse_url("https://x.com/compose/post")?),
        )
        .initialization_script(&popup_init)
        .data_directory(data_dir)
        .build()
        .map_err(|e| e.to_string())?;
        Ok(())
    }
}
