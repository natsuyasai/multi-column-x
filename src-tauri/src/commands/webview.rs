use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewBuilder, WebviewUrl};
use std::path::PathBuf;
use crate::state::AppState;
use crate::inject::build_init_script;
use super::settings::ColumnData;

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
        "custom" => column.custom_url.clone().unwrap_or_else(|| "https://x.com/home".to_string()),
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
pub async fn create_column_webview(
    app: AppHandle,
    args: CreateWebviewArgs,
) -> Result<(), String> {
    let url = resolve_url(&args.column);
    let label = webview_label(&args.column.id);
    let data_dir = PathBuf::from(&args.data_directory);

    let init_script = build_init_script(
        args.column.settings.area_remove_enabled,
        &args.column.settings.custom_css,
    );

    let window = app.get_window("main").ok_or("main window not found")?;

    window.add_child(
        WebviewBuilder::new(&label, WebviewUrl::External(parse_url(&url)?))
            .initialization_script(&init_script)
            .data_directory(data_dir)
            .on_navigation(|url| {
                let host = url.host_str().unwrap_or("");
                if host == "x.com" || host == "twitter.com" || host.ends_with(".x.com") || host.ends_with(".twitter.com") {
                    return true;
                }
                let url_str = url.to_string();
                tauri::async_runtime::spawn(async move {
                    let _ = tauri_plugin_opener::open_url(&url_str, None::<&str>);
                });
                false
            }),
        LogicalPosition::new(args.x, args.y),
        LogicalSize::new(args.width, args.height),
    ).map_err(|e| e.to_string())?;

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
pub async fn remove_column_webview(
    app: AppHandle,
    column_id: String,
) -> Result<(), String> {
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
pub async fn resize_column_webview(
    app: AppHandle,
    bounds: ResizeBounds,
) -> Result<(), String> {
    let label = webview_label(&bounds.column_id);

    if let Some(webview) = app.get_webview(&label) {
        webview.set_bounds(tauri::Rect {
            position: LogicalPosition::new(bounds.x, bounds.y).into(),
            size: LogicalSize::new(bounds.width, bounds.height).into(),
        }).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub async fn open_popup_window(
    app: AppHandle,
    webview_label_caller: String,
    url: String,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    let data_dir = {
        let registry = state.registry.lock().unwrap();
        registry.get_data_directory(&webview_label_caller)
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(""))
    };

    let popup_label = format!("popup-{}", uuid::Uuid::new_v4());

    tauri::WebviewWindowBuilder::new(
        &app,
        &popup_label,
        WebviewUrl::External(parse_url(&url)?),
    )
    .title("X - メディア")
    .inner_size(900.0, 700.0)
    .data_directory(data_dir)
    .build()
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn eval_in_webview(
    app: AppHandle,
    label: String,
    script: String,
) -> Result<(), String> {
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
pub async fn open_in_browser(url: String) -> Result<(), String> {
    tauri_plugin_opener::open_url(url, None::<&str>).map_err(|e| e.to_string())
}
