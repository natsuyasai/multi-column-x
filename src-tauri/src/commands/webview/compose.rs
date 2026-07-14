//! ツイート作成ウィンドウ。
#[cfg(not(target_os = "android"))]
use super::parse_url;
use super::popup::{build_popup_init, PopupInit};
#[cfg(target_os = "android")]
use crate::commands::settings_store::load_use_x_app_for_compose;
use crate::ipc_constants::labels;
#[cfg(any(desktop, target_os = "android"))]
use crate::state::{decide_compose_action, AppState, ComposeAction, ComposeSession};
#[cfg(desktop)]
use std::path::PathBuf;
use tauri::AppHandle;
#[cfg(any(desktop, target_os = "android"))]
use tauri::Manager;
#[cfg(not(target_os = "android"))]
use tauri::WebviewUrl;

// desktop / android 共通のコンポーズ遷移先。
// 常駐再表示時は表示中 URL がここ以外のときだけ遷移する（表示済みならスキップ）。
#[cfg(any(desktop, target_os = "android"))]
const COMPOSE_URL: &str = "https://x.com/compose/post";

/// コンポーズ新規作成ページ（https://x.com/compose/post）を表示中かどうかを判定する。
/// クエリ・ハッシュの差異は無視し、scheme / host / path の一致のみを見る。
#[cfg(desktop)]
fn is_compose_post_url(url: &tauri::Url) -> bool {
    url.scheme() == "https" && url.host_str() == Some("x.com") && url.path() == "/compose/post"
}

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
                // 既にコンポーズページを表示中なら遷移せず再表示のみ（下書きもそのまま維持）。
                // url() 取得失敗時は従来どおり遷移させる。
                let already_on_compose = w.url().map(|u| is_compose_post_url(&u)).unwrap_or(false);
                if already_on_compose {
                    let _ = w.show();
                    let _ = w.set_focus();
                    return Ok(());
                }
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

        let action = {
            let state = app.state::<AppState>();
            let guard = state.compose.lock().expect("compose mutex poisoned");
            decide_compose_action(guard.as_ref(), &accountId)
        };

        match action {
            ComposeAction::Reuse { label } => {
                match crate::android_bridge::reshow_popup_webview(&label, COMPOSE_URL) {
                    Ok(true) => return Ok(()),
                    _ => {
                        // 再表示に失敗（退避が見つからない／JNI エラー等）
                        // → 常駐状態をクリアして新規作成へフォールスルーする。
                        let state = app.state::<AppState>();
                        *state.compose.lock().expect("compose mutex poisoned") = None;
                    }
                }
            }
            ComposeAction::Replace { old_label } => {
                // 退避中（hide）の旧常駐でも破棄する（Kotlin 側 removePopupWebView の退避分対応）。
                crate::android_bridge::remove_popup_webview(&old_label).ok();
            }
            ComposeAction::CreateNew => {}
        }

        crate::android_bridge::create_popup_webview(
            &compose_label,
            COMPOSE_URL,
            &popup_init,
            &accountId,
        )?;

        let state = app.state::<AppState>();
        *state.compose.lock().expect("compose mutex poisoned") = Some(ComposeSession {
            label: compose_label,
            account_id: accountId,
        });

        return Ok(());
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

#[cfg(all(test, desktop))]
mod tests {
    use super::is_compose_post_url;

    fn parse(s: &str) -> tauri::Url {
        s.parse().expect("test url")
    }

    #[test]
    fn compose_postを表示中ならtrueを返す() {
        assert!(is_compose_post_url(&parse("https://x.com/compose/post")));
    }

    #[test]
    fn クエリ付きでもtrueを返す() {
        assert!(is_compose_post_url(&parse(
            "https://x.com/compose/post?foo=1"
        )));
    }

    #[test]
    fn ハッシュ付きでもtrueを返す() {
        assert!(is_compose_post_url(&parse(
            "https://x.com/compose/post#bar"
        )));
    }

    #[test]
    fn 別パスならfalseを返す() {
        assert!(!is_compose_post_url(&parse("https://x.com/home")));
    }

    #[test]
    fn サブパスならfalseを返す() {
        assert!(!is_compose_post_url(&parse(
            "https://x.com/compose/post/quote"
        )));
    }

    #[test]
    fn 別ホストならfalseを返す() {
        assert!(!is_compose_post_url(&parse(
            "https://twitter.com/compose/post"
        )));
    }

    #[test]
    fn httpならfalseを返す() {
        assert!(!is_compose_post_url(&parse("http://x.com/compose/post")));
    }
}
