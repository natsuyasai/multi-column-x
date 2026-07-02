use crate::ipc_constants::{events, labels};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl};

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
        println!(
            "[open_add_account] launching AddAccount Activity via JNI, account_id={account_id}"
        );
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

/// 削除対象パスが accounts ルートの「配下」であることを検証する（ルート自体・外部・.. 参照は拒否）。
/// canonicalize は存在しないパスで失敗するため、字句的な正規化（components ベース）で判定する。
fn is_safe_account_dir(path: &Path, accounts_root: &Path) -> bool {
    use std::path::Component;
    if path.components().any(|c| matches!(c, Component::ParentDir)) {
        return false;
    }
    path.starts_with(accounts_root) && path != accounts_root
}

#[tauri::command]
pub async fn delete_account_data(
    caller: tauri::Webview,
    app: AppHandle,
    data_directory: String,
) -> Result<(), String> {
    crate::commands::require_main_caller(&caller)?;
    let accounts_root = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("accounts");
    let path = PathBuf::from(&data_directory);
    if !is_safe_account_dir(&path, &accounts_root) {
        return Err("invalid account data directory".to_string());
    }
    if path.exists() {
        std::fs::remove_dir_all(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn close_window(
    caller: tauri::Webview,
    app: AppHandle,
    label: String,
) -> Result<(), String> {
    crate::commands::require_main_caller(&caller)?;
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accounts配下のディレクトリは削除を許可する() {
        let root = Path::new("/data/app/accounts");
        assert!(is_safe_account_dir(
            Path::new("/data/app/accounts/account-abc"),
            root
        ));
    }

    #[test]
    fn accounts直下でないパスは拒否する() {
        let root = Path::new("/data/app/accounts");
        assert!(!is_safe_account_dir(Path::new("/data/app"), root));
        assert!(!is_safe_account_dir(Path::new("/etc"), root));
    }

    #[test]
    fn 親ディレクトリ参照を含むパスは拒否する() {
        let root = Path::new("/data/app/accounts");
        assert!(!is_safe_account_dir(
            Path::new("/data/app/accounts/../../../etc"),
            root
        ));
    }

    #[test]
    fn accountsルート自体は拒否する() {
        let root = Path::new("/data/app/accounts");
        assert!(!is_safe_account_dir(root, root));
    }
}
