//! メディア／リンクポップアップウィンドウの作成・セッション切替・クローズ。
#[cfg(not(target_os = "android"))]
use super::parse_url;
use crate::commands::settings_store::{load_accounts_json, load_popup_esc_close_enabled};
use crate::ipc_constants::labels;
use crate::state::AppState;
#[cfg(target_os = "android")]
use crate::state::ComposeSession;
#[cfg(not(target_os = "android"))]
use std::path::PathBuf;
#[cfg(not(target_os = "android"))]
use std::time::Duration;
#[cfg(not(target_os = "android"))]
use tauri::WebviewUrl;
use tauri::{AppHandle, Manager};
#[cfg(desktop)]
use tauri::{LogicalPosition, LogicalSize};

#[cfg(desktop)]
const POPUP_FALLBACK_BOUNDS: (LogicalPosition<f64>, LogicalSize<f64>) = (
    LogicalPosition { x: 50.0, y: 50.0 },
    LogicalSize {
        width: 800.0,
        height: 600.0,
    },
);

#[cfg(desktop)]
const POPUP_PADDING: f64 = 50.0;

/// メインウィンドウの位置・サイズから POPUP_PADDING ぶん内側に寄せた
/// ポップアップの位置とサイズを計算する（純粋関数）。
#[cfg(desktop)]
fn padded_popup_bounds(
    main_x: f64,
    main_y: f64,
    main_width: f64,
    main_height: f64,
) -> (LogicalPosition<f64>, LogicalSize<f64>) {
    (
        LogicalPosition::new(main_x + POPUP_PADDING, main_y + POPUP_PADDING),
        LogicalSize::new(
            main_width - POPUP_PADDING * 2.0,
            main_height - POPUP_PADDING * 2.0,
        ),
    )
}

/// デスクトップ専用: メインウィンドウを基準にパディングを付けたポップアップの
/// 位置とサイズを返す。ウィンドウが取得できない場合はフォールバック値を使う。
#[cfg(desktop)]
fn get_popup_bounds(app: &AppHandle) -> (LogicalPosition<f64>, LogicalSize<f64>) {
    let Some(window) = app.get_window(labels::MAIN) else {
        return POPUP_FALLBACK_BOUNDS;
    };
    let (Ok(pos), Ok(size)) = (window.outer_position(), window.outer_size()) else {
        return POPUP_FALLBACK_BOUNDS;
    };
    padded_popup_bounds(
        pos.x as f64,
        pos.y as f64,
        size.width as f64,
        size.height as f64,
    )
}

/// ポップアップ系ウィンドウ共通の初期化情報。
pub(super) struct PopupInit {
    pub(super) label: String,
    pub(super) init_script: String,
}

/// accounts_json / esc 設定を読み込んでポップアップ init script とラベルを生成する。
pub(super) fn build_popup_init(
    app: &AppHandle,
    label_prefix: &str,
    current_account_id: &str,
    target_href: &str,
) -> PopupInit {
    let accounts_json = load_accounts_json(app);
    let esc_close_enabled = load_popup_esc_close_enabled(app);
    PopupInit {
        label: format!("{}{}", label_prefix, uuid::Uuid::new_v4()),
        init_script: crate::inject::build_popup_init_script(
            &accounts_json,
            current_account_id,
            target_href,
            esc_close_enabled,
        ),
    }
}

#[cfg(desktop)]
#[tauri::command]
pub async fn open_popup_window(
    app: AppHandle,
    webview_label_caller: String,
    url: String,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    let (data_dir, current_account_id) = {
        let registry = state.registry.lock().expect("registry mutex poisoned");
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

    let PopupInit {
        label: popup_label,
        init_script: popup_init,
    } = build_popup_init(&app, labels::POPUP_PREFIX, &current_account_id, &url);
    let (pos, size) = get_popup_bounds(&app);

    tauri::WebviewWindowBuilder::new(&app, &popup_label, WebviewUrl::External(parse_url(&url)?))
        .title("X - メディア")
        .inner_size(size.width, size.height)
        .position(pos.x, pos.y)
        .initialization_script(&popup_init)
        .data_directory(data_dir)
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg(mobile)]
#[tauri::command]
pub async fn open_popup_window(
    app: AppHandle,
    webview_label_caller: String,
    url: String,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    let current_account_id = {
        let registry = state.registry.lock().expect("registry mutex poisoned");
        registry
            .get_account_id(&webview_label_caller)
            .unwrap_or("")
            .to_string()
    };

    let PopupInit {
        label: popup_label,
        init_script: popup_init,
    } = build_popup_init(&app, labels::POPUP_PREFIX, &current_account_id, &url);

    #[cfg(target_os = "android")]
    {
        let _ = app;
        return crate::android_bridge::create_popup_webview(
            &popup_label,
            &url,
            &popup_init,
            &current_account_id,
        );
    }

    #[cfg(not(target_os = "android"))]
    {
        let data_dir = {
            let registry = state.registry.lock().expect("registry mutex poisoned");
            registry
                .get_data_directory(&webview_label_caller)
                .map(PathBuf::from)
                .unwrap_or_default()
        };
        tauri::WebviewWindowBuilder::new(
            &app,
            &popup_label,
            WebviewUrl::External(parse_url(&url)?),
        )
        .initialization_script(&popup_init)
        .data_directory(data_dir)
        .build()
        .map_err(|e| e.to_string())?;
        Ok(())
    }
}

#[cfg(desktop)]
#[tauri::command]
pub async fn open_link_popup_window(
    app: AppHandle,
    webview_label_caller: Option<String>,
    #[allow(non_snake_case)] accountId: Option<String>,
    #[allow(non_snake_case)] dataDirectory: Option<String>,
    url: String,
) -> Result<(), String> {
    let (data_dir, current_account_id) = if let (Some(aid), Some(dd)) = (accountId, dataDirectory) {
        (PathBuf::from(dd), aid)
    } else {
        let label = webview_label_caller.unwrap_or_default();
        let state = app.state::<AppState>();
        let registry = state.registry.lock().expect("registry mutex poisoned");
        let dd = registry
            .get_data_directory(&label)
            .map(PathBuf::from)
            .unwrap_or_default();
        let aid = registry.get_account_id(&label).unwrap_or("").to_string();
        (dd, aid)
    };

    let PopupInit {
        label: popup_label,
        init_script: popup_init,
    } = build_popup_init(&app, labels::POPUP_PREFIX, &current_account_id, "");

    let (pos, size) = get_popup_bounds(&app);

    let builder = tauri::WebviewWindowBuilder::new(
        &app,
        &popup_label,
        WebviewUrl::External(parse_url(&url)?),
    )
    .title("X - リンク")
    .inner_size(size.width, size.height)
    .position(pos.x, pos.y)
    .initialization_script(&popup_init)
    .data_directory(data_dir);

    builder.build().map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg(mobile)]
#[tauri::command]
pub async fn open_link_popup_window(
    app: AppHandle,
    webview_label_caller: Option<String>,
    #[allow(non_snake_case)] accountId: Option<String>,
    #[allow(non_snake_case)] dataDirectory: Option<String>,
    url: String,
) -> Result<(), String> {
    let current_account_id = if let Some(aid) = accountId {
        aid
    } else {
        let label = webview_label_caller.clone().unwrap_or_default();
        let state = app.state::<AppState>();
        let registry = state.registry.lock().expect("registry mutex poisoned");
        registry.get_account_id(&label).unwrap_or("").to_string()
    };

    let PopupInit {
        label: popup_label,
        init_script: popup_init,
    } = build_popup_init(&app, labels::POPUP_PREFIX, &current_account_id, "");

    #[cfg(target_os = "android")]
    {
        let _ = (app, dataDirectory);
        return crate::android_bridge::create_popup_webview(
            &popup_label,
            &url,
            &popup_init,
            &current_account_id,
        );
    }

    #[cfg(not(target_os = "android"))]
    {
        let data_dir = if let Some(dd) = dataDirectory {
            PathBuf::from(dd)
        } else {
            let label = webview_label_caller.unwrap_or_default();
            let state = app.state::<AppState>();
            let registry = state.registry.lock().expect("registry mutex poisoned");
            registry
                .get_data_directory(&label)
                .map(PathBuf::from)
                .unwrap_or_default()
        };
        tauri::WebviewWindowBuilder::new(
            &app,
            &popup_label,
            WebviewUrl::External(parse_url(&url)?),
        )
        .initialization_script(&popup_init)
        .data_directory(data_dir)
        .build()
        .map_err(|e| e.to_string())?;
        Ok(())
    }
}

/// Android 専用: ネイティブポップアップ WebView を削除し、選択アカウントの
/// セッション（WebView Profile）と新しい init script で再作成する。
/// デスクトップの switch_popup_session と同じ「閉じて再作成」をネイティブ経路で行う。
/// popup_toolbar → PopupSessionBridge → AppBridge.onPopupSwitchSession（JNI）から呼ばれる。
#[cfg(target_os = "android")]
pub fn switch_popup_session_android(
    app: &AppHandle,
    popup_label: &str,
    account_id: &str,
    url: &str,
) -> Result<(), String> {
    // compose（COMPOSE_PREFIX）のセッション切替は「常駐の置換」として扱う。
    // POPUP_PREFIX 固定で再作成すると常駐ラベルが popup- になり compose 扱いから
    // 外れてしまう（旧バグ）ため、COMPOSE_PREFIX を維持し常駐状態も更新する。
    if is_compose_popup_label(popup_label) {
        // compose は常に新規作成ページへ遷移する（渡された url は使わない）。
        const COMPOSE_URL: &str = "https://x.com/compose/post";
        // 退避中（hide）の旧常駐でも破棄する（Kotlin 側 removePopupWebView の退避分対応）。
        crate::android_bridge::remove_popup_webview(popup_label)?;
        let PopupInit {
            label: new_label,
            init_script: popup_init,
        } = build_popup_init(app, labels::COMPOSE_PREFIX, account_id, "");
        crate::android_bridge::create_popup_webview(
            &new_label,
            COMPOSE_URL,
            &popup_init,
            account_id,
        )?;
        let state = app.state::<AppState>();
        *state.compose.lock().expect("compose mutex poisoned") = Some(ComposeSession {
            label: new_label,
            account_id: account_id.to_string(),
        });
        return Ok(());
    }

    crate::android_bridge::remove_popup_webview(popup_label)?;
    let PopupInit {
        label: new_label,
        init_script: popup_init,
    } = build_popup_init(app, labels::POPUP_PREFIX, account_id, "");
    crate::android_bridge::create_popup_webview(&new_label, url, &popup_init, account_id)
}

#[tauri::command]
pub async fn switch_popup_session(
    app: AppHandle,
    #[allow(non_snake_case)] popupLabel: String,
    #[allow(non_snake_case)] accountId: String,
    #[allow(non_snake_case)] dataDirectory: String,
    url: String,
) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        let _ = dataDirectory;
        return switch_popup_session_android(&app, &popupLabel, &accountId, &url);
    }

    #[cfg(not(target_os = "android"))]
    switch_popup_session_window(app, popupLabel, accountId, dataDirectory, url).await
}

/// popup ラベルが常駐コンポーズ用ラベル（`COMPOSE_PREFIX`）かどうかを判定する。
/// `switch_popup_session_window`（desktop）/ `switch_popup_session_android`（Android）で
/// 「popup として再作成するか compose として常駐再作成するか」を決めるために使う。
#[cfg(any(desktop, target_os = "android"))]
fn is_compose_popup_label(label: &str) -> bool {
    label.starts_with(labels::COMPOSE_PREFIX)
}

/// デスクトップ / iOS: Tauri ウィンドウとしてのポップアップを閉じて再作成する。
#[cfg(not(target_os = "android"))]
async fn switch_popup_session_window(
    app: AppHandle,
    #[allow(non_snake_case)] popupLabel: String,
    #[allow(non_snake_case)] accountId: String,
    #[allow(non_snake_case)] dataDirectory: String,
    url: String,
) -> Result<(), String> {
    // compose（COMPOSE_PREFIX）のセッション切替は「常駐の置換」として扱う。
    // popup として再作成すると常駐ラベルが POPUP_PREFIX になり compose 扱いから
    // 外れてしまう（旧バグ）ため、create_compose_window で常駐登録込みに作り直す。
    // iOS（#[cfg(mobile)] かつ非 android）は本対応の対象外のため従来どおり。
    #[cfg(desktop)]
    if is_compose_popup_label(&popupLabel) {
        if let Some(window) = app.get_webview_window(&popupLabel) {
            // close() は常駐用の CloseRequested ハンドラに拾われて非表示化されてしまう
            // ため、置換時は destroy() で確実に破棄する。
            window.destroy().map_err(|e| e.to_string())?;
        }
        let _ = url; // compose は常に COMPOSE_URL へ遷移するため url は使わない
        return super::compose::create_compose_window(
            &app,
            &accountId,
            PathBuf::from(&dataDirectory),
        )
        .map(|_| ());
    }

    let (pos, size) = if let Some(window) = app.get_webview_window(&popupLabel) {
        let pos = window.outer_position().ok();
        let size = window.outer_size().ok();
        window.close().map_err(|e| e.to_string())?;
        tokio::time::sleep(Duration::from_millis(150)).await;
        (pos, size)
    } else {
        (None, None)
    };

    let PopupInit {
        label: new_label,
        init_script: popup_init,
    } = build_popup_init(&app, labels::POPUP_PREFIX, &accountId, &url);
    let data_dir = PathBuf::from(&dataDirectory);

    let mut builder =
        tauri::WebviewWindowBuilder::new(&app, &new_label, WebviewUrl::External(parse_url(&url)?))
            .title("X - メディア")
            .initialization_script(&popup_init)
            .data_directory(data_dir);

    if let (Some(p), Some(s)) = (pos, size) {
        let scale = app
            .get_window(labels::MAIN)
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
pub async fn close_popup_window(app: AppHandle, label: String) -> Result<(), String> {
    // 常駐コンポーズは破棄せず非表示にして退避する（戻るボタン／Esc キー経路の対応）。
    // それ以外（popup-）は従来どおり破棄する。
    #[cfg(target_os = "android")]
    {
        let is_persistent_compose = {
            let state = app.state::<AppState>();
            let guard = state.compose.lock().expect("compose mutex poisoned");
            crate::state::is_persistent_compose_label(guard.as_ref(), &label)
        };
        if is_persistent_compose {
            crate::android_bridge::hide_popup_webview(&label).ok();
        } else {
            crate::android_bridge::remove_popup_webview(&label).ok();
        }
        return Ok(());
    }

    // 常駐コンポーズは破棄せず非表示にする（Esc キー経路の対応）。
    #[cfg(desktop)]
    {
        let is_persistent_compose = {
            let state = app.state::<AppState>();
            let guard = state.compose.lock().expect("compose mutex poisoned");
            crate::state::is_persistent_compose_label(guard.as_ref(), &label)
        };
        if is_persistent_compose {
            if let Some(w) = app.get_webview_window(&label) {
                w.hide().map_err(|e| e.to_string())?;
                return Ok(());
            }
        }
    }

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

#[cfg(all(test, desktop))]
mod tests {
    use super::*;

    #[test]
    fn padded_popup_bounds_はメイン位置から50px内側に配置する() {
        let (pos, size) = padded_popup_bounds(100.0, 200.0, 1400.0, 900.0);
        assert_eq!((pos.x, pos.y), (150.0, 250.0));
        assert_eq!((size.width, size.height), (1300.0, 800.0));
    }

    #[test]
    fn padded_popup_bounds_は原点ウィンドウでもパディングを適用する() {
        let (pos, size) = padded_popup_bounds(0.0, 0.0, 800.0, 600.0);
        assert_eq!((pos.x, pos.y), (50.0, 50.0));
        assert_eq!((size.width, size.height), (700.0, 500.0));
    }

    #[test]
    fn is_compose_popup_labelはcompose_prefixで始まるlabelでtrueを返す() {
        assert!(is_compose_popup_label("compose-abc123"));
    }

    #[test]
    fn is_compose_popup_labelはpopup_prefixで始まるlabelでfalseを返す() {
        assert!(!is_compose_popup_label("popup-abc123"));
    }

    #[test]
    fn フォールバック境界は800x600で位置50_50である() {
        let (pos, size) = POPUP_FALLBACK_BOUNDS;
        assert_eq!((pos.x, pos.y), (50.0, 50.0));
        assert_eq!((size.width, size.height), (800.0, 600.0));
    }
}
