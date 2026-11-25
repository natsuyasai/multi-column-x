mod acl_contract;
#[cfg(target_os = "android")]
mod android_bridge;
mod commands;
mod http_tls;
mod inject;
mod ipc_constants;
#[cfg(all(desktop, target_os = "linux"))]
mod linux_codec_env;
#[cfg(test)]
mod log_language_contract;
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

/// 終了時に保存するウィンドウ領域を決める純粋関数。
///
/// - 位置は枠を含むウィンドウ左上（`outer_position`）。`set_position` が外側左上基準のため。
/// - サイズは枠を含まない内側（`inner_size`）。`set_size` が内側（クライアント領域）サイズを
///   設定するため、枠込みの値を保存すると復元のたびに枠分だけ大きくなる。
/// - 最小化中は座標が画面外（Windows では -32000 付近）・サイズが極小になるため `None`
///   （保存せず前回の保存値を維持する）。
#[cfg(desktop)]
fn window_bounds_to_save(
    outer_position: (i32, i32),
    inner_size: (u32, u32),
    is_minimized: bool,
) -> Option<serde_json::Value> {
    if is_minimized {
        return None;
    }
    Some(serde_json::json!({
        "x": outer_position.0 as f64,
        "y": outer_position.1 as f64,
        "width": inner_size.0 as f64,
        "height": inner_size.1 as f64,
    }))
}

/// メインウィンドウを閉じるときに、他ウィンドウをどう片付けるかの計画。
#[cfg(desktop)]
#[derive(Debug, PartialEq, Eq, Default)]
struct WindowsToCloseOnMainExit {
    /// `destroy()` で確実に破棄するもの（`prevent_close` で `close()` が効かない常駐ウィンドウ）。
    destroy: Vec<String>,
    /// `close()` で閉じるもの。
    close: Vec<String>,
}

/// メイン終了時の後始末対象をラベルから決める純粋関数。
///
/// - コンポーズ(`compose-`): 全 OS で destroy（常駐のため close() が効かない）
/// - ポップアップ(`popup-`): 全デスクトップ OS で close（独立 WebviewWindow）
/// - カラム(`column-`): Linux のみ close（Windows/macOS は親ウィンドウの子 WebView）
/// - それ以外（`main` / `add-account-` / `extension-` 等）は対象外
#[cfg(desktop)]
fn windows_to_close_on_main_exit<'a>(
    labels: impl IntoIterator<Item = &'a str>,
    is_linux: bool,
) -> WindowsToCloseOnMainExit {
    use crate::ipc_constants::labels as prefix;

    let mut plan = WindowsToCloseOnMainExit::default();
    for label in labels {
        if label.starts_with(prefix::COMPOSE_PREFIX) {
            plan.destroy.push(label.to_string());
        } else if label.starts_with(prefix::POPUP_PREFIX)
            || (is_linux && label.starts_with(prefix::COLUMN_PREFIX))
        {
            plan.close.push(label.to_string());
        }
    }
    plan
}

/// 保存済みサイズから復元時に `set_size` へ渡す内側サイズを求める純粋関数（最小 600x400 にクランプ）。
#[cfg(desktop)]
fn restored_inner_size(width: f64, height: f64) -> (u32, u32) {
    (width.max(600.0) as u32, height.max(400.0) as u32)
}

#[cfg(desktop)]
fn save_window_bounds(window: &tauri::Window) {
    let Ok(pos) = window.outer_position() else {
        return;
    };
    let Ok(size) = window.inner_size() else {
        return;
    };
    // 取得失敗は「最小化ではない」扱いにする（保存を止めて古い値が残り続けるより安全）
    let minimized = window.is_minimized().unwrap_or(false);
    let Some(bounds) = window_bounds_to_save((pos.x, pos.y), (size.width, size.height), minimized)
    else {
        return;
    };
    let Ok(store) = window.app_handle().store("settings.json") else {
        return;
    };
    let settings = store
        .get("appSettings")
        .unwrap_or_else(|| serde_json::json!({}));
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
    #[cfg(all(desktop, target_os = "linux"))]
    linux_codec_env::configure_gstreamer_env();

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
                        let (clamped_w, clamped_h) = restored_inner_size(wb.width, wb.height);
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
        .plugin(tauri_plugin_dialog::init());

    #[cfg(desktop)]
    let builder = builder.on_window_event(|window, event| {
        if let tauri::WindowEvent::CloseRequested { .. } = event {
            if window.label() == crate::ipc_constants::labels::MAIN {
                save_window_bounds(window);

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

                // 閉じる対象のウィンドウは純粋関数で選定する。
                // - 常駐コンポーズは CloseRequested を prevent_close + hide で握るため close() では
                //   閉じられず、非表示のまま残ってアプリ終了を妨げる。destroy() で明示破棄する（全 OS）。
                // - ポップアップは全デスクトップ OS で独立ウィンドウのため close() で閉じる。
                // - カラムは Linux のみ独立ウィンドウ（Windows/macOS は子 WebView）のため Linux だけ close する。
                let app = window.app_handle();
                let all_labels: Vec<String> = app.webview_windows().keys().cloned().collect();
                let plan = windows_to_close_on_main_exit(
                    all_labels.iter().map(String::as_str),
                    cfg!(target_os = "linux"),
                );
                for label in &plan.destroy {
                    if let Some(ww) = app.get_webview_window(label) {
                        let _ = ww.destroy();
                    }
                }
                for label in &plan.close {
                    if let Some(ww) = app.get_webview_window(label) {
                        let _ = ww.close();
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

    // 再起動計画の置き場（`relaunch_app` が書き、`RunEvent::Exit` で取り出す）。
    #[cfg(desktop)]
    let builder = builder.manage(commands::relaunch::PendingRelaunch::default());

    let app = builder
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
            commands::webview::set_mobile_media_popup_active,
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
            commands::relaunch::relaunch_app,
            #[cfg(desktop)]
            commands::video_download::download_video,
            commands::extensions::list_extensions,
            commands::extensions::detect_chrome_extensions,
            commands::extensions::pick_extension_folder,
            commands::extensions::add_extension_from_folder,
            commands::extensions::add_chrome_extension,
            commands::extensions::set_extension_enabled,
            commands::extensions::remove_extension,
            commands::extensions::open_extension_page,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        // 再起動計画があれば、イベントループ終了後（全ウィンドウ破棄後）に新プロセスを起動する。
        #[cfg(desktop)]
        if commands::relaunch::should_spawn_on(&event) {
            commands::relaunch::spawn_pending_relaunch(app_handle);
        }
        #[cfg(not(desktop))]
        let _ = (app_handle, event);
    });
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

    #[test]
    fn 終了時の保存サイズは枠を含まない内側サイズになる() {
        // 外側 1957x1375 / 内側 1941x1336 のウィンドウでは内側を保存する
        let bounds = window_bounds_to_save((100, 50), (1941, 1336), false)
            .expect("通常状態では保存対象になる");

        assert_eq!(bounds["width"], 1941.0);
        assert_eq!(bounds["height"], 1336.0);
        assert_ne!(bounds["width"], 1957.0);
        assert_ne!(bounds["height"], 1375.0);
    }

    #[test]
    fn 終了時の保存位置は外側左上の座標になる() {
        let bounds = window_bounds_to_save((100, 50), (1941, 1336), false)
            .expect("通常状態では保存対象になる");

        assert_eq!(bounds["x"], 100.0);
        assert_eq!(bounds["y"], 50.0);
    }

    #[test]
    fn 最小化中は保存対象がなくnoneになる() {
        assert!(window_bounds_to_save((100, 50), (1941, 1336), true).is_none());
        // Windows の最小化中は位置が画面外・サイズが極小になる
        assert!(window_bounds_to_save((-32000, -32000), (160, 28), true).is_none());
    }

    #[test]
    fn 保存されたサイズで復元した内側サイズは保存値と一致する() {
        assert_eq!(restored_inner_size(1941.0, 1336.0), (1941, 1336));
    }

    #[test]
    fn 保存した領域を復元してもサイズが変化しない() {
        let bounds = window_bounds_to_save((100, 50), (1941, 1336), false)
            .expect("通常状態では保存対象になる");
        let width = bounds["width"].as_f64().expect("width は数値");
        let height = bounds["height"].as_f64().expect("height は数値");

        // 保存 → 復元を繰り返しても増えない
        let mut size = restored_inner_size(width, height);
        for _ in 0..3 {
            let saved = window_bounds_to_save((100, 50), size, false).expect("保存対象になる");
            size = restored_inner_size(
                saved["width"].as_f64().expect("width は数値"),
                saved["height"].as_f64().expect("height は数値"),
            );
        }
        assert_eq!(size, (1941, 1336));
    }

    #[test]
    fn 復元サイズは最小600x400にクランプされる() {
        assert_eq!(restored_inner_size(100.0, 100.0), (600, 400));
        assert_eq!(restored_inner_size(600.0, 400.0), (600, 400));
        assert_eq!(restored_inner_size(599.0, 399.0), (600, 400));
        assert_eq!(restored_inner_size(601.0, 401.0), (601, 401));
    }

    fn strs(v: &[String]) -> Vec<&str> {
        v.iter().map(String::as_str).collect()
    }

    #[test]
    fn メイン終了時はポップアップをすべてclose対象にしコンポーズはdestroy対象にする() {
        let labels = ["main", "popup-1", "popup-2", "compose-1"];
        for is_linux in [false, true] {
            let plan = windows_to_close_on_main_exit(labels, is_linux);
            assert_eq!(strs(&plan.close), vec!["popup-1", "popup-2"]);
            assert_eq!(strs(&plan.destroy), vec!["compose-1"]);
        }

        let plan = windows_to_close_on_main_exit(["main", "popup-1", "column-1"], false);
        assert_eq!(strs(&plan.close), vec!["popup-1"]);
    }

    #[test]
    fn メイン終了時はアカウント追加ウィンドウをポップアップ扱いにしない() {
        use crate::ipc_constants::labels;
        let add_account = format!("{}01234567", labels::ADD_ACCOUNT_PREFIX);
        let extension = format!("{}abc", labels::EXTENSION_PREFIX);
        for is_linux in [false, true] {
            let plan = windows_to_close_on_main_exit(
                ["main", add_account.as_str(), extension.as_str()],
                is_linux,
            );
            assert_eq!(plan, WindowsToCloseOnMainExit::default());
        }
    }

    #[test]
    fn メイン終了時にウィンドウが無ければ空の計画になる() {
        let plan = windows_to_close_on_main_exit(std::iter::empty::<&str>(), true);
        assert_eq!(plan, WindowsToCloseOnMainExit::default());
    }

    #[test]
    fn linuxではカラムもclose対象になる() {
        let plan = windows_to_close_on_main_exit(["column-1", "popup-1"], true);
        assert_eq!(strs(&plan.close), vec!["column-1", "popup-1"]);

        let plan = windows_to_close_on_main_exit(["column-1", "popup-1"], false);
        assert_eq!(strs(&plan.close), vec!["popup-1"]);
    }

    #[test]
    fn メイン終了時は追跡解除をウィンドウ後始末より先に行う() {
        // 追跡が None なら公式設定ポップアップの閉鎖通知は出ない（popup.rs の
        // is_tracked_popup 系テストが担保）。そのためポップアップを閉じる前に必ず解除する。
        let code = production_code();
        let start = code
            .find("labels::MAIN {")
            .expect("メイン分岐が見つからない");
        let rest = &code[start..];
        let end = rest
            .find("} else if")
            .expect("メイン分岐の終端が見つからない");
        let body = &rest[..end];

        let untrack = body
            .find("official_settings_popup_label")
            .expect("追跡解除が見つからない");
        let none_assign = untrack
            + body[untrack..]
                .find("= None")
                .expect("追跡解除の None 代入が見つからない");
        let plan_pos = body
            .find("windows_to_close_on_main_exit(")
            .expect("後始末対象の選定が純粋関数を経由していない");
        let windows_pos = body
            .find("webview_windows()")
            .expect("webview_windows が見つからない");
        assert!(
            none_assign < plan_pos,
            "追跡解除が後始末の選定より後ろにある"
        );
        assert!(
            untrack < windows_pos,
            "追跡解除が webview_windows より後ろにある"
        );
    }

    /// 本番コード部分（テストモジュール以降を除き、`//` 行を除いたもの）を返す。
    fn production_code() -> String {
        include_str!("lib.rs")
            .split("#[cfg(all(test, desktop))]")
            .next()
            .expect("split は必ず1要素以上を返す")
            .lines()
            .filter(|line| !line.trim_start().starts_with("//"))
            .collect::<Vec<_>>()
            .join("\n")
    }

    #[test]
    fn save_window_bounds関数は内側サイズを取得し外側サイズを保存に使わない() {
        let code = production_code();
        let start = code
            .find("fn save_window_bounds")
            .expect("save_window_bounds が見つからない");
        let rest = &code[start..];
        let end = rest.find("\nfn ").unwrap_or(rest.len());
        let body = &rest[..end];

        assert!(body.contains("inner_size()"), "内側サイズを取得していない");
        assert!(
            !body.contains("outer_size()"),
            "外側サイズを取得している（復元のたびに枠分大きくなる）"
        );
        assert!(
            body.contains("outer_position()"),
            "外側位置を取得していない"
        );
        assert!(
            body.contains("window_bounds_to_save("),
            "保存値の決定が純粋関数を経由していない"
        );
        assert!(
            body.contains("is_minimized()"),
            "最小化状態を確認していない"
        );
    }

    #[test]
    fn 復元処理は内側サイズ計算関数を経由して設定する() {
        let code = production_code();

        assert!(
            code.contains("restored_inner_size(wb.width, wb.height)"),
            "復元サイズが純粋関数を経由していない"
        );
        assert!(
            !code.contains("wb.width.max(600.0)"),
            "復元サイズのクランプが直書きされている"
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
