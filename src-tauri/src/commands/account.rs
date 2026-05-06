use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl};

/// ログイン完了フラグ（Activity 切り替えをまたいで状態を保持する）
pub struct LoginCompleteFlag(pub std::sync::Mutex<bool>);

impl LoginCompleteFlag {
    pub fn new() -> Self {
        Self(std::sync::Mutex::new(false))
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

#[cfg(mobile)]
#[tauri::command]
pub async fn open_add_account_window(app: AppHandle) -> Result<String, String> {
    let account_id = uuid::Uuid::new_v4().to_string();
    // Android マルチウィンドウでは固定ラベルが必要（Activity クラスと 1:1 対応）
    let window_label = "add-account".to_string();

    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let data_dir = app_data
        .join("accounts")
        .join(format!("account-{}", &account_id));
    std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;

    // AddAccount の WebView に注入する init script。
    // Rust 側の URL ポーリングは AddAccount Activity が前面にいる間は
    // メイン WebView を suspend させてしまうため使わない。
    // 代わりに AddAccount の JS 側で URL を監視し、ログイン完了を自ら通知する。
    // この invoke は AddAccount WebView（フォアグラウンド）から発行されるため
    // IPC ルーティングが AddAccount のコンテキストで行われる点が肝要。
    let init_script = r#"
        (function() {
            var invoked = false;
            function checkLoginComplete() {
                if (!invoked && location.pathname === '/home') {
                    if (window.__TAURI_INTERNALS__) {
                        invoked = true;
                        window.__TAURI_INTERNALS__.invoke('mark_login_complete')
                            .catch(function() { invoked = false; });
                    }
                }
                setTimeout(checkLoginComplete, 500);
            }
            setTimeout(checkLoginComplete, 500);
        })();
    "#;

    let result_json = serde_json::json!({
        "accountId": account_id,
        "dataDirectory": data_dir.to_string_lossy(),
        "windowLabel": window_label,
    })
    .to_string();

    let app_clone = app.clone();
    let window_label_clone = window_label.clone();
    let data_dir_clone = data_dir.clone();
    let init_script_owned = init_script.to_string();

    // Ok() を先に返してから build() を実行することで、IPC コールバックが
    // AddAccount ではなくメイン WebView に届くようにする。
    tokio::spawn(async move {
        if let Some(existing) = app_clone.get_webview_window(&window_label_clone) {
            let _ = existing.close();
            tokio::time::sleep(std::time::Duration::from_millis(300)).await;
        }

        let _ = tauri::WebviewWindowBuilder::new(
            &app_clone,
            &window_label_clone,
            WebviewUrl::External(
                "https://x.com/login"
                    .parse()
                    .expect("static URL is valid"),
            ),
        )
        .initialization_script(&init_script_owned)
        .data_directory(data_dir_clone)
        .build();
    });

    Ok(result_json)
}

/// AddAccount WebView の init script から呼ばれる。
/// AddAccount が自分自身のコンテキストで IPC を発行するため、
/// close() が正しい Activity に対して dispatch される可能性が高い。
/// メイン WebView が suspend 中でもフラグで状態を保持し、
/// visibilitychange 後に check_login_complete で取得できる。
#[tauri::command]
pub async fn mark_login_complete(
    app: AppHandle,
    state: tauri::State<'_, LoginCompleteFlag>,
) -> Result<(), String> {
    *state.0.lock().unwrap() = true;

    #[cfg(mobile)]
    {
        // AddAccount.kt の Handler ポーリングが検出してから finish() を呼ぶ。
        // Rust の URL ポーリングは x.com の SPA 遷移（pushState）を検知できないため
        // init script 経由でここに到達した場合のみ確実にファイルが書かれる。
        if let Ok(dir) = app.path().app_data_dir() {
            let _ = std::fs::write(dir.join("add_account_login_complete"), "");
        }
        // Tauri の close も試みる（効かない可能性があるが害はない）
        if let Some(window) = app.get_webview_window("add-account") {
            let _ = window.close();
        }
    }

    // close が成功して MainActivity が前面に戻った後にイベントを届ける（バックアップ）
    // visibilitychange パスが主系、このイベントは副系として機能する
    let app_clone = app.clone();
    tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(1000)).await;
        let _ = app_clone.emit("account-login-complete", ());
    });

    Ok(())
}

/// メイン WebView が visibilitychange でフォアグラウンド復帰した際に呼ぶ。
/// フラグを取得してクリアする（一度だけ true を返す）。
#[tauri::command]
pub async fn check_login_complete(
    state: tauri::State<'_, LoginCompleteFlag>,
) -> Result<bool, String> {
    let mut flag = state.0.lock().unwrap();
    let was_set = *flag;
    *flag = false;
    Ok(was_set)
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
