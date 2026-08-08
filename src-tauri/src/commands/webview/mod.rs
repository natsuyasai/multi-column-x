//! WebView 関連の Tauri コマンド。
//! カラム / ポップアップ / コンポーズはサブモジュールに分割し、
//! lib.rs の generate_handler! からは従来どおり commands::webview::xxx で参照できるよう再エクスポートする。
mod column;
mod compose;
mod popup;

pub use column::*;
pub use compose::*;
pub use popup::*;

use crate::ipc_constants::events;
use crate::state::{AppState, ComposeSession, WebviewRegistry};
use tauri::{AppHandle, Emitter, Manager};

// Android はポップアップ/カラムとも URL 文字列を JNI 経由でそのまま渡すため、
// 到達可能な呼び出し元がなく dead_code になる（参照自体は残るため cfg では消せない）。
#[cfg_attr(target_os = "android", allow(dead_code))]
fn parse_url(s: &str) -> Result<tauri::Url, String> {
    s.parse().map_err(|e: url::ParseError| e.to_string())
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

/// WebView Profile API（アカウントごとのセッション分離）の対応可否を返す。
/// Android 以外（デスクトップ）は常に false（2カラム判定はモバイル専用のため未使用）。
/// 取得失敗時も false（シングル表示へ安全側フォールバック）。
#[tauri::command]
pub async fn is_webview_profile_supported() -> bool {
    #[cfg(target_os = "android")]
    {
        crate::android_bridge::is_webview_profile_supported().unwrap_or(false)
    }
    #[cfg(not(target_os = "android"))]
    {
        false
    }
}

#[tauri::command]
pub async fn eval_in_webview(
    caller: tauri::Webview,
    app: AppHandle,
    label: String,
    script: String,
) -> Result<(), String> {
    crate::commands::require_main_caller(&caller)?;
    // Android のカラム WebView はネイティブ Android WebView で管理しているため
    // Tauri の get_webview では見つからない。android_bridge 経由で評価する。
    #[cfg(target_os = "android")]
    if label.starts_with(crate::ipc_constants::labels::COLUMN_PREFIX) {
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
    app.emit(events::WEBVIEW_SCROLL, delta)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn report_new_posts_count(
    app: AppHandle,
    label: String,
    count: u32,
) -> Result<(), String> {
    app.emit(
        events::WEBVIEW_NEW_POSTS_COUNT,
        serde_json::json!({ "label": label, "count": count }),
    )
    .map_err(|e| e.to_string())
}

/// labelからaccount_idを解決する。まずWebviewRegistry（カラム・ポップアップ系）を見て、
/// 見つからなければ常駐コンポーズ（ComposeSession）を見る。
/// 呼び出し元でregistry→composeの順にMutexをロックしてから渡す設計。
/// この関数自体は参照を受け取るだけでロックの取得・解放には関与しない。
fn resolve_account_id(
    registry: &WebviewRegistry,
    compose: Option<&ComposeSession>,
    label: &str,
) -> Option<String> {
    if let Some(account_id) = registry.get_account_id(label) {
        return Some(account_id.to_string());
    }
    compose
        .filter(|session| session.label == label)
        .map(|session| session.account_id.clone())
}

/// report_api_rate_limit が emit するペイロードを組み立てる（テスト用に純粋関数として切り出し）。
fn build_api_rate_limit_payload(
    label: &str,
    bucket_key: &str,
    limit: u32,
    remaining: u32,
    reset: u64,
    account_id: Option<&str>,
) -> serde_json::Value {
    serde_json::json!({
        "label": label,
        "bucketKey": bucket_key,
        "limit": limit,
        "remaining": remaining,
        "reset": reset,
        "accountId": account_id
    })
}

/// label から account_id を解決した上で WEBVIEW_API_RATE_LIMIT を emit する共通ロジック。
/// デスクトップの Tauri コマンド（report_api_rate_limit）と、Android JNI ブリッジ経由の
/// report_api_rate_limit_from_android の両方から呼ばれる。
fn emit_api_rate_limit_resolving_account(
    app: &AppHandle,
    label: &str,
    bucket_key: &str,
    limit: u32,
    remaining: u32,
    reset: u64,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    let account_id = {
        let registry = state.registry.lock().expect("registry mutex poisoned");
        let compose = state.compose.lock().expect("compose mutex poisoned");
        resolve_account_id(&registry, compose.as_ref(), label)
    };
    app.emit(
        events::WEBVIEW_API_RATE_LIMIT,
        build_api_rate_limit_payload(
            label,
            bucket_key,
            limit,
            remaining,
            reset,
            account_id.as_deref(),
        ),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn report_api_rate_limit(
    app: AppHandle,
    label: String,
    bucket_key: String,
    limit: u32,
    remaining: u32,
    reset: u64,
) -> Result<(), String> {
    emit_api_rate_limit_resolving_account(&app, &label, &bucket_key, limit, remaining, reset)
}

/// Android の column WebView（ネイティブ WebView・Tauri IPC非対応）から
/// window.__mcxApiRateLimitBridge 経由で届いた JSON payload を表す構造体。
///
/// 呼び出し元（android_bridge.rs）は Android ターゲットでのみコンパイルされるため、
/// デスクトップ向けビルドでは本番コードから到達不能になり dead_code になる
/// （テストからは呼ばれるため参照自体は残す必要があり、cfg では消せない）。
#[derive(Debug, serde::Deserialize)]
#[cfg_attr(not(target_os = "android"), allow(dead_code))]
struct AndroidApiRateLimitPayload {
    #[serde(rename = "bucketKey")]
    bucket_key: String,
    limit: u32,
    remaining: u32,
    reset: u64,
}

/// Android ブリッジから届く JSON payload をパースする（テスト用に純粋関数として切り出し）。
#[cfg_attr(not(target_os = "android"), allow(dead_code))]
fn parse_android_api_rate_limit_payload(
    payload_json: &str,
) -> Result<AndroidApiRateLimitPayload, String> {
    serde_json::from_str(payload_json).map_err(|e| e.to_string())
}

/// Android の column WebView（ネイティブ WebView・Tauri IPC非対応）から
/// window.__mcxApiRateLimitBridge 経由で届いた JSON payload をパースして emit する。
#[cfg_attr(not(target_os = "android"), allow(dead_code))]
pub fn report_api_rate_limit_from_android(
    app: &AppHandle,
    label: &str,
    payload_json: &str,
) -> Result<(), String> {
    let payload = parse_android_api_rate_limit_payload(payload_json)?;
    emit_api_rate_limit_resolving_account(
        app,
        label,
        &payload.bucket_key,
        payload.limit,
        payload.remaining,
        payload.reset,
    )
}

#[tauri::command]
pub async fn report_keyboard_shortcut(app: AppHandle, key: String) -> Result<(), String> {
    app.emit(events::WEBVIEW_KEYBOARD_SHORTCUT, key)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn open_in_browser(url: String) -> Result<(), String> {
    tauri_plugin_opener::open_url(url, None::<&str>).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn httpsのurlをパースできる() {
        let result = parse_url("https://x.com/home");
        assert!(result.is_ok());
        assert_eq!(result.unwrap().as_str(), "https://x.com/home");
    }

    #[test]
    fn 不正なurlはエラーメッセージを返す() {
        let result = parse_url("not a url");
        assert!(result.is_err());
        assert!(!result.unwrap_err().is_empty());
    }

    #[test]
    fn api_rate_limitのペイロードが期待した形になる() {
        let payload = build_api_rate_limit_payload(
            "home-timeline",
            "user_tweets",
            150,
            42,
            1_700_000_000,
            Some("account-1"),
        );
        assert_eq!(payload["label"], "home-timeline");
        assert_eq!(payload["bucketKey"], "user_tweets");
        assert_eq!(payload["limit"], 150);
        assert_eq!(payload["remaining"], 42);
        assert_eq!(payload["reset"], 1_700_000_000);
        assert_eq!(payload["accountId"], "account-1");
    }

    #[test]
    fn api_rate_limitのペイロードはaccount_idがnoneの場合accountidがnullになる() {
        let payload = build_api_rate_limit_payload(
            "home-timeline",
            "user_tweets",
            150,
            42,
            1_700_000_000,
            None,
        );
        assert!(payload["accountId"].is_null());
    }

    fn new_registry_for_resolve_test() -> WebviewRegistry {
        WebviewRegistry {
            entries: HashMap::new(),
        }
    }

    #[test]
    fn resolve_account_idはregistryに登録済みのlabelに対してaccount_idを返す() {
        let mut registry = new_registry_for_resolve_test();
        registry.register(
            "column-1".to_string(),
            "col-1".to_string(),
            "account-1".to_string(),
            "/data/dir".to_string(),
        );
        let result = resolve_account_id(&registry, None, "column-1");
        assert_eq!(result, Some("account-1".to_string()));
    }

    #[test]
    fn resolve_account_idはregistryに無くcompose_sessionのlabelと一致する場合account_idを返す() {
        let registry = new_registry_for_resolve_test();
        let compose = ComposeSession {
            label: "compose-1".to_string(),
            account_id: "account-2".to_string(),
        };
        let result = resolve_account_id(&registry, Some(&compose), "compose-1");
        assert_eq!(result, Some("account-2".to_string()));
    }

    #[test]
    fn resolve_account_idはregistryにもcomposeにも無いlabelはnoneを返す() {
        let registry = new_registry_for_resolve_test();
        let compose = ComposeSession {
            label: "compose-1".to_string(),
            account_id: "account-2".to_string(),
        };
        let result = resolve_account_id(&registry, Some(&compose), "unknown-label");
        assert_eq!(result, None);
    }

    #[test]
    fn resolve_account_idはcompose_sessionはあるがlabelが不一致の場合noneを返す() {
        let registry = new_registry_for_resolve_test();
        let compose = ComposeSession {
            label: "compose-1".to_string(),
            account_id: "account-2".to_string(),
        };
        let result = resolve_account_id(&registry, Some(&compose), "compose-2");
        assert_eq!(result, None);
    }

    #[test]
    fn android用ペイロードのjsonパースは正しい形式なら各フィールドを取り出せる() {
        let json = r#"{"bucketKey":"user_tweets","limit":150,"remaining":42,"reset":1700000000}"#;
        let payload = parse_android_api_rate_limit_payload(json).expect("パースに成功するはず");
        assert_eq!(payload.bucket_key, "user_tweets");
        assert_eq!(payload.limit, 150);
        assert_eq!(payload.remaining, 42);
        assert_eq!(payload.reset, 1_700_000_000);
    }

    #[test]
    fn android用ペイロードのjsonパースは不正なjsonの場合エラーになる() {
        let result = parse_android_api_rate_limit_payload("not a json");
        assert!(result.is_err());
        assert!(!result.unwrap_err().is_empty());
    }

    #[test]
    fn android用ペイロードのjsonパースは必須フィールドが欠けている場合エラーになる() {
        let json = r#"{"bucketKey":"user_tweets","limit":150}"#;
        let result = parse_android_api_rate_limit_payload(json);
        assert!(result.is_err());
    }
}
