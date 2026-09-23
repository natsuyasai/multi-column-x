//! メディア／リンクポップアップウィンドウの作成・セッション切替・クローズ。
#[cfg(not(target_os = "android"))]
use super::parse_url;
#[cfg(not(target_os = "android"))]
use crate::commands::settings_store::resolve_account_data_directory;
use crate::commands::settings_store::{load_accounts_json, load_popup_esc_close_enabled};
use crate::ipc_constants::{events, labels};
use crate::state::AppState;
#[cfg(target_os = "android")]
use crate::state::ComposeSession;
#[cfg(not(target_os = "android"))]
use crate::state::WebviewRegistry;
#[cfg(not(target_os = "android"))]
use std::path::PathBuf;
#[cfg(not(target_os = "android"))]
use std::time::Duration;
#[cfg(not(target_os = "android"))]
use tauri::WebviewUrl;
use tauri::{AppHandle, Emitter, Manager};
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

/// caller のラベルから registry を引いて (data_dir, account_id) を返す（純粋関数）。
/// open_popup_window / open_link_popup_window で、送信元 WebView 自身の
/// セッションだけを解決できるようにする（他カラムを名乗ることを構造的に防ぐ）。
/// 未登録の caller には空文字列・空パスを返す（既存コマンドの挙動を維持）。
#[cfg(not(target_os = "android"))]
pub(super) fn popup_session_for_caller(
    registry: &WebviewRegistry,
    caller_label: &str,
) -> (PathBuf, String) {
    let data_dir = registry
        .get_data_directory(caller_label)
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(""));
    let account_id = registry
        .get_account_id(caller_label)
        .unwrap_or("")
        .to_string();
    (data_dir, account_id)
}

/// open_link_popup_window でセッションに使うアカウントの決め方（純粋関数）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum LinkPopupAccountSource<'a> {
    /// 呼び出し元が指定した accountId をそのまま使う。
    Explicit(&'a str),
    /// 送信元ラベル（caller.label()）から registry で解決する。
    FromCaller(&'a str),
}

/// main（メインウィンドウ）からの呼び出しで accountId 指定があればそれを使い、
/// それ以外（カラム等のリモートコンテンツ）からの呼び出しでは指定を無視し送信元ラベルから
/// 解決する。これにより、カラム側が任意の accountId を騙って他アカウントのセッションで
/// ポップアップを開くことを構造的に防ぐ。
pub(super) fn link_popup_account_source<'a>(
    caller_label: &'a str,
    account_id: Option<&'a str>,
) -> LinkPopupAccountSource<'a> {
    match account_id {
        Some(aid) if caller_label == labels::MAIN => LinkPopupAccountSource::Explicit(aid),
        _ => LinkPopupAccountSource::FromCaller(caller_label),
    }
}

/// switch_popup_session の呼び出し元ラベルが popup/compose のいずれかであることを検証する
/// （純粋関数）。caller.label() を直接対象ラベルとして使うことで、他ウィンドウのラベルを
/// 騙ってセッション切替対象を差し替えることを構造的に防ぐ。
fn is_switchable_popup_caller_label(label: &str) -> bool {
    label.starts_with(labels::POPUP_PREFIX) || label.starts_with(labels::COMPOSE_PREFIX)
}

const OFFICIAL_SETTINGS_URL_PREFIX: &str = "https://x.com/settings";

/// url が公式設定ページ（前方一致）かどうかを判定する純粋関数。
fn is_official_settings_url(url: &str) -> bool {
    url.starts_with(OFFICIAL_SETTINGS_URL_PREFIX)
}

/// アカウント切替（旧ラベルを閉じて新ラベルで開き直す）後、追跡ラベルがどうあるべきかを返す純粋関数。
/// - 新URLが公式設定ページなら新ラベルを追跡する（旧ラベルを追跡していたかに関わらず）。
/// - 新URLが公式設定ページでなく、かつ旧ラベルを追跡していたなら追跡を解除する。
/// - それ以外は現状維持。
fn next_tracked_label_after_switch(
    tracked: Option<&str>,
    old_label: &str,
    new_label: &str,
    new_url_is_official_settings: bool,
) -> Option<String> {
    if new_url_is_official_settings {
        Some(new_label.to_string())
    } else if tracked == Some(old_label) {
        None
    } else {
        tracked.map(|s| s.to_string())
    }
}

/// 破棄されたラベルが、現在追跡中の公式設定ポップアップのラベルと一致するかを判定する純粋関数。
fn is_tracked_popup(tracked: Option<&str>, closed_label: &str) -> bool {
    tracked == Some(closed_label)
}

/// ポップアップを開いた/開き直した URL が公式設定ページなら、追跡ラベルにセットする。
pub fn track_official_settings_popup_if_matches(app: &AppHandle, label: &str, url: &str) {
    if !is_official_settings_url(url) {
        return;
    }
    let state = app.state::<AppState>();
    *state
        .official_settings_popup_label
        .lock()
        .expect("official_settings_popup_label mutex poisoned") = Some(label.to_string());
}

/// アカウント切替時に追跡ラベルを付け替える。旧ウィンドウ/WebViewを実際に破棄する**前**に呼ぶこと
/// （破棄イベントが飛んできた時点で追跡ラベルが新ラベルに更新済みでないと、切替を「閉じた」と
/// 誤検知してしまうため）。
pub fn retarget_official_settings_popup_tracking(
    app: &AppHandle,
    old_label: &str,
    new_label: &str,
    url: &str,
) {
    let state = app.state::<AppState>();
    let mut guard = state
        .official_settings_popup_label
        .lock()
        .expect("official_settings_popup_label mutex poisoned");
    let current = guard.as_deref();
    *guard = next_tracked_label_after_switch(
        current,
        old_label,
        new_label,
        is_official_settings_url(url),
    );
}

/// ポップアップ（ウィンドウ/ネイティブWebView）が実際に破棄されたときに呼ぶ。
/// 追跡中の公式設定ポップアップと一致する場合のみ追跡を解除し OFFICIAL_SETTINGS_POPUP_CLOSED を emit する。
/// desktop の WindowEvent::CloseRequested ハンドラ（lib.rs）と Android の
/// AppBridge.onPopupClosed JNI ハンドラ（android_bridge.rs）の両方から共通で呼ばれる。
pub fn handle_popup_closed(app: &AppHandle, label: &str) {
    let state = app.state::<AppState>();
    let mut guard = state
        .official_settings_popup_label
        .lock()
        .expect("official_settings_popup_label mutex poisoned");
    if !is_tracked_popup(guard.as_deref(), label) {
        return;
    }
    *guard = None;
    drop(guard);
    let _ = app.emit(events::OFFICIAL_SETTINGS_POPUP_CLOSED, ());
}

#[cfg(desktop)]
#[tauri::command]
pub async fn open_popup_window(
    caller: tauri::Webview,
    app: AppHandle,
    url: String,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    let (data_dir, current_account_id) = {
        let registry = state.registry.lock().expect("registry mutex poisoned");
        popup_session_for_caller(&registry, caller.label())
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
    caller: tauri::Webview,
    app: AppHandle,
    url: String,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    let current_account_id = {
        let registry = state.registry.lock().expect("registry mutex poisoned");
        registry
            .get_account_id(caller.label())
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
                .get_data_directory(caller.label())
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
    caller: tauri::Webview,
    app: AppHandle,
    #[allow(non_snake_case)] accountId: Option<String>,
    url: String,
) -> Result<(), String> {
    let (data_dir, current_account_id) =
        match link_popup_account_source(caller.label(), accountId.as_deref()) {
            LinkPopupAccountSource::Explicit(aid) => {
                let dd = resolve_account_data_directory(&app, aid)?;
                (PathBuf::from(dd), aid.to_string())
            }
            LinkPopupAccountSource::FromCaller(label) => {
                let state = app.state::<AppState>();
                let registry = state.registry.lock().expect("registry mutex poisoned");
                popup_session_for_caller(&registry, label)
            }
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
    track_official_settings_popup_if_matches(&app, &popup_label, &url);

    Ok(())
}

#[cfg(mobile)]
#[tauri::command]
pub async fn open_link_popup_window(
    caller: tauri::Webview,
    app: AppHandle,
    #[allow(non_snake_case)] accountId: Option<String>,
    url: String,
) -> Result<(), String> {
    let caller_label = caller.label();
    let current_account_id = match link_popup_account_source(caller_label, accountId.as_deref()) {
        LinkPopupAccountSource::Explicit(aid) => aid.to_string(),
        LinkPopupAccountSource::FromCaller(label) => {
            let state = app.state::<AppState>();
            let registry = state.registry.lock().expect("registry mutex poisoned");
            registry.get_account_id(label).unwrap_or("").to_string()
        }
    };

    let PopupInit {
        label: popup_label,
        init_script: popup_init,
    } = build_popup_init(&app, labels::POPUP_PREFIX, &current_account_id, "");

    #[cfg(target_os = "android")]
    {
        crate::android_bridge::create_popup_webview(
            &popup_label,
            &url,
            &popup_init,
            &current_account_id,
        )?;
        track_official_settings_popup_if_matches(&app, &popup_label, &url);
        Ok(())
    }

    #[cfg(not(target_os = "android"))]
    {
        let data_dir = match link_popup_account_source(caller_label, accountId.as_deref()) {
            LinkPopupAccountSource::Explicit(aid) => {
                PathBuf::from(resolve_account_data_directory(&app, aid)?)
            }
            LinkPopupAccountSource::FromCaller(label) => {
                let state = app.state::<AppState>();
                let registry = state.registry.lock().expect("registry mutex poisoned");
                popup_session_for_caller(&registry, label).0
            }
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
        track_official_settings_popup_if_matches(&app, &popup_label, &url);
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
        // 追跡ラベルの付け替えは、旧ラベルを実際に破棄する（remove_popup_webview）前に行う。
        retarget_official_settings_popup_tracking(app, popup_label, &new_label, COMPOSE_URL);
        // 退避中（hide）の旧常駐でも破棄する（Kotlin 側 removePopupWebView の退避分対応）。
        crate::android_bridge::remove_popup_webview(popup_label)?;
        let state = app.state::<AppState>();
        *state.compose.lock().expect("compose mutex poisoned") = Some(ComposeSession {
            label: new_label,
            account_id: account_id.to_string(),
        });
        return Ok(());
    }

    let PopupInit {
        label: new_label,
        init_script: popup_init,
    } = build_popup_init(app, labels::POPUP_PREFIX, account_id, "");
    crate::android_bridge::create_popup_webview(&new_label, url, &popup_init, account_id)?;
    // 追跡ラベルの付け替えは、旧ラベルを実際に破棄する（remove_popup_webview）前に行う。
    retarget_official_settings_popup_tracking(app, popup_label, &new_label, url);
    crate::android_bridge::remove_popup_webview(popup_label)
}

#[tauri::command]
pub async fn switch_popup_session(
    caller: tauri::Webview,
    app: AppHandle,
    #[allow(non_snake_case)] accountId: String,
    url: String,
) -> Result<(), String> {
    let popup_label = caller.label().to_string();
    if !is_switchable_popup_caller_label(&popup_label) {
        return Err("forbidden: caller must be a popup or compose webview".to_string());
    }

    #[cfg(target_os = "android")]
    {
        return switch_popup_session_android(&app, &popup_label, &accountId, &url);
    }

    #[cfg(not(target_os = "android"))]
    switch_popup_session_window(app, popup_label, accountId, url).await
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
    url: String,
) -> Result<(), String> {
    // 保存先の解決は旧ウィンドウを閉じる（破棄する）前に行う。解決に失敗した場合は
    // 何も閉じずにエラーを返し、既存のポップアップをそのまま維持する。
    let data_dir_str = resolve_account_data_directory(&app, &accountId)?;

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
            PathBuf::from(&data_dir_str),
        )
        .map(|_| ());
    }

    let PopupInit {
        label: new_label,
        init_script: popup_init,
    } = build_popup_init(&app, labels::POPUP_PREFIX, &accountId, &url);

    // 追跡ラベルの付け替えは、旧ウィンドウを実際に破棄する（close）前に行う
    // （破棄イベントが飛んできた時点で追跡ラベルが更新済みでないと、切替を「閉じた」と誤検知するため）。
    retarget_official_settings_popup_tracking(&app, &popupLabel, &new_label, &url);

    let (pos, size) = if let Some(window) = app.get_webview_window(&popupLabel) {
        let pos = window.outer_position().ok();
        let size = window.outer_size().ok();
        window.close().map_err(|e| e.to_string())?;
        tokio::time::sleep(Duration::from_millis(150)).await;
        (pos, size)
    } else {
        (None, None)
    };

    let data_dir = PathBuf::from(&data_dir_str);

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

/// ポップアップを閉じる操作の対象になれるラベルか（popup- / compose- のみ）。
fn is_closable_popup_label(label: &str) -> bool {
    label.starts_with(labels::POPUP_PREFIX) || label.starts_with(labels::COMPOSE_PREFIX)
}

/// close_popup_window の呼び出し可否。対象は popup-/compose- に限り、呼び出し元は main か対象自身に限る。
fn authorize_close_popup(caller_label: &str, target_label: &str) -> Result<(), String> {
    if !is_closable_popup_label(target_label) {
        return Err("forbidden: target is not a popup".to_string());
    }
    if caller_label == labels::MAIN || caller_label == target_label {
        Ok(())
    } else {
        Err("forbidden: caller must be the main window or the popup itself".to_string())
    }
}

#[tauri::command]
pub async fn close_popup_window(
    caller: tauri::Webview,
    app: AppHandle,
    label: String,
) -> Result<(), String> {
    authorize_close_popup(caller.label(), &label)?;
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

#[cfg(test)]
mod authorize_close_popup_tests {
    use super::*;

    #[test]
    fn is_closable_popup_labelはpopup_prefixでtrueを返す() {
        assert!(is_closable_popup_label("popup-abc123"));
    }

    #[test]
    fn is_closable_popup_labelはcompose_prefixでtrueを返す() {
        assert!(is_closable_popup_label("compose-abc123"));
    }

    #[test]
    fn is_closable_popup_labelはmainでfalseを返す() {
        assert!(!is_closable_popup_label(labels::MAIN));
    }

    #[test]
    fn is_closable_popup_labelはcolumn_prefixでfalseを返す() {
        assert!(!is_closable_popup_label("column-abc123"));
    }

    #[test]
    fn 閉じる対象がmainのときは拒否する() {
        assert!(authorize_close_popup(labels::MAIN, labels::MAIN).is_err());
    }

    #[test]
    fn 閉じる対象がcolumnのときは拒否する() {
        assert!(authorize_close_popup(labels::MAIN, "column-abc").is_err());
    }

    #[test]
    fn 閉じる対象がadd_accountのときは拒否する() {
        assert!(authorize_close_popup(labels::MAIN, "add-account-abc").is_err());
    }

    #[test]
    fn mainからpopupを閉じるときは許可する() {
        assert!(authorize_close_popup(labels::MAIN, "popup-abc").is_ok());
    }

    #[test]
    fn mainからcomposeを閉じるときは許可する() {
        assert!(authorize_close_popup(labels::MAIN, "compose-abc").is_ok());
    }

    #[test]
    fn popupが自分自身を閉じるときは許可する() {
        assert!(authorize_close_popup("popup-abc", "popup-abc").is_ok());
    }

    #[test]
    fn 別のpopupから閉じるときは拒否する() {
        assert!(authorize_close_popup("popup-xyz", "popup-abc").is_err());
    }

    #[test]
    fn columnからpopupを閉じるときは拒否する() {
        assert!(authorize_close_popup("column-abc", "popup-xyz").is_err());
    }

    mod properties {
        use super::*;
        use proptest::prelude::*;

        proptest! {
            /// target が popup-/compose- 以外なら caller が何であっても常に拒否される。
            #[test]
            fn targetがpopup_compose以外なら常にerr(
                caller in "[a-z-]{1,20}",
                target in "[a-z-]{1,20}",
            ) {
                prop_assume!(!target.starts_with(labels::POPUP_PREFIX) && !target.starts_with(labels::COMPOSE_PREFIX));
                prop_assert!(authorize_close_popup(&caller, &target).is_err());
            }

            /// caller が main で target が popup- 接頭辞なら常に許可される。
            #[test]
            fn callerがmainでtargetがpopup接頭辞なら常にok(id in "[a-z0-9]{1,20}") {
                let target = format!("{}{}", labels::POPUP_PREFIX, id);
                prop_assert!(authorize_close_popup(labels::MAIN, &target).is_ok());
            }
        }
    }
}

#[cfg(all(test, desktop))]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn new_registry_for_caller_test() -> WebviewRegistry {
        WebviewRegistry {
            entries: HashMap::new(),
        }
    }

    #[test]
    fn popup_session_for_callerは送信元カラムのアカウントとデータディレクトリを返す() {
        let mut registry = new_registry_for_caller_test();
        registry.register(
            "column-a".to_string(),
            "col-a".to_string(),
            "account-a".to_string(),
            "/data/a".to_string(),
        );
        registry.register(
            "column-b".to_string(),
            "col-b".to_string(),
            "account-b".to_string(),
            "/data/b".to_string(),
        );
        // 送信元(caller.label())が column-a であれば、column-b のセッションを
        // 名乗ることはできず、常に送信元自身のセッションが解決される。
        let (data_dir, account_id) = popup_session_for_caller(&registry, "column-a");
        assert_eq!(account_id, "account-a");
        assert_eq!(data_dir, PathBuf::from("/data/a"));
    }

    #[test]
    fn popup_session_for_callerは未登録の送信元には空文字列を返す() {
        let registry = new_registry_for_caller_test();
        let (data_dir, account_id) = popup_session_for_caller(&registry, "column-unknown");
        assert_eq!(account_id, "");
        assert_eq!(data_dir, PathBuf::from(""));
    }

    #[test]
    fn mainからのリンクポップアップは指定されたアカウントを使う() {
        let result = link_popup_account_source(labels::MAIN, Some("account-1"));
        assert_eq!(result, LinkPopupAccountSource::Explicit("account-1"));
    }

    #[test]
    fn main以外からのリンクポップアップは指定されたアカウントを無視し送信元から解決する() {
        let result = link_popup_account_source("column-a", Some("account-spoofed"));
        assert_eq!(result, LinkPopupAccountSource::FromCaller("column-a"));
    }

    #[test]
    fn mainからのリンクポップアップでアカウント指定がなければ送信元から解決する() {
        let result = link_popup_account_source(labels::MAIN, None);
        assert_eq!(result, LinkPopupAccountSource::FromCaller(labels::MAIN));
    }

    #[test]
    fn is_switchable_popup_caller_labelはpopup接頭辞でtrueを返す() {
        assert!(is_switchable_popup_caller_label("popup-abc123"));
    }

    #[test]
    fn is_switchable_popup_caller_labelはcompose接頭辞でtrueを返す() {
        assert!(is_switchable_popup_caller_label("compose-abc123"));
    }

    #[test]
    fn is_switchable_popup_caller_labelはmainラベルでfalseを返す() {
        assert!(!is_switchable_popup_caller_label(labels::MAIN));
    }

    #[test]
    fn is_switchable_popup_caller_labelはcolumn接頭辞でfalseを返す() {
        assert!(!is_switchable_popup_caller_label("column-abc123"));
    }

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
    fn is_official_settings_urlは公式設定urlの前方一致でtrueを返す() {
        assert!(is_official_settings_url("https://x.com/settings"));
        assert!(is_official_settings_url("https://x.com/settings/profile"));
    }

    #[test]
    fn is_official_settings_urlは公式設定url以外でfalseを返す() {
        assert!(!is_official_settings_url("https://x.com/home"));
        assert!(!is_official_settings_url("https://example.com/settings"));
    }

    #[test]
    fn next_tracked_label_after_switchは新urlが公式設定なら新ラベルを追跡する() {
        let result = next_tracked_label_after_switch(None, "popup-old", "popup-new", true);
        assert_eq!(result, Some("popup-new".to_string()));

        let result_with_other_tracked =
            next_tracked_label_after_switch(Some("popup-other"), "popup-old", "popup-new", true);
        assert_eq!(result_with_other_tracked, Some("popup-new".to_string()));
    }

    #[test]
    fn next_tracked_label_after_switchは旧ラベル追跡中に新urlが非公式設定なら追跡を解除する() {
        let result =
            next_tracked_label_after_switch(Some("popup-old"), "popup-old", "popup-new", false);
        assert_eq!(result, None);
    }

    #[test]
    fn next_tracked_label_after_switchはそれ以外の場合現状維持する() {
        let result_tracked_other =
            next_tracked_label_after_switch(Some("popup-other"), "popup-old", "popup-new", false);
        assert_eq!(result_tracked_other, Some("popup-other".to_string()));

        let result_tracked_none =
            next_tracked_label_after_switch(None, "popup-old", "popup-new", false);
        assert_eq!(result_tracked_none, None);
    }

    #[test]
    fn is_tracked_popupは追跡中ラベルと一致する場合trueを返す() {
        assert!(is_tracked_popup(Some("popup-1"), "popup-1"));
    }

    #[test]
    fn is_tracked_popupは追跡中ラベルと不一致の場合falseを返す() {
        assert!(!is_tracked_popup(Some("popup-1"), "popup-2"));
    }

    #[test]
    fn is_tracked_popupは追跡中ラベルがnoneの場合falseを返す() {
        assert!(!is_tracked_popup(None, "popup-1"));
    }

    #[test]
    fn フォールバック境界は800x600で位置50_50である() {
        let (pos, size) = POPUP_FALLBACK_BOUNDS;
        assert_eq!((pos.x, pos.y), (50.0, 50.0));
        assert_eq!((size.width, size.height), (800.0, 600.0));
    }
}
