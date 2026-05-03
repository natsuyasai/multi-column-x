use super::settings::ColumnData;
use crate::inject::build_init_script;
use crate::state::AppState;
use std::path::PathBuf;
use std::time::Duration;
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewBuilder, WebviewUrl,
};
use tauri_plugin_store::StoreExt;

fn webview_label(column_id: &str) -> String {
    format!("column-{}", column_id)
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

#[tauri::command]
pub async fn create_column_webview(app: AppHandle, args: CreateWebviewArgs) -> Result<(), String> {
    let url = resolve_url(&args.column);
    let label = webview_label(&args.column.id);
    let data_dir = PathBuf::from(&args.data_directory);

    let init_script = build_init_script(
        args.column.settings.area_remove_enabled,
        args.column.settings.auto_reload_enabled,
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

#[derive(serde::Deserialize)]
pub struct ResizeBounds {
    #[serde(rename = "columnId")]
    pub column_id: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

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

fn load_accounts_json(app: &AppHandle) -> String {
    app.store("settings.json")
        .ok()
        .and_then(|store| store.get("appSettings"))
        .and_then(|v| v.get("accounts").cloned())
        .and_then(|accounts| {
            let arr = accounts.as_array()?;
            let infos: Vec<serde_json::Value> = arr.iter().filter_map(|a| {
                Some(serde_json::json!({
                    "id": a.get("id")?.as_str()?,
                    "label": a.get("label")?.as_str()?,
                    "color": a.get("color")?.as_str()?,
                    "dataDirectory": a.get("dataDirectory")?.as_str()?,
                }))
            }).collect();
            serde_json::to_string(&infos).ok()
        })
        .unwrap_or_else(|| "[]".to_string())
}

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
    let popup_init = crate::inject::build_popup_init_script(&accounts_json, &current_account_id, &url);

    let popup_label = format!("popup-{}", uuid::Uuid::new_v4());

    const POPUP_WIDTH: f64 = 900.0;
    const POPUP_HEIGHT: f64 = 700.0;

    let mut builder = tauri::WebviewWindowBuilder::new(
        &app,
        &popup_label,
        WebviewUrl::External(parse_url(&url)?),
    )
    .title("X - メディア")
    .inner_size(POPUP_WIDTH, POPUP_HEIGHT)
    .initialization_script(&popup_init)
    .data_directory(data_dir);

    if let Some(window) = app.get_window("main") {
        if let (Ok(pos), Ok(size)) = (window.outer_position(), window.outer_size()) {
            let scale = window.scale_factor().unwrap_or(1.0);
            let center_x = pos.x as f64 + (size.width as f64 - POPUP_WIDTH * scale) / 2.0;
            let center_y = pos.y as f64 + (size.height as f64 - POPUP_HEIGHT * scale) / 2.0;
            builder = builder.position(center_x / scale, center_y / scale);
        }
    }

    builder.build().map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn eval_in_webview(app: AppHandle, label: String, script: String) -> Result<(), String> {
    if let Some(webview) = app.get_webview(&label) {
        webview.eval(&script).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn report_webview_scroll(app: AppHandle, delta: f64) -> Result<(), String> {
    app.emit("webview-scroll", delta).map_err(|e| e.to_string())
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
    let popup_init = crate::inject::build_popup_init_script(&accounts_json, &accountId, &url);

    let mut builder = tauri::WebviewWindowBuilder::new(
        &app,
        &new_label,
        WebviewUrl::External(parse_url(&url)?),
    )
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
pub async fn open_in_browser(url: String) -> Result<(), String> {
    tauri_plugin_opener::open_url(url, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn open_compose_window(
    app: AppHandle,
    #[allow(non_snake_case)] accountId: String,
    #[allow(non_snake_case)] dataDirectory: String,
) -> Result<(), String> {
    let data_dir = std::path::PathBuf::from(&dataDirectory);

    let accounts_json = load_accounts_json(&app);
    let popup_init = crate::inject::build_popup_init_script(&accounts_json, &accountId, "");

    let compose_label = format!("compose-{}", uuid::Uuid::new_v4());

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
            let center_y = pos.y as f64 + (size.height as f64 - COMPOSE_WINDOW_HEIGHT * scale) / 2.0;
            builder = builder.position(center_x / scale, center_y / scale);
        }
    }

    builder.build().map_err(|e| e.to_string())?;

    Ok(())
}
