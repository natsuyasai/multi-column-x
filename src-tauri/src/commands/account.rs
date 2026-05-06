use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager, Runtime, WebviewUrl};

/// Android で WebviewWindow の build() 直後は Activity がまだ起動中のため
/// ウィンドウが Tauri のレジストリに現れてページ URL が確定するまで待機する。
/// RustWebViewClient.currentUrl は onPageStarted で更新されるため、
/// x.com の URL が返れば onPageStarted が完了している（initScript が evaluateJavascript 済み）。
#[cfg(mobile)]
async fn wait_for_window_url<R: Runtime>(app: &AppHandle<R>, label: &str) {
    // まずウィンドウが現れるまで待つ（最大 10 秒）
    for _ in 0..40 {
        tokio::time::sleep(std::time::Duration::from_millis(250)).await;
        if app.get_webview_window(label).is_some() {
            break;
        }
    }
    // URL が x.com / twitter.com に変わるまで待つ（onPageStarted 完了の確認、最大 15 秒）
    for _ in 0..60 {
        tokio::time::sleep(std::time::Duration::from_millis(250)).await;
        if let Some(w) = app.get_webview_window(label) {
            if let Ok(url) = w.url() {
                let host = url.host_str().unwrap_or("");
                if host == "x.com"
                    || host.ends_with(".x.com")
                    || host == "twitter.com"
                    || host.ends_with(".twitter.com")
                {
                    return;
                }
            }
        }
    }
}

#[cfg(desktop)]
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
    })
    .to_string())
}

#[cfg(mobile)]
#[tauri::command]
pub async fn open_add_account_window(app: AppHandle) -> Result<String, String> {
    let account_id = uuid::Uuid::new_v4().to_string();
    // Android マルチウィンドウでは固定ラベル "add-account" を使用する。
    // 動的ラベルだと対応する Activity クラスが存在しないため MainActivity が
    // 乗っ取られ、親の WebView が失われる。
    let window_label = "add-account".to_string();

    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let data_dir = app_data
        .join("accounts")
        .join(format!("account-{}", &account_id));
    std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;

    // 既存の add-account ウィンドウがあれば閉じてから開く
    if let Some(existing) = app.get_webview_window(&window_label) {
        let _ = existing.close();
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
    }

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
        // ウィンドウの URL を監視してログイン完了を検出する
        let mut notified = false;
        loop {
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
            match app_clone.get_webview_window(&window_label_clone) {
                Some(w) => {
                    if let Ok(url) = w.url() {
                        if !notified && url.path() == "/home" {
                            notified = true;
                            let _ = app_clone.emit("account-login-complete", ());
                            let _ = w.close();
                            break;
                        }
                    }
                }
                None => break,
            }
        }
    });

    // ① ウィンドウが Tauri のレジストリに登録されるまで待機（Activity 起動待ち）
    wait_for_window_url(&app, &window_label).await;
    // ② RustWebViewClient.onPageStarted 内の evaluateJavascript(initScript) は非同期のため
    //    スクリプト実行完了を見越して追加で待機する（std::thread::sleep の代替）
    tokio::time::sleep(std::time::Duration::from_millis(1500)).await;

    Ok(serde_json::json!({
        "accountId": account_id,
        "dataDirectory": data_dir.to_string_lossy(),
        "windowLabel": window_label,
    })
    .to_string())
}

#[tauri::command]
pub async fn notify_account_logged_in(app: AppHandle) -> Result<(), String> {
    app.emit("account-login-complete", ())
        .map_err(|e| e.to_string())?;
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
