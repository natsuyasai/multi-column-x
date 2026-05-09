use crate::ipc_constants::{events, labels};
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
    let window_label = format!("{}{}", labels::ADD_ACCOUNT_PREFIX, &account_id[..8]);

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

    // Rust側でURLをポーリングしてログイン完了を検出する
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
                            let _ = app_clone.emit(events::ACCOUNT_LOGIN_COMPLETE, ());
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

    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let data_dir = app_data
        .join("accounts")
        .join(format!("account-{}", &account_id));
    std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;

    // 古いセンチネルファイルをクリア
    let sentinel_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let success_sentinel = sentinel_dir.join("add_account_login_complete");
    let cancel_sentinel = sentinel_dir.join("add_account_login_cancelled");
    let _ = std::fs::remove_file(&success_sentinel);
    let _ = std::fs::remove_file(&cancel_sentinel);
    println!("[open_add_account] sentinel_dir={}", sentinel_dir.display());

    let result_json = serde_json::json!({
        "accountId": account_id,
        "dataDirectory": data_dir.to_string_lossy(),
        "windowLabel": "add-account",
    })
    .to_string();

    // AddAccount Activity を JNI 経由で起動する（account_id を渡して WebView Profile を分離する）
    #[cfg(target_os = "android")]
    {
        println!("[open_add_account] launching AddAccount Activity via JNI, account_id={account_id}");
        match crate::android_bridge::launch_add_account_activity(&account_id) {
            Ok(()) => println!("[open_add_account] AddAccount Activity launched"),
            Err(e) => println!("[open_add_account] JNI launch error: {e}"),
        }
    }

    println!("[open_add_account] entering poll loop");

    // AddAccount.kt がセンチネルファイルを書き込むまでブロックして待機する。
    // メイン WebView の JavaScript は AddAccount がアクティブな間 suspend されるが、
    // tokio ランタイムは継続して動作するためこのループは正常に実行される。
    const POLL_MS: u64 = 500;
    const MAX_POLLS: u64 = 10 * 60 * 1000 / POLL_MS; // 最大 10 分
    for i in 0..MAX_POLLS {
        tokio::time::sleep(std::time::Duration::from_millis(POLL_MS)).await;

        if success_sentinel.exists() {
            println!("[open_add_account] success sentinel found at poll #{i}");
            let _ = std::fs::remove_file(&success_sentinel);
            return Ok(result_json);
        }
        if cancel_sentinel.exists() {
            println!("[open_add_account] cancel sentinel found at poll #{i}");
            let _ = std::fs::remove_file(&cancel_sentinel);
            return Err("cancelled".to_string());
        }

        if i % 20 == 0 {
            println!("[open_add_account] poll #{i}: still waiting...");
        }
    }

    println!("[open_add_account] timeout");
    Err("timeout".to_string())
}

/// AddAccount WebView の init script から呼ばれる。
/// フラグとセンチネルファイルをセットし、AddAccount.kt の finish() を促す。
#[tauri::command]
pub async fn mark_login_complete(
    app: AppHandle,
    state: tauri::State<'_, LoginCompleteFlag>,
) -> Result<(), String> {
    *state.0.lock().unwrap() = true;

    #[cfg(mobile)]
    {
        if let Ok(dir) = app.path().app_data_dir() {
            let _ = std::fs::write(dir.join("add_account_login_complete"), "");
        }
        // AddAccount.kt の finish() が来る前に Tauri 側でも閉じを試みる
        if let Some(window) = app.get_webview_window(labels::ADD_ACCOUNT_MOBILE) {
            let _ = window.close();
        }
    }

    // desktop のみ: main WebView は常にアクティブなので emit で通知できる。
    // mobile は main WebView が suspend 中のため emit を受信できない。
    // mobile では visibilitychange → check_login_complete で通知する（useAccounts.ts 参照）。
    #[cfg(not(mobile))]
    {
        let app_clone = app.clone();
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
            let _ = app_clone.emit(events::ACCOUNT_LOGIN_COMPLETE, ());
        });
    }

    Ok(())
}

/// メイン WebView が visibilitychange でフォアグラウンド復帰した際に呼ぶ。
/// フラグを取得してクリアする（一度だけ true を返す）。
/// Android では AddAccount.kt のネイティブ検出パスがセンチネルファイルを書く場合もあるため、
/// フラグが false でもセンチネルファイルを確認する。
#[tauri::command]
pub async fn check_login_complete(
    app: AppHandle,
    state: tauri::State<'_, LoginCompleteFlag>,
) -> Result<bool, String> {
    let mut flag = state.0.lock().unwrap();
    if *flag {
        *flag = false;
        return Ok(true);
    }
    #[cfg(mobile)]
    if let Ok(dir) = app.path().app_data_dir() {
        let sentinel = dir.join("add_account_login_complete");
        if sentinel.exists() {
            let _ = std::fs::remove_file(&sentinel);
            return Ok(true);
        }
    }
    Ok(false)
}

#[tauri::command]
pub async fn notify_account_logged_in(app: AppHandle) -> Result<(), String> {
    app.emit(events::ACCOUNT_LOGIN_COMPLETE, ())
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
    // desktop のみ: child WebView (add_child で作成) を閉じる
    #[cfg(desktop)]
    if let Some(webview) = app.get_webview(&label) {
        webview.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}
