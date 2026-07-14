//! ツイート作成ウィンドウ。
#[cfg(not(target_os = "android"))]
use super::parse_url;
use super::popup::{build_popup_init, PopupInit};
#[cfg(target_os = "android")]
use crate::commands::settings_store::load_use_x_app_for_compose;
use crate::ipc_constants::labels;
#[cfg(desktop)]
use crate::state::{decide_compose_action, AppState, ComposeAction, ComposeSession};
#[cfg(desktop)]
use std::path::PathBuf;
use tauri::AppHandle;
#[cfg(desktop)]
use tauri::Manager;
#[cfg(not(target_os = "android"))]
use tauri::WebviewUrl;

#[cfg(desktop)]
const COMPOSE_URL: &str = "https://x.com/compose/post";

/// デスクトップ用: ツイート作成ウィンドウを新規作成し、常駐状態（`AppState.compose`）に登録する。
/// ×ボタン（`CloseRequested`）では破棄せず非表示にする（常駐維持のため）。
/// 破棄はアプリ終了時（lib.rs）と置換時（アカウント切替）のみ行う。
/// 戻り値は新しく作成したウィンドウのラベル。
#[cfg(desktop)]
pub(super) fn create_compose_window(
    app: &AppHandle,
    account_id: &str,
    data_dir: PathBuf,
) -> Result<String, String> {
    let PopupInit {
        label: compose_label,
        init_script: popup_init,
    } = build_popup_init(app, labels::COMPOSE_PREFIX, account_id, "");

    const COMPOSE_WIDTH: f64 = 600.0;
    const COMPOSE_WINDOW_HEIGHT: f64 = 580.0; // コンテンツ 540px + ツールバー 40px

    let mut builder = tauri::WebviewWindowBuilder::new(
        app,
        &compose_label,
        WebviewUrl::External(parse_url(COMPOSE_URL)?),
    )
    .title("X - ツイート")
    .inner_size(COMPOSE_WIDTH, COMPOSE_WINDOW_HEIGHT)
    .initialization_script(&popup_init)
    .data_directory(data_dir);

    if let Some(window) = app.get_window(labels::MAIN) {
        if let (Ok(pos), Ok(size)) = (window.outer_position(), window.outer_size()) {
            let scale = window.scale_factor().unwrap_or(1.0);
            let center_x = pos.x as f64 + (size.width as f64 - COMPOSE_WIDTH * scale) / 2.0;
            let center_y =
                pos.y as f64 + (size.height as f64 - COMPOSE_WINDOW_HEIGHT * scale) / 2.0;
            builder = builder.position(center_x / scale, center_y / scale);
        }
    }

    let window = builder.build().map_err(|e| e.to_string())?;

    // ×ボタンで破棄せず非表示にする（常駐維持）。
    let app_handle = app.clone();
    let label_for_handler = compose_label.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            if let Some(w) = app_handle.get_webview_window(&label_for_handler) {
                let _ = w.hide();
            }
        }
    });

    // 常駐状態を更新
    let state = app.state::<AppState>();
    *state.compose.lock().expect("compose mutex poisoned") = Some(ComposeSession {
        label: compose_label.clone(),
        account_id: account_id.to_string(),
    });

    Ok(compose_label)
}

#[cfg(desktop)]
#[tauri::command]
pub async fn open_compose_window(
    app: AppHandle,
    #[allow(non_snake_case)] accountId: String,
    #[allow(non_snake_case)] dataDirectory: String,
) -> Result<(), String> {
    let data_dir = PathBuf::from(&dataDirectory);

    let action = {
        let state = app.state::<AppState>();
        let guard = state.compose.lock().expect("compose mutex poisoned");
        decide_compose_action(guard.as_ref(), &accountId)
    };

    match action {
        ComposeAction::Reuse { label } => {
            if let Some(w) = app.get_webview_window(&label) {
                // 再表示のたびに新規作成ページへ遷移する（確定要求5）
                if w.eval(format!("location.href = '{COMPOSE_URL}';")).is_ok() {
                    let _ = w.show();
                    let _ = w.set_focus();
                    return Ok(());
                }
                // eval 失敗（WebProcess 死亡等）→ 作り直しへフォールバック。
                // close() は常駐用の CloseRequested ハンドラに拾われて非表示化されてしまう
                // （常駐 = prevent_close + hide の対象になっているため）ので、
                // 本当に破棄するには destroy() を使う。
                let _ = w.destroy();
            }
            // ウィンドウ実体が無い場合もそのまま作り直しへ
        }
        ComposeAction::Replace { old_label } => {
            if let Some(w) = app.get_webview_window(&old_label) {
                // 置換時は旧ウィンドウを本当に破棄する（close() だと hide() にすり替わる）。
                let _ = w.destroy();
            }
        }
        ComposeAction::CreateNew => {}
    }

    create_compose_window(&app, &accountId, data_dir)?;
    Ok(())
}

#[cfg(mobile)]
#[tauri::command]
pub async fn open_compose_window(
    app: AppHandle,
    #[allow(non_snake_case)] accountId: String,
    #[allow(non_snake_case)] dataDirectory: String,
) -> Result<(), String> {
    let PopupInit {
        label: compose_label,
        init_script: popup_init,
    } = build_popup_init(&app, labels::COMPOSE_PREFIX, &accountId, "");

    #[cfg(target_os = "android")]
    {
        let _ = (dataDirectory,);
        if load_use_x_app_for_compose(&app) {
            return crate::android_bridge::launch_compose_tweet_intent();
        }
        return crate::android_bridge::create_popup_webview(
            &compose_label,
            "https://x.com/compose/post",
            &popup_init,
            &accountId,
        );
    }

    #[cfg(not(target_os = "android"))]
    {
        let data_dir = std::path::PathBuf::from(&dataDirectory);
        tauri::WebviewWindowBuilder::new(
            &app,
            &compose_label,
            WebviewUrl::External(parse_url("https://x.com/compose/post")?),
        )
        .initialization_script(&popup_init)
        .data_directory(data_dir)
        .build()
        .map_err(|e| e.to_string())?;
        Ok(())
    }
}
