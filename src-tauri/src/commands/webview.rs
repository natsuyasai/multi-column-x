use super::settings::ColumnData;
use crate::inject::build_init_script;
use crate::ipc_constants::{events, labels};
use crate::state::AppState;
use std::path::PathBuf;
use std::time::Duration;
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewUrl};
use tauri_plugin_store::StoreExt;

#[cfg(desktop)]
use tauri::WebviewBuilder;

fn webview_label(column_id: &str) -> String {
    format!("{}{}", labels::COLUMN_PREFIX, column_id)
}

fn resolve_url(column: &ColumnData) -> String {
    match column.page_type.as_str() {
        "home" => match column.home_tab_name.as_deref().filter(|s| !s.is_empty()) {
            Some(tab) => format!("https://x.com/home?{}", urlencoding::encode(tab)),
            None => "https://x.com/home".to_string(),
        },
        "notifications" => "https://x.com/notifications".to_string(),
        "search" => format!(
            "https://x.com/search?q={}",
            urlencoding::encode(column.search_query.as_deref().unwrap_or(""))
        ),
        "list" => format!(
            "https://x.com/i/lists/{}",
            column.list_id.as_deref().unwrap_or("")
        ),
        "custom" => column
            .custom_url
            .clone()
            .unwrap_or_else(|| "https://x.com/home".to_string()),
        _ => "https://x.com/home".to_string(),
    }
}

fn parse_url(s: &str) -> Result<tauri::Url, String> {
    s.parse().map_err(|e: url::ParseError| e.to_string())
}

#[derive(serde::Deserialize)]
pub struct CreateWebviewArgs {
    pub column: ColumnData,
    #[serde(rename = "dataDirectory")]
    pub data_directory: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[cfg(desktop)]
#[tauri::command]
pub async fn create_column_webview(app: AppHandle, args: CreateWebviewArgs) -> Result<(), String> {
    let url = resolve_url(&args.column);
    let label = webview_label(&args.column.id);
    let data_dir = PathBuf::from(&args.data_directory);

    let video_auto_play_stop_enabled = load_video_auto_play_stop_enabled(&app);
    let (small_image_enabled, small_image_width) = load_small_image_settings(&app);
    let hide_ad_enabled = load_hide_ad_enabled(&app);
    let zoom_level = load_zoom_level(&app);
    let init_script = build_init_script(
        false, // is_mobile
        args.column.settings.area_remove_enabled,
        args.column.settings.show_custom_menu,
        args.column.settings.auto_reload_enabled,
        video_auto_play_stop_enabled,
        small_image_enabled,
        &small_image_width,
        hide_ad_enabled,
        zoom_level,
        &args.column.settings.custom_css,
        &args.column.settings.visible_links,
    );

    let window = app.get_window("main").ok_or("main window not found")?;

    window
        .add_child(
            WebviewBuilder::new(&label, WebviewUrl::External(parse_url(&url)?))
                .initialization_script(&init_script)
                .data_directory(data_dir),
            LogicalPosition::new(args.x, args.y),
            LogicalSize::new(args.width, args.height),
        )
        .map_err(|e| e.to_string())?;

    let state = app.state::<AppState>();
    let mut registry = state.registry.lock().unwrap();
    registry.register(
        label,
        args.column.id.clone(),
        args.column.account_id.clone(),
        args.data_directory.clone(),
    );

    Ok(())
}

#[cfg(mobile)]
#[tauri::command]
pub async fn create_column_webview(app: AppHandle, args: CreateWebviewArgs) -> Result<(), String> {
    let url = resolve_url(&args.column);
    let label = webview_label(&args.column.id);

    let video_auto_play_stop_enabled = load_video_auto_play_stop_enabled(&app);
    let (small_image_enabled, small_image_width) = load_small_image_settings(&app);
    let hide_ad_enabled = load_hide_ad_enabled(&app);
    let zoom_level = load_zoom_level(&app);
    let init_script = build_init_script(
        true, // is_mobile
        args.column.settings.area_remove_enabled,
        args.column.settings.show_custom_menu,
        args.column.settings.auto_reload_enabled,
        video_auto_play_stop_enabled,
        small_image_enabled,
        &small_image_width,
        hide_ad_enabled,
        zoom_level,
        &args.column.settings.custom_css,
        &args.column.settings.visible_links,
    );

    // Android では Tauri WebviewWindowBuilder を使わず、
    // ネイティブ Android WebView を content FrameLayout のオーバーレイとして追加する。
    // これにより setContentView によるメイン WebView の上書きを回避し、
    // React MobileTabBar が画面下部に常時表示される。
    #[cfg(target_os = "android")]
    {
        let visible = args.x >= 0.0;
        crate::android_bridge::create_column_webview(
            &label,
            &url,
            args.width as i32,
            args.height as i32,
            &init_script,
            visible,
            &args.column.account_id,
        )?;
    }

    let state = app.state::<AppState>();
    let mut registry = state.registry.lock().unwrap();
    registry.register(
        label,
        args.column.id.clone(),
        args.column.account_id.clone(),
        args.data_directory.clone(),
    );

    Ok(())
}

#[cfg(desktop)]
#[tauri::command]
pub async fn remove_column_webview(app: AppHandle, column_id: String) -> Result<(), String> {
    let label = webview_label(&column_id);

    if let Some(webview) = app.get_webview(&label) {
        webview.close().map_err(|e| e.to_string())?;
    }

    let state = app.state::<AppState>();
    let mut registry = state.registry.lock().unwrap();
    registry.unregister(&label);

    Ok(())
}

#[cfg(mobile)]
#[tauri::command]
pub async fn remove_column_webview(app: AppHandle, column_id: String) -> Result<(), String> {
    let label = webview_label(&column_id);

    #[cfg(target_os = "android")]
    {
        crate::android_bridge::remove_column_webview(&label).ok();
    }

    let state = app.state::<AppState>();
    let mut registry = state.registry.lock().unwrap();
    registry.unregister(&label);

    Ok(())
}

#[derive(serde::Deserialize)]
pub struct ResizeBounds {
    #[serde(rename = "columnId")]
    pub column_id: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[cfg(desktop)]
#[tauri::command]
pub async fn resize_column_webview(app: AppHandle, bounds: ResizeBounds) -> Result<(), String> {
    let label = webview_label(&bounds.column_id);

    if let Some(webview) = app.get_webview(&label) {
        webview
            .set_bounds(tauri::Rect {
                position: LogicalPosition::new(bounds.x, bounds.y).into(),
                size: LogicalSize::new(bounds.width, bounds.height).into(),
            })
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[cfg(mobile)]
#[tauri::command]
pub async fn resize_column_webview(_app: AppHandle, bounds: ResizeBounds) -> Result<(), String> {
    let label = webview_label(&bounds.column_id);

    #[cfg(target_os = "android")]
    {
        if bounds.x >= 0.0 {
            crate::android_bridge::show_column_webview(
                &label,
                bounds.width as i32,
                bounds.height as i32,
            )
            .ok();
        } else {
            crate::android_bridge::hide_column_webview(&label).ok();
        }
    }

    Ok(())
}

fn load_video_auto_play_stop_enabled(app: &AppHandle) -> bool {
    app.store("settings.json")
        .ok()
        .and_then(|store| store.get("appSettings"))
        .and_then(|v| v.get("globalSettings").cloned())
        .and_then(|gs| gs.get("videoAutoPlayStopEnabled").and_then(|v| v.as_bool()))
        .unwrap_or(false)
}

fn load_small_image_settings(app: &AppHandle) -> (bool, String) {
    let gs = app
        .store("settings.json")
        .ok()
        .and_then(|store| store.get("appSettings"))
        .and_then(|v| v.get("globalSettings").cloned());
    let enabled = gs
        .as_ref()
        .and_then(|g| g.get("smallImageEnabled").and_then(|v| v.as_bool()))
        .unwrap_or(false);
    let width = gs
        .as_ref()
        .and_then(|g| g.get("smallImageWidth").and_then(|v| v.as_str()).map(str::to_owned))
        .unwrap_or_else(|| "50%".to_string());
    (enabled, width)
}

fn load_hide_ad_enabled(app: &AppHandle) -> bool {
    app.store("settings.json")
        .ok()
        .and_then(|store| store.get("appSettings"))
        .and_then(|v| v.get("globalSettings").cloned())
        .and_then(|gs| gs.get("hideAdEnabled").and_then(|v| v.as_bool()))
        .unwrap_or(false)
}

fn load_zoom_level(app: &AppHandle) -> f64 {
    app.store("settings.json")
        .ok()
        .and_then(|store| store.get("appSettings"))
        .and_then(|v| v.get("globalSettings").cloned())
        .and_then(|gs| gs.get("zoomLevel").and_then(|v| v.as_f64()))
        .unwrap_or(1.0)
}

fn load_popup_esc_close_enabled(app: &AppHandle) -> bool {
    app.store("settings.json")
        .ok()
        .and_then(|store| store.get("appSettings"))
        .and_then(|v| v.get("globalSettings").cloned())
        .and_then(|gs| gs.get("popupEscCloseEnabled").and_then(|v| v.as_bool()))
        .unwrap_or(true)
}

fn load_accounts_json(app: &AppHandle) -> String {
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

#[cfg(desktop)]
#[tauri::command]
pub async fn open_popup_window(
    app: AppHandle,
    webview_label_caller: String,
    url: String,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    let (data_dir, current_account_id) = {
        let registry = state.registry.lock().unwrap();
        let data_dir = registry
            .get_data_directory(&webview_label_caller)
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(""));
        let account_id = registry
            .get_account_id(&webview_label_caller)
            .unwrap_or("")
            .to_string();
        (data_dir, account_id)
    };

    let accounts_json = load_accounts_json(&app);
    let esc_close_enabled = load_popup_esc_close_enabled(&app);
    let popup_init = crate::inject::build_popup_init_script(
        &accounts_json,
        &current_account_id,
        &url,
        esc_close_enabled,
    );

    let popup_label = format!("{}{}", labels::POPUP_PREFIX, uuid::Uuid::new_v4());

    let (window_pos, window_size) = if let Some(window) = app.get_window("main") {
        if let (Ok(pos), Ok(size)) = (window.outer_position(), window.outer_size()) {
            (
                LogicalPosition::new(pos.x as f64, pos.y as f64),
                LogicalSize::new(size.width as f64, size.height as f64),
            )
        } else {
            (
                LogicalPosition::new(0.0, 0.0),
                LogicalSize::new(800.0, 600.0),
            )
        }
    } else {
        (
            LogicalPosition::new(0.0, 0.0),
            LogicalSize::new(800.0, 600.0),
        )
    };

    const PADDING: f64 = 50.0;

    let builder = tauri::WebviewWindowBuilder::new(
        &app,
        &popup_label,
        WebviewUrl::External(parse_url(&url)?),
    )
    .title("X - メディア")
    .inner_size(
        window_size.width - (PADDING * 2.0),
        window_size.height - (PADDING * 2.0),
    )
    .position(window_pos.x + PADDING, window_pos.y + PADDING)
    .initialization_script(&popup_init)
    .data_directory(data_dir);

    builder.build().map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg(mobile)]
#[tauri::command]
pub async fn open_popup_window(
    app: AppHandle,
    webview_label_caller: String,
    url: String,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    let current_account_id = {
        let registry = state.registry.lock().unwrap();
        registry
            .get_account_id(&webview_label_caller)
            .unwrap_or("")
            .to_string()
    };

    let accounts_json = load_accounts_json(&app);
    let esc_close_enabled = load_popup_esc_close_enabled(&app);
    let popup_init = crate::inject::build_popup_init_script(
        &accounts_json,
        &current_account_id,
        &url,
        esc_close_enabled,
    );
    let popup_label = format!("{}{}", labels::POPUP_PREFIX, uuid::Uuid::new_v4());

    #[cfg(target_os = "android")]
    {
        let _ = app;
        return crate::android_bridge::create_popup_webview(&popup_label, &url, &popup_init, &current_account_id);
    }

    #[cfg(not(target_os = "android"))]
    {
        let data_dir = {
            let registry = state.registry.lock().unwrap();
            registry
                .get_data_directory(&webview_label_caller)
                .map(PathBuf::from)
                .unwrap_or_default()
        };
        tauri::WebviewWindowBuilder::new(&app, &popup_label, WebviewUrl::External(parse_url(&url)?))
            .initialization_script(&popup_init)
            .data_directory(data_dir)
            .build()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}

#[cfg(desktop)]
#[tauri::command]
pub async fn open_link_popup_window(
    app: AppHandle,
    webview_label_caller: Option<String>,
    #[allow(non_snake_case)] accountId: Option<String>,
    #[allow(non_snake_case)] dataDirectory: Option<String>,
    url: String,
) -> Result<(), String> {
    let (data_dir, current_account_id) = if let (Some(aid), Some(dd)) = (accountId, dataDirectory) {
        (PathBuf::from(dd), aid)
    } else {
        let label = webview_label_caller.unwrap_or_default();
        let state = app.state::<AppState>();
        let registry = state.registry.lock().unwrap();
        let dd = registry
            .get_data_directory(&label)
            .map(PathBuf::from)
            .unwrap_or_default();
        let aid = registry.get_account_id(&label).unwrap_or("").to_string();
        (dd, aid)
    };

    let accounts_json = load_accounts_json(&app);
    let esc_close_enabled = load_popup_esc_close_enabled(&app);
    let popup_init = crate::inject::build_popup_init_script(
        &accounts_json,
        &current_account_id,
        "",
        esc_close_enabled,
    );

    let popup_label = format!("{}{}", labels::POPUP_PREFIX, uuid::Uuid::new_v4());

    let (window_pos, window_size) = if let Some(window) = app.get_window("main") {
        if let (Ok(pos), Ok(size)) = (window.outer_position(), window.outer_size()) {
            (
                LogicalPosition::new(pos.x as f64, pos.y as f64),
                LogicalSize::new(size.width as f64, size.height as f64),
            )
        } else {
            (
                LogicalPosition::new(0.0, 0.0),
                LogicalSize::new(800.0, 600.0),
            )
        }
    } else {
        (
            LogicalPosition::new(0.0, 0.0),
            LogicalSize::new(800.0, 600.0),
        )
    };

    const PADDING: f64 = 50.0;

    let builder = tauri::WebviewWindowBuilder::new(
        &app,
        &popup_label,
        WebviewUrl::External(parse_url(&url)?),
    )
    .title("X - リンク")
    .inner_size(
        window_size.width - (PADDING * 2.0),
        window_size.height - (PADDING * 2.0),
    )
    .position(window_pos.x + PADDING, window_pos.y + PADDING)
    .initialization_script(&popup_init)
    .data_directory(data_dir);

    builder.build().map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg(mobile)]
#[tauri::command]
pub async fn open_link_popup_window(
    app: AppHandle,
    webview_label_caller: Option<String>,
    #[allow(non_snake_case)] accountId: Option<String>,
    #[allow(non_snake_case)] dataDirectory: Option<String>,
    url: String,
) -> Result<(), String> {
    let current_account_id = if let Some(aid) = accountId {
        aid
    } else {
        let label = webview_label_caller.clone().unwrap_or_default();
        let state = app.state::<AppState>();
        let registry = state.registry.lock().unwrap();
        registry.get_account_id(&label).unwrap_or("").to_string()
    };

    let accounts_json = load_accounts_json(&app);
    let esc_close_enabled = load_popup_esc_close_enabled(&app);
    let popup_init = crate::inject::build_popup_init_script(
        &accounts_json,
        &current_account_id,
        "",
        esc_close_enabled,
    );
    let popup_label = format!("{}{}", labels::POPUP_PREFIX, uuid::Uuid::new_v4());

    #[cfg(target_os = "android")]
    {
        let _ = (app, dataDirectory);
        return crate::android_bridge::create_popup_webview(&popup_label, &url, &popup_init, &current_account_id);
    }

    #[cfg(not(target_os = "android"))]
    {
        let data_dir = if let Some(dd) = dataDirectory {
            PathBuf::from(dd)
        } else {
            let label = webview_label_caller.unwrap_or_default();
            let state = app.state::<AppState>();
            let registry = state.registry.lock().unwrap();
            registry
                .get_data_directory(&label)
                .map(PathBuf::from)
                .unwrap_or_default()
        };
        tauri::WebviewWindowBuilder::new(&app, &popup_label, WebviewUrl::External(parse_url(&url)?))
            .initialization_script(&popup_init)
            .data_directory(data_dir)
            .build()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}

/// アクティブカラムのアカウントに CookieManager を切り替える（Android / Profile API 非対応端末のみ）。
/// setActiveColumn から resize_column_webview より先に呼ばれ、正しいアカウントで WebView が動作する。
#[tauri::command]
pub async fn set_column_cookies(
    #[allow(non_snake_case)] accountId: String,
) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        crate::android_bridge::set_account_cookies(&accountId)?;
    }
    Ok(())
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
    if label.starts_with("column-") {
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
    app.emit(events::WEBVIEW_SCROLL, delta).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn switch_popup_session(
    app: AppHandle,
    #[allow(non_snake_case)] popupLabel: String,
    #[allow(non_snake_case)] accountId: String,
    #[allow(non_snake_case)] dataDirectory: String,
    url: String,
) -> Result<(), String> {
    let (pos, size) = if let Some(window) = app.get_webview_window(&popupLabel) {
        let pos = window.outer_position().ok();
        let size = window.outer_size().ok();
        window.close().map_err(|e| e.to_string())?;
        tokio::time::sleep(Duration::from_millis(150)).await;
        (pos, size)
    } else {
        (None, None)
    };

    let new_label = format!("popup-{}", uuid::Uuid::new_v4());
    let data_dir = PathBuf::from(&dataDirectory);

    let accounts_json = load_accounts_json(&app);
    let esc_close_enabled = load_popup_esc_close_enabled(&app);
    let popup_init =
        crate::inject::build_popup_init_script(&accounts_json, &accountId, &url, esc_close_enabled);

    let mut builder =
        tauri::WebviewWindowBuilder::new(&app, &new_label, WebviewUrl::External(parse_url(&url)?))
            .title("X - メディア")
            .initialization_script(&popup_init)
            .data_directory(data_dir);

    if let (Some(p), Some(s)) = (pos, size) {
        let scale = app
            .get_window("main")
            .and_then(|w| w.scale_factor().ok())
            .unwrap_or(1.0);
        builder = builder
            .inner_size(s.width as f64 / scale, s.height as f64 / scale)
            .position(p.x as f64 / scale, p.y as f64 / scale);
    } else {
        builder = builder.inner_size(900.0, 700.0);
    }

    builder.build().map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn close_popup_window(app: AppHandle, label: String) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        crate::android_bridge::remove_popup_webview(&label).ok();
        let _ = app;
        return Ok(());
    }
    if let Some(window) = app.get_webview_window(&label) {
        window.close().map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(desktop)]
    if let Some(webview) = app.get_webview(&label) {
        webview.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn open_in_browser(url: String) -> Result<(), String> {
    tauri_plugin_opener::open_url(url, None::<&str>).map_err(|e| e.to_string())
}

#[cfg(desktop)]
#[tauri::command]
pub async fn open_compose_window(
    app: AppHandle,
    #[allow(non_snake_case)] accountId: String,
    #[allow(non_snake_case)] dataDirectory: String,
) -> Result<(), String> {
    let data_dir = std::path::PathBuf::from(&dataDirectory);

    let accounts_json = load_accounts_json(&app);
    let esc_close_enabled = load_popup_esc_close_enabled(&app);
    let popup_init =
        crate::inject::build_popup_init_script(&accounts_json, &accountId, "", esc_close_enabled);

    let compose_label = format!("{}{}", labels::COMPOSE_PREFIX, uuid::Uuid::new_v4());

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
    let accounts_json = load_accounts_json(&app);
    let esc_close_enabled = load_popup_esc_close_enabled(&app);
    let popup_init =
        crate::inject::build_popup_init_script(&accounts_json, &accountId, "", esc_close_enabled);
    let compose_label = format!("{}{}", labels::COMPOSE_PREFIX, uuid::Uuid::new_v4());

    #[cfg(target_os = "android")]
    {
        let _ = (app, dataDirectory);
        return crate::android_bridge::create_popup_webview(
            &compose_label,
            "https://x.com/compose/post",
            &popup_init,
            &accountId,
        );
    }

    #[cfg(not(target_os = "android"))]
    {
        let data_dir = PathBuf::from(&dataDirectory);
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
