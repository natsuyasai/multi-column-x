mod acl_contract;
#[cfg(target_os = "android")]
mod android_bridge;
mod commands;
mod inject;
mod ipc_constants;
#[cfg(all(desktop, target_os = "linux"))]
mod linux_codec_env;
mod state;
mod video;

use state::AppState;
use tauri::Manager;
#[cfg(desktop)]
use tauri::{PhysicalPosition, PhysicalSize};
#[cfg(desktop)]
use tauri_plugin_store::StoreExt;

/// `settings`（`appSettings` ストア全体）の `globalSettings.windowBounds` だけを
/// `bounds` に差し替えた新しい値を返す純粋関数。
///
/// `accounts` / `columns` / `globalSettings` 内の他フィールド（`customCSS`,
/// `ngWords` など）には一切触れない。`settings` がオブジェクトでない場合や
/// `globalSettings` が存在しない・オブジェクトでない場合も panic せず、
/// 空オブジェクトから安全に構築する。
#[cfg(desktop)]
fn merge_window_bounds(
    settings: serde_json::Value,
    bounds: serde_json::Value,
) -> serde_json::Value {
    let mut settings = match settings {
        serde_json::Value::Object(map) => serde_json::Value::Object(map),
        _ => serde_json::json!({}),
    };
    let root = settings
        .as_object_mut()
        .expect("settings was just normalized into an object");
    let global = root
        .entry("globalSettings")
        .or_insert_with(|| serde_json::json!({}));
    if !global.is_object() {
        *global = serde_json::json!({});
    }
    global
        .as_object_mut()
        .expect("global was just normalized into an object")
        .insert("windowBounds".to_string(), bounds);
    settings
}

#[cfg(desktop)]
fn save_window_bounds(window: &tauri::Window) {
    let Ok(pos) = window.outer_position() else {
        return;
    };
    let Ok(size) = window.outer_size() else {
        return;
    };
    let Ok(store) = window.app_handle().store("settings.json") else {
        return;
    };
    let settings = store
        .get("appSettings")
        .unwrap_or_else(|| serde_json::json!({}));
    let bounds = serde_json::json!({
        "x": pos.x as f64,
        "y": pos.y as f64,
        "width": size.width as f64,
        "height": size.height as f64,
    });
    let value = merge_window_bounds(settings, bounds);
    store.set("appSettings", value);
    if let Err(e) =
        crate::commands::settings_file::save_store_atomically(window.app_handle(), &store)
    {
        log::error!("failed to save window bounds: {e}");
    }
}

/// opener プラグインの自動クリックスクリプト（全フレームで target=_blank を IPC に変換する）を有効にするか。
///
/// デスクトップでは別オリジン iframe から IPC が ACL 拒否され既定動作だけ潰れるため無効にし、
/// 新規ウィンドウ要求を `on_new_window` で処理する。mobile は従来どおり有効。
fn opener_js_links_on_click() -> bool {
    cfg!(mobile)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(all(desktop, target_os = "linux"))]
    linux_codec_env::ensure_openh264_ld_library_path();

    let builder = tauri::Builder::default()
        .plugin(
            tauri_plugin_opener::Builder::new()
                .open_js_links_on_click(opener_js_links_on_click())
                .build(),
        )
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::Stdout,
                ))
                .level(if cfg!(debug_assertions) {
                    log::LevelFilter::Debug
                } else {
                    log::LevelFilter::Warn
                })
                .build(),
        )
        .manage(AppState::new())
        .setup(|app| {
            // 設定ファイルの検査・復旧は、プラグインが読み込み失敗を握りつぶす前（ストア生成前）に行う。
            let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
            let unix_secs = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let recovery =
                crate::commands::settings_file::recover_settings_file(&data_dir, unix_secs);
            app.manage(crate::commands::settings_file::SettingsRecoveryState(
                std::sync::Mutex::new(Some(recovery)),
            ));
            // 自動保存を無効にしたストアを先に登録する（以降の app.store("settings.json") はこれを返す）。
            // 自動保存が生きているとアトミック書き込みをすり抜けるため必須。
            tauri_plugin_store::StoreBuilder::new(app, "settings.json")
                .disable_auto_save()
                .build()
                .map_err(|e| e.to_string())?;
            #[cfg(desktop)]
            {
                use crate::commands::settings::AppSettingsData;
                let store = app.store("settings.json").map_err(|e| e.to_string())?;
                if let Some(settings) = store
                    .get("appSettings")
                    .and_then(|v| serde_json::from_value::<AppSettingsData>(v).ok())
                {
                    let wb = &settings.global_settings.window_bounds;
                    if let Some(window) = app.get_webview_window(crate::ipc_constants::labels::MAIN)
                    {
                        let monitors = window.available_monitors().unwrap_or_default();
                        let min_visible = 100.0_f64;
                        let on_screen = monitors.iter().any(|m| {
                            let pos = m.position();
                            let size = m.size();
                            let mx = pos.x as f64;
                            let my = pos.y as f64;
                            let mw = size.width as f64;
                            let mh = size.height as f64;
                            wb.x + min_visible > mx
                                && wb.x < mx + mw
                                && wb.y + min_visible > my
                                && wb.y < my + mh
                        });
                        if on_screen {
                            let _ = window
                                .set_position(PhysicalPosition::new(wb.x as i32, wb.y as i32));
                        }
                        let clamped_w = wb.width.max(600.0) as u32;
                        let clamped_h = wb.height.max(400.0) as u32;
                        let _ = window.set_size(PhysicalSize::new(clamped_w, clamped_h));
                    }
                }
            }
            #[cfg(target_os = "android")]
            crate::android_bridge::store_app_handle(app.handle().clone());
            Ok(())
        });

    // デスクトップのみ自動更新・再起動プラグインを登録する。
    // Android は APK 自己更新を別実装するため登録しない。
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init());

    #[cfg(desktop)]
    let builder = builder.on_window_event(|window, event| {
        if let tauri::WindowEvent::CloseRequested { .. } = event {
            if window.label() == crate::ipc_constants::labels::MAIN {
                save_window_bounds(window);

                use crate::ipc_constants::labels;

                // アプリ終了処理に入る前に、公式設定ポップアップの追跡を止める。
                // 終了時にポップアップが道連れで閉じられても OFFICIAL_SETTINGS_POPUP_CLOSED を
                // 誤って emit させないため。
                {
                    let state = window.app_handle().state::<AppState>();
                    *state
                        .official_settings_popup_label
                        .lock()
                        .expect("official_settings_popup_label mutex poisoned") = None;
                }

                // 常駐コンポーズは CloseRequested を prevent_close + hide で握るため、
                // close() では閉じられず非表示のまま残ってアプリ終了を妨げる。destroy() で明示破棄する。
                // （全デスクトップ OS 共通）
                let app = window.app_handle();
                for (label, ww) in app.webview_windows() {
                    if label.starts_with(labels::COMPOSE_PREFIX) {
                        let _ = ww.destroy();
                    }
                }

                // Linux ではカラム/ポップアップ WebView が独立ウィンドウのため明示的に閉じる。
                // 他の OS では子 WebView として管理されるため不要。
                #[cfg(target_os = "linux")]
                {
                    let app = window.app_handle();
                    for (label, ww) in app.webview_windows() {
                        if label.starts_with(labels::COLUMN_PREFIX)
                            || label.starts_with(labels::POPUP_PREFIX)
                        {
                            let _ = ww.close();
                        }
                    }
                }
            } else if window
                .label()
                .starts_with(crate::ipc_constants::labels::POPUP_PREFIX)
            {
                // 公式設定ポップアップが実際に閉じられた（アカウント切替による内部的な閉じ直しではない）
                // ことを検出し、追跡中のラベルと一致すれば OFFICIAL_SETTINGS_POPUP_CLOSED を emit する。
                crate::commands::webview::handle_popup_closed(window.app_handle(), window.label());
            }
        }
    });

    builder
        .invoke_handler(tauri::generate_handler![
            commands::settings::load_settings,
            commands::settings::save_settings,
            commands::backup::export_backup,
            commands::backup::read_backup,
            commands::backup::apply_restore,
            commands::webview::create_column_webview,
            commands::webview::get_external_column_data_directory,
            commands::webview::delete_external_column_data,
            commands::webview::remove_column_webview,
            commands::webview::resize_column_webview,
            commands::webview::open_popup_window,
            commands::webview::open_link_popup_window,
            commands::webview::close_popup_window,
            commands::webview::switch_popup_session,
            commands::webview::eval_in_webview,
            commands::webview::report_webview_scroll,
            commands::webview::report_new_posts_count,
            commands::webview::report_official_settings,
            commands::webview::report_api_rate_limit,
            commands::webview::report_keyboard_shortcut,
            commands::webview::get_mobile_insets,
            commands::webview::set_column_cookies,
            commands::webview::is_webview_profile_supported,
            commands::webview::update_mobile_swipe_bar,
            commands::webview::flash_mobile_swipe_bar,
            commands::account::open_add_account_window,
            commands::account::reauth_account_window,
            commands::account::delete_account_data,
            commands::account::close_window,
            commands::account::detect_account_user_ids,
            commands::webview::open_compose_window,
            commands::update::install_apk_update,
            commands::media_codec::check_media_codec_support,
            #[cfg(all(desktop, target_os = "linux"))]
            commands::openh264_fetch::download_and_enable_h264,
            #[cfg(desktop)]
            commands::video_download::download_video,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(all(test, desktop))]
mod tests {
    use super::*;

    fn sample_bounds() -> serde_json::Value {
        serde_json::json!({
            "x": 10.0,
            "y": 20.0,
            "width": 800.0,
            "height": 600.0,
        })
    }

    #[test]
    fn globalsettingsの他フィールドを保持したままwindowboundsだけ更新する() {
        let settings = serde_json::json!({
            "accounts": [],
            "columns": [],
            "globalSettings": {
                "customCSS": "body { color: red; }",
                "ngWords": ["spam", "ad"],
                "windowBounds": { "x": 0.0, "y": 0.0, "width": 1400.0, "height": 900.0 },
            },
        });

        let merged = merge_window_bounds(settings, sample_bounds());

        assert_eq!(
            merged["globalSettings"]["customCSS"],
            "body { color: red; }"
        );
        assert_eq!(
            merged["globalSettings"]["ngWords"],
            serde_json::json!(["spam", "ad"])
        );
        assert_eq!(merged["globalSettings"]["windowBounds"], sample_bounds());
    }

    #[test]
    fn columnsとaccountsは変更前のまま保持される() {
        let settings = serde_json::json!({
            "accounts": [{ "id": "acc1", "dataDirectory": "dir1" }],
            "columns": [{ "id": "col1", "gridRow": 0, "gridCol": 0 }],
            "globalSettings": {},
        });

        let merged = merge_window_bounds(settings.clone(), sample_bounds());

        assert_eq!(merged["accounts"], settings["accounts"]);
        assert_eq!(merged["columns"], settings["columns"]);
    }

    #[test]
    fn globalsettingsキーが存在しない空オブジェクトでもwindowboundsが追加される() {
        let settings = serde_json::json!({});

        let merged = merge_window_bounds(settings, sample_bounds());

        assert_eq!(merged["globalSettings"]["windowBounds"], sample_bounds());
    }

    #[test]
    fn settingsがオブジェクトでない場合でもpanicせずwindowboundsを含む構造が返る() {
        let merged_from_null = merge_window_bounds(serde_json::Value::Null, sample_bounds());
        assert_eq!(
            merged_from_null["globalSettings"]["windowBounds"],
            sample_bounds()
        );

        let merged_from_array = merge_window_bounds(serde_json::json!([1, 2, 3]), sample_bounds());
        assert_eq!(
            merged_from_array["globalSettings"]["windowBounds"],
            sample_bounds()
        );
    }
}

#[cfg(test)]
mod opener_tests {
    use super::*;

    #[cfg(desktop)]
    #[test]
    fn デスクトップではopenerの自動クリックスクリプトが無効() {
        assert!(!opener_js_links_on_click());
    }

    #[cfg(mobile)]
    #[test]
    fn モバイルではopenerの自動クリックスクリプトが有効() {
        assert!(opener_js_links_on_click());
    }

    #[test]
    fn openerプラグインは自動クリックスクリプトの有無を明示して登録されている() {
        let src = include_str!("lib.rs");
        // テストモジュール以降（このテスト自身の文字列リテラルを含む）は照合対象外にする
        let body = src
            .split("#[cfg(all(test, desktop))]")
            .next()
            .expect("split は必ず1要素以上を返す");
        let code: String = body
            .lines()
            .filter(|line| !line.trim_start().starts_with("//"))
            .collect::<Vec<_>>()
            .join("\n");

        assert!(
            code.contains("tauri_plugin_opener::Builder::new()"),
            "opener は Builder 経由で登録されていない"
        );
        assert!(
            code.contains(".open_js_links_on_click(opener_js_links_on_click())"),
            "opener の自動クリックスクリプトの有無が判定関数で指定されていない"
        );
        assert!(
            !code.contains("tauri_plugin_opener::init()"),
            "opener が init() で直接登録されている（自動クリックスクリプトが常に有効になる）"
        );
    }
}
