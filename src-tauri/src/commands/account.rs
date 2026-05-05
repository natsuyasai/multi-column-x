use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewBuilder, WebviewUrl};
use std::path::PathBuf;

#[cfg(desktop)]
#[tauri::command]
pub async fn open_add_account_window(app: AppHandle) -> Result<String, String> {
    let account_id = uuid::Uuid::new_v4().to_string();
    let window_label = format!("add-account-{}", &account_id[..8]);

    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let data_dir = app_data.join("accounts").join(format!("account-{}", &account_id));
    std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;

    tauri::WebviewWindowBuilder::new(
        &app,
        &window_label,
        WebviewUrl::External("https://x.com/login".parse().map_err(|e: url::ParseError| e.to_string())?),
    )
    .title("アカウントを追加")
    .inner_size(500.0, 700.0)
    .data_directory(data_dir.clone())
    .build()
    .map_err(|e| e.to_string())?;

    // Rust側でURLをポーリングしてログイン完了を検出する（外部WebViewではIPC不可のため）
    let app_clone = app.clone();
    let window_label_clone = window_label.clone();
    tokio::spawn(async move {
        let mut notified = false;
        loop {
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
            match app_clone.get_webview_window(&window_label_clone) {
                Some(w) => {
                    if let Ok(url) = w.url() {
                        if !notified && url.path() == "/home" {
                            notified = true;
                            let _ = app_clone.emit("account-login-complete", ());
                        }
                    }
                }
                None => break, // ウィンドウが閉じられた
            }
        }
    });

    Ok(serde_json::json!({
        "accountId": account_id,
        "dataDirectory": data_dir.to_string_lossy(),
        "windowLabel": window_label,
    }).to_string())
}

#[cfg(mobile)]
#[tauri::command]
pub async fn open_add_account_window(app: AppHandle) -> Result<String, String> {
    let account_id = uuid::Uuid::new_v4().to_string();
    let window_label = format!("add-account-{}", &account_id[..8]);

    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let data_dir = app_data
        .join("accounts")
        .join(format!("account-{}", &account_id));
    std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;

    let window = app.get_window("main").ok_or("main window not found")?;
    let size = window.inner_size().map_err(|e| e.to_string())?;
    let scale = window.scale_factor().unwrap_or(1.0);
    let logical_w = size.width as f64 / scale;
    let logical_h = size.height as f64 / scale;

    window
        .add_child(
            WebviewBuilder::new(
                &window_label,
                WebviewUrl::External(
                    "https://x.com/login"
                        .parse()
                        .map_err(|e: url::ParseError| e.to_string())?,
                ),
            )
            .data_directory(data_dir.clone()),
            LogicalPosition::new(0.0, 0.0),
            LogicalSize::new(logical_w, logical_h),
        )
        .map_err(|e| e.to_string())?;

    let app_clone = app.clone();
    let window_label_clone = window_label.clone();
    tokio::spawn(async move {
        let mut notified = false;
        loop {
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
            match app_clone.get_webview(&window_label_clone) {
                Some(w) => {
                    if let Ok(url) = w.url() {
                        if !notified && url.path() == "/home" {
                            notified = true;
                            let _ = app_clone.emit("account-login-complete", ());
                        }
                    }
                }
                None => break,
            }
        }
    });

    Ok(serde_json::json!({
        "accountId": account_id,
        "dataDirectory": data_dir.to_string_lossy(),
        "windowLabel": window_label,
    })
    .to_string())
}

#[tauri::command]
pub async fn notify_account_logged_in(app: AppHandle) -> Result<(), String> {
    app.emit("account-login-complete", ()).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn delete_account_data(data_directory: String) -> Result<(), String> {
    let path = PathBuf::from(data_directory);
    if path.exists() {
        std::fs::remove_dir_all(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn close_window(app: AppHandle, label: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&label) {
        window.close().map_err(|e| e.to_string())?;
    } else if let Some(webview) = app.get_webview(&label) {
        webview.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}
