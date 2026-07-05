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

    // Rust側でURLをポーリングしてログイン完了を検出する。
    // 通知後は仕事がないため break し、ウィンドウが閉じられないまま放置された
    // 場合に備えて開始から最大10分でポーリングを打ち切る（mobile 側と同値）。
    let app_clone = app.clone();
    let window_label_clone = window_label.clone();
    tokio::spawn(async move {
        const POLL_MS: u64 = 500;
        const MAX_POLLS: u64 = 10 * 60 * 1000 / POLL_MS; // 最大10分
        for _ in 0..MAX_POLLS {
            tokio::time::sleep(std::time::Duration::from_millis(POLL_MS)).await;
            match app_clone.get_webview_window(&window_label_clone) {
                Some(w) => {
                    if let Ok(url) = w.url() {
                        if url.path() == "/home" {
                            let _ = app_clone.emit(events::ACCOUNT_LOGIN_COMPLETE, ());
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
    log::info!("[open_add_account] sentinel_dir={}", sentinel_dir.display());

    let result_json = serde_json::json!({
        "accountId": account_id,
        "dataDirectory": data_dir.to_string_lossy(),
        "windowLabel": "add-account",
    })
    .to_string();

    // AddAccount Activity を JNI 経由で起動する（account_id を渡して WebView Profile を分離する）
    #[cfg(target_os = "android")]
    {
        log::info!(
            "[open_add_account] launching AddAccount Activity via JNI, account_id={account_id}"
        );
        match crate::android_bridge::launch_add_account_activity(&account_id) {
            Ok(()) => log::info!("[open_add_account] AddAccount Activity launched"),
            Err(e) => log::warn!("[open_add_account] JNI launch error: {e}"),
        }
    }

    log::info!("[open_add_account] entering poll loop");

    // AddAccount.kt がセンチネルファイルを書き込むまでブロックして待機する。
    // メイン WebView の JavaScript は AddAccount がアクティブな間 suspend されるが、
    // tokio ランタイムは継続して動作するためこのループは正常に実行される。
    const POLL_MS: u64 = 500;
    const MAX_POLLS: u64 = 10 * 60 * 1000 / POLL_MS; // 最大 10 分
    for i in 0..MAX_POLLS {
        tokio::time::sleep(std::time::Duration::from_millis(POLL_MS)).await;

        if success_sentinel.exists() {
            log::info!("[open_add_account] success sentinel found at poll #{i}");
            let _ = std::fs::remove_file(&success_sentinel);
            return Ok(result_json);
        }
        if cancel_sentinel.exists() {
            log::info!("[open_add_account] cancel sentinel found at poll #{i}");
            let _ = std::fs::remove_file(&cancel_sentinel);
            return Err("cancelled".to_string());
        }

        if i % 20 == 0 {
            log::info!("[open_add_account] poll #{i}: still waiting...");
        }
    }

    log::warn!("[open_add_account] timeout");
    Err("timeout".to_string())
}

/// twid Cookie の値（`twid=` を剥がした後の部分）から数値ユーザーIDを抽出する。
/// `u%3D<id>`（URLエンコード生値）/ `u=<id>`（デコード後）のどちらの形式にも対応する。
/// `u=` 以降が1文字以上のASCII数字のみの場合に限り `Some` を返し、それ以外は `None`。
pub fn parse_twid_user_id(twid_value: &str) -> Option<String> {
    let normalized = twid_value.replace("%3D", "=").replace("%3d", "=");
    let id = normalized.strip_prefix("u=")?;
    if !id.is_empty() && id.bytes().all(|b| b.is_ascii_digit()) {
        Some(id.to_string())
    } else {
        None
    }
}

/// cookie の (name, value) 列から twid を探して数値ユーザーIDを取り出す。
fn twid_user_id_from_cookies<'a>(
    cookies: impl IntoIterator<Item = (&'a str, &'a str)>,
) -> Option<String> {
    for (name, value) in cookies {
        if name == "twid" {
            return parse_twid_user_id(value);
        }
    }
    None
}

/// 再認証完了イベント（ACCOUNT_REAUTH_COMPLETE）の payload。
#[derive(Clone, serde::Serialize)]
struct ReauthCompletePayload {
    #[serde(rename = "accountId")]
    account_id: String,
    #[serde(rename = "xUserId")]
    x_user_id: Option<String>,
}

/// 登録済みアカウントの data_directory を再利用して x.com に再ログインし、
/// ログイン完了（/home 到達）時に twid Cookie から数値ユーザーIDを読んで
/// ACCOUNT_REAUTH_COMPLETE イベントを emit する。
#[cfg(desktop)]
#[tauri::command]
pub async fn reauth_account_window(
    app: AppHandle,
    account_id: String,
    data_directory: String,
) -> Result<String, String> {
    let window_label = format!("{}{}", labels::ADD_ACCOUNT_PREFIX, &account_id[..8]);

    tauri::WebviewWindowBuilder::new(
        &app,
        &window_label,
        WebviewUrl::External(
            "https://x.com/login"
                .parse()
                .map_err(|e: url::ParseError| e.to_string())?,
        ),
    )
    .title("アカウントを再認証")
    .inner_size(500.0, 700.0)
    .data_directory(std::path::PathBuf::from(&data_directory))
    .build()
    .map_err(|e| e.to_string())?;

    // Rust側でURLをポーリングしてログイン完了を検出する。cookies_for_url は
    // Windows で同期コマンド内から呼ぶとデッドロックするため、必ず tokio::spawn
    // した非同期タスク内で読む（open_add_account_window と同じ構造）。
    let app_clone = app.clone();
    let window_label_clone = window_label.clone();
    let account_id_clone = account_id.clone();
    tokio::spawn(async move {
        const POLL_MS: u64 = 500;
        const MAX_POLLS: u64 = 10 * 60 * 1000 / POLL_MS; // 最大10分
        for _ in 0..MAX_POLLS {
            tokio::time::sleep(std::time::Duration::from_millis(POLL_MS)).await;
            match app_clone.get_webview_window(&window_label_clone) {
                Some(w) => {
                    if let Ok(url) = w.url() {
                        if url.path() == "/home" {
                            let x_user_id = match "https://x.com".parse() {
                                Ok(cookie_url) => {
                                    match w.cookies_for_url(cookie_url) {
                                        Ok(cookies) => twid_user_id_from_cookies(
                                            cookies.iter().map(|c| (c.name(), c.value())),
                                        ),
                                        Err(e) => {
                                            log::warn!("[reauth_account_window] cookies_for_url error: {e}");
                                            None
                                        }
                                    }
                                }
                                Err(e) => {
                                    log::warn!(
                                        "[reauth_account_window] cookie url parse error: {e}"
                                    );
                                    None
                                }
                            };
                            let _ = app_clone.emit(
                                events::ACCOUNT_REAUTH_COMPLETE,
                                ReauthCompletePayload {
                                    account_id: account_id_clone.clone(),
                                    x_user_id,
                                },
                            );
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
        "dataDirectory": data_directory,
        "windowLabel": window_label,
    })
    .to_string())
}

#[cfg(mobile)]
#[tauri::command]
pub async fn reauth_account_window(
    app: AppHandle,
    account_id: String,
    data_directory: String,
    expected_user_id: Option<String>,
) -> Result<String, String> {
    // mobile では Kotlin 側が accountId でプロファイル（WebView Profile）を特定するため未使用。
    let _ = &data_directory;

    let sentinel_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let complete_sentinel = sentinel_dir.join("reauth_complete");
    let mismatch_sentinel = sentinel_dir.join("reauth_mismatch");
    let cancelled_sentinel = sentinel_dir.join("reauth_cancelled");
    let _ = std::fs::remove_file(&complete_sentinel);
    let _ = std::fs::remove_file(&mismatch_sentinel);
    let _ = std::fs::remove_file(&cancelled_sentinel);
    log::info!(
        "[reauth_account_window] sentinel_dir={} account_id={account_id}",
        sentinel_dir.display()
    );

    // AddAccount Activity を再認証モードで JNI 経由で起動する
    #[cfg(target_os = "android")]
    {
        log::info!(
            "[reauth_account_window] launching AddAccount Activity (reauth) via JNI, account_id={account_id}"
        );
        match crate::android_bridge::launch_reauth_account_activity(
            &account_id,
            expected_user_id.as_deref(),
        ) {
            Ok(()) => log::info!("[reauth_account_window] AddAccount Activity launched"),
            Err(e) => log::warn!("[reauth_account_window] JNI launch error: {e}"),
        }
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = &expected_user_id;
    }

    log::info!("[reauth_account_window] entering poll loop");

    // AddAccount.kt がセンチネルファイルを書き込むまでブロックして待機する。
    const POLL_MS: u64 = 500;
    const MAX_POLLS: u64 = 10 * 60 * 1000 / POLL_MS; // 最大 10 分
    for i in 0..MAX_POLLS {
        tokio::time::sleep(std::time::Duration::from_millis(POLL_MS)).await;

        if complete_sentinel.exists() {
            log::info!("[reauth_account_window] complete sentinel found at poll #{i}");
            let content = std::fs::read_to_string(&complete_sentinel).unwrap_or_default();
            let _ = std::fs::remove_file(&complete_sentinel);
            let xid = content.trim();
            let x_user_id = if xid.is_empty() {
                serde_json::Value::Null
            } else {
                serde_json::Value::String(xid.to_string())
            };
            return Ok(serde_json::json!({
                "accountId": account_id,
                "xUserId": x_user_id,
            })
            .to_string());
        }
        if mismatch_sentinel.exists() {
            log::info!("[reauth_account_window] mismatch sentinel found at poll #{i}");
            let _ = std::fs::remove_file(&mismatch_sentinel);
            return Err("account-mismatch".to_string());
        }
        if cancelled_sentinel.exists() {
            log::info!("[reauth_account_window] cancelled sentinel found at poll #{i}");
            let _ = std::fs::remove_file(&cancelled_sentinel);
            return Err("cancelled".to_string());
        }

        if i % 20 == 0 {
            log::info!("[reauth_account_window] poll #{i}: still waiting...");
        }
    }

    log::warn!("[reauth_account_window] timeout");
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
    fn urlエンコード済みtwidから数値idを抽出する() {
        assert_eq!(
            parse_twid_user_id("u%3D118318317"),
            Some("118318317".to_string())
        );
    }

    #[test]
    fn urlデコード済みtwidから数値idを抽出する() {
        assert_eq!(
            parse_twid_user_id("u=118318317"),
            Some("118318317".to_string())
        );
    }

    #[test]
    fn 小文字エンコードのtwidからも数値idを抽出する() {
        assert_eq!(
            parse_twid_user_id("u%3d118318317"),
            Some("118318317".to_string())
        );
    }

    #[test]
    fn idが空のtwidはnoneを返す() {
        assert_eq!(parse_twid_user_id("u="), None);
    }

    #[test]
    fn idが数字以外を含むtwidはnoneを返す() {
        assert_eq!(parse_twid_user_id("u=abc"), None);
    }

    #[test]
    fn uプレフィックスが無いtwidはnoneを返す() {
        assert_eq!(parse_twid_user_id("118318317"), None);
    }

    #[test]
    fn 空文字のtwidはnoneを返す() {
        assert_eq!(parse_twid_user_id(""), None);
    }

    #[test]
    fn twidを含むcookie列から数値idを抽出する() {
        let cookies = vec![("twid", "u=118318317")];
        assert_eq!(
            twid_user_id_from_cookies(cookies),
            Some("118318317".to_string())
        );
    }

    #[test]
    fn twidが無いcookie列はnoneを返す() {
        let cookies = vec![("ct0", "abc"), ("auth_token", "xyz")];
        assert_eq!(twid_user_id_from_cookies(cookies), None);
    }

    #[test]
    fn 複数cookieに紛れていてもtwidを抽出する() {
        let cookies = vec![
            ("ct0", "abc"),
            ("twid", "u%3D118318317"),
            ("auth_token", "xyz"),
        ];
        assert_eq!(
            twid_user_id_from_cookies(cookies),
            Some("118318317".to_string())
        );
    }

    #[test]
    fn twid値が不正な場合はnoneを返す() {
        let cookies = vec![("twid", "invalid")];
        assert_eq!(twid_user_id_from_cookies(cookies), None);
    }

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

    mod properties {
        use super::*;
        use proptest::prelude::*;

        proptest! {
            /// u= 形式・u%3D 形式のどちらも、任意の非負整数をそのままユーザーIDとして復元できる。
            #[test]
            fn 非負整数を含むtwid値から同じ数値idを復元できる(n in any::<u64>()) {
                let expected = Some(n.to_string());
                prop_assert_eq!(parse_twid_user_id(&format!("u={n}")), expected.clone());
                prop_assert_eq!(parse_twid_user_id(&format!("u%3D{n}")), expected);
            }

            /// u=/u%3D/u%3d のいずれのプレフィックスも持たない任意の文字列はnoneを返す。
            #[test]
            fn uプレフィックスを持たない文字列はnoneを返す(s in any::<String>()) {
                prop_assume!(
                    !s.starts_with("u=") && !s.starts_with("u%3D") && !s.starts_with("u%3d")
                );
                prop_assert_eq!(parse_twid_user_id(&s), None);
            }
        }
    }
}
