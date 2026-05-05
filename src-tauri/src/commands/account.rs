use tauri::{AppHandle, Emitter, Manager, WebviewUrl};
#[cfg(mobile)]
use tauri::{LogicalPosition, LogicalSize};
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

    tauri::WebviewWindowBuilder::new(
        &app,
        &window_label,
        WebviewUrl::External(
            "https://x.com/login"
                .parse()
                .map_err(|e: url::ParseError| e.to_string())?,
        ),
    )
    .data_directory(data_dir.clone())
    .build()
    .map_err(|e| e.to_string())?;

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
                            // Android の WebviewWindow::close() はタウリ内部状態を破棄するが
                            // Android View hierarchy からは削除されないことがある。
                            // 先に画面外へ移動してから close() することで視覚的に隠す。
                            let _ = w.set_position(LogicalPosition::new(-99999.0_f64, 0.0_f64));
                            let _ = w.set_size(LogicalSize::new(1.0_f64, 1.0_f64));
                            let _ = w.close();
                            break;
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
        return Ok(());
    }
    #[cfg(desktop)]
    if let Some(webview) = app.get_webview(&label) {
        webview.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}
