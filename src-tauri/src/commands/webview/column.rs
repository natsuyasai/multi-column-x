//! カラム WebView の作成・削除・リサイズ・Cookie 切替。
#[cfg(desktop)]
use super::parse_url;
use crate::commands::settings::ColumnData;
use crate::commands::settings_store::{
    load_api_rate_limit_monitor_enabled, load_global_ng_words, load_hide_ad_enabled,
    load_image_popup_enabled, load_video_auto_play_stop_enabled, load_video_popup_enabled,
};
use crate::inject::{build_init_script, InitScriptParams};
#[cfg(any(target_os = "linux", windows))]
use crate::ipc_constants::events;
use crate::ipc_constants::labels;
use crate::state::AppState;
#[cfg(desktop)]
use std::path::PathBuf;
#[cfg(any(target_os = "linux", windows))]
use tauri::Emitter;
#[cfg(all(desktop, not(target_os = "linux")))]
use tauri::WebviewBuilder;
use tauri::{AppHandle, Manager};
#[cfg(desktop)]
use tauri::{LogicalPosition, LogicalSize, WebviewUrl};

fn webview_label(column_id: &str) -> String {
    format!("{}{}", labels::COLUMN_PREFIX, column_id)
}

fn resolve_url(column: &ColumnData) -> String {
    match column.page_type.as_str() {
        "home" => match column.home_tab_name.as_deref().filter(|s| !s.is_empty()) {
            Some(tab) => format!("https://x.com/home?{}", urlencoding::encode(tab)),
            None => "https://x.com/home".to_string(),
        },
        "notifications" => "https://x.com/notifications".to_string(),
        "search" => format!(
            "https://x.com/search?q={}",
            urlencoding::encode(column.search_query.as_deref().unwrap_or(""))
        ),
        "list" => format!(
            "https://x.com/i/lists/{}",
            column.list_id.as_deref().unwrap_or("")
        ),
        "custom" => column
            .custom_url
            .clone()
            .unwrap_or_else(|| "https://x.com/home".to_string()),
        // external カラムはアカウント非依存・X非依存の任意サイト表示が目的のため、
        // custom_url 未指定時のフォールバックも X関連URLにせず about:blank にする。
        "external" => column
            .custom_url
            .clone()
            .unwrap_or_else(|| "about:blank".to_string()),
        // 投稿カラムは /home を表示し、inject(compose_only) でインライン投稿フォーム以外を隠す。
        // /compose/post は投稿完了時に遷移が発生しロック方式が破綻するため使わない。
        "compose" => "https://x.com/home".to_string(),
        _ => "https://x.com/home".to_string(),
    }
}

#[derive(serde::Deserialize)]
pub struct CreateWebviewArgs {
    pub column: ColumnData,
    #[serde(rename = "dataDirectory")]
    pub data_directory: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// 投稿専用カラム（page_type == "compose"）ではインライン投稿フォームが本体機能のため、
/// ユーザーが `hideTweetInputEnabled` を true にしていても投稿欄を隠さない（常に false 扱い）。
/// それ以外のカラム種別では設定値をそのまま反映する。
fn effective_hide_tweet_input_enabled(column: &ColumnData) -> bool {
    if column.page_type == "compose" {
        false
    } else {
        column.settings.hide_tweet_input_enabled
    }
}

/// カラム WebView に注入する init script を、設定ストアの読み出しを含めて構築する。
/// desktop / mobile 双方の `create_column_webview` から呼ばれ、挙動差分は `is_mobile` のみ。
fn build_column_init_script(app: &AppHandle, column: &ColumnData, is_mobile: bool) -> String {
    let video_auto_play_stop_enabled = load_video_auto_play_stop_enabled(app);
    let hide_ad_enabled = load_hide_ad_enabled(app);
    let api_rate_limit_monitor_enabled = load_api_rate_limit_monitor_enabled(app);
    let image_popup_enabled = load_image_popup_enabled(app);
    let video_popup_enabled = load_video_popup_enabled(app);
    let global_ng_words = load_global_ng_words(app);
    build_init_script(&InitScriptParams {
        is_mobile,
        hide_header_enabled: column.settings.hide_header_enabled,
        hide_tweet_input_enabled: effective_hide_tweet_input_enabled(column),
        show_custom_menu: column.settings.show_custom_menu,
        scroll_pos_restore_enabled: column.settings.scroll_pos_restore_enabled,
        video_auto_play_stop_enabled,
        small_image_enabled: column.settings.small_image_enabled,
        small_image_width: &column.settings.small_image_width,
        blur_image_enabled: column.settings.blur_image_enabled,
        blur_image_amount: &column.settings.blur_image_amount,
        hide_ad_enabled,
        api_rate_limit_monitor_enabled,
        image_popup_enabled,
        video_popup_enabled,
        custom_css: &column.settings.custom_css,
        visible_links: &column.settings.visible_links,
        ng_words: &column.settings.ng_words,
        global_ng_words: &global_ng_words,
        whitelist_enabled: column.settings.whitelist_enabled,
        whitelist_words: &column.settings.whitelist_words,
        // 投稿カラム（/home 表示）ではインライン投稿フォーム以外を隠す。
        compose_only_enabled: column.page_type == "compose",
        minimal_injection: column.page_type == "external",
    })
}

/// column_id がファイルパスとして安全か（パス区切り文字・親ディレクトリ参照を含まないか）を判定する。
/// IPC 経由で任意の文字列を受け取る `column_id` に対するパストラバーサル対策の純粋関数部分。
fn is_safe_column_id(column_id: &str) -> bool {
    !column_id.is_empty()
        && !column_id.contains('/')
        && !column_id.contains('\\')
        && !column_id.contains("..")
}

/// external カラム（アカウント非依存の任意URLカラム）専用のデータディレクトリを解決する。
/// カラムIDごとに固有のディレクトリを作成し、WebView のセッション（Cookie等）を
/// 他のカラム・アカウントと完全に分離する。
/// column_id は IPC 経由で任意の文字列を受け取るため、パストラバーサル対策として
/// パス区切り文字・親ディレクトリ参照を含む値は拒否する。
#[tauri::command]
pub async fn get_external_column_data_directory(
    app: AppHandle,
    column_id: String,
) -> Result<String, String> {
    if !is_safe_column_id(&column_id) {
        return Err("invalid column id".to_string());
    }
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let data_dir = app_data
        .join("external_columns")
        .join(format!("column-{column_id}"));
    std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    Ok(data_dir.to_string_lossy().to_string())
}

#[cfg(desktop)]
#[tauri::command]
pub async fn create_column_webview(app: AppHandle, args: CreateWebviewArgs) -> Result<(), String> {
    let url = resolve_url(&args.column);
    let label = webview_label(&args.column.id);
    let data_dir = PathBuf::from(&args.data_directory);

    let init_script = build_column_init_script(&app, &args.column, false);

    // parent() は &WebviewWindow を要求するため、Linux では get_webview_window を使う。
    // 非Linux の場合は一般の Window を取得して add_child を呼び出す。
    #[cfg(target_os = "linux")]
    let window = app
        .get_webview_window(labels::MAIN)
        .ok_or("main window not found")?;
    #[cfg(not(target_os = "linux"))]
    let window = app
        .get_window(labels::MAIN)
        .ok_or("main window not found")?;

    // On Linux, window.add_child() places WebViews into a GTK VBox which ignores
    // position/size parameters. Instead, create an undecorated WebviewWindow at the
    // correct screen coordinates (main window inner position + column logical offset).
    #[cfg(target_os = "linux")]
    {
        let scale = window.scale_factor().unwrap_or(1.0);
        let inner_pos = window.inner_position().map_err(|e| e.to_string())?;
        let screen_x = inner_pos.x as f64 / scale + args.x;
        let screen_y = inner_pos.y as f64 / scale + args.y;
        // visible(false) で非表示のまま作成し、起動完了後の recalculateAllBounds で
        // 正しい座標に配置してから表示する。WM がウィンドウ位置を確定する前に
        // 誤った座標で可視化され WebKit WebProcess が不正状態で起動するのを防ぐ
        // （空白カラム対策）。parent() の transient-for で常にメインより前面に維持する。
        let webview_window =
            tauri::WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(parse_url(&url)?))
                .initialization_script(&init_script)
                .data_directory(data_dir)
                .decorations(false)
                .skip_taskbar(true)
                .visible(false)
                .position(screen_x, screen_y)
                .inner_size(args.width.max(1.0), args.height.max(1.0))
                .parent(&window)
                .map_err(|e| e.to_string())?
                .build()
                .map_err(|e| e.to_string())?;

        // WebKitGTK の WebProcess がクラッシュ（白画面/フリーズ）したら検知して
        // フロントへ通知する。TS 側が当該カラムの WebView を再生成して復旧する。
        let crash_app = app.clone();
        let crash_column_id = args.column.id.clone();
        // カラム WebView が OS フォーカスを得たら column-webview-focused を emit する。
        // TS 側はこれを listen して、フォーカスが当たったカラムの未読バッジを自動的に消す。
        let focus_app = app.clone();
        let focus_column_id = args.column.id.clone();
        let _ = webview_window.with_webview(move |platform_webview| {
            use gtk::prelude::WidgetExt;
            use webkit2gtk::WebViewExt;
            let webview = platform_webview.inner();
            webview.connect_web_process_terminated(move |_webview, _reason| {
                let _ = crash_app.emit(events::COLUMN_WEBVIEW_CRASHED, &crash_column_id);
            });
            webview.connect_focus_in_event(move |_widget, _event| {
                let _ = focus_app.emit(events::COLUMN_WEBVIEW_FOCUSED, &focus_column_id);
                gtk::glib::Propagation::Proceed
            });
        });
    }

    #[cfg(not(target_os = "linux"))]
    let child_webview = window
        .add_child(
            WebviewBuilder::new(&label, WebviewUrl::External(parse_url(&url)?))
                .initialization_script(&init_script)
                .data_directory(data_dir),
            LogicalPosition::new(args.x, args.y),
            LogicalSize::new(args.width, args.height),
        )
        .map_err(|e| e.to_string())?;

    // Windows: カラム WebView が OS フォーカスを得たら column-webview-focused を emit する。
    // TS 側はこれを listen して、フォーカスが当たったカラムの未読バッジを自動的に消す。
    #[cfg(windows)]
    {
        let focus_app = app.clone();
        let focus_column_id = args.column.id.clone();
        let _ = child_webview.with_webview(move |platform_webview| {
            let controller = platform_webview.controller();
            let mut token: i64 = 0;
            let handler =
                webview2_com::FocusChangedEventHandler::create(Box::new(move |_sender, _args| {
                    let _ = focus_app.emit(events::COLUMN_WEBVIEW_FOCUSED, &focus_column_id);
                    Ok(())
                }));
            unsafe {
                let _ = controller.add_GotFocus(&handler, &mut token);
            }
        });
    }

    let state = app.state::<AppState>();
    let mut registry = state.registry.lock().expect("registry mutex poisoned");
    registry.register(
        label,
        args.column.id.clone(),
        args.column.account_id.clone(),
        args.data_directory.clone(),
    );

    Ok(())
}

#[cfg(mobile)]
#[tauri::command]
pub async fn create_column_webview(app: AppHandle, args: CreateWebviewArgs) -> Result<(), String> {
    let url = resolve_url(&args.column);
    let label = webview_label(&args.column.id);

    let init_script = build_column_init_script(&app, &args.column, true);

    // Android では Tauri WebviewWindowBuilder を使わず、
    // ネイティブ Android WebView を content FrameLayout のオーバーレイとして追加する。
    // これにより setContentView によるメイン WebView の上書きを回避し、
    // React MobileTabBar が画面下部に常時表示される。
    #[cfg(target_os = "android")]
    {
        let visible = args.x >= 0.0;
        crate::android_bridge::create_column_webview(
            &label,
            &url,
            args.width as i32,
            args.height as i32,
            &init_script,
            visible,
            &args.column.account_id,
        )?;
    }

    let state = app.state::<AppState>();
    let mut registry = state.registry.lock().expect("registry mutex poisoned");
    registry.register(
        label,
        args.column.id.clone(),
        args.column.account_id.clone(),
        args.data_directory.clone(),
    );

    Ok(())
}

#[cfg(desktop)]
#[tauri::command]
pub async fn remove_column_webview(app: AppHandle, column_id: String) -> Result<(), String> {
    let label = webview_label(&column_id);

    // On Linux, column WebViews are WebviewWindows; on other platforms they are child Webviews.
    if let Some(window) = app.get_webview_window(&label) {
        window.close().map_err(|e| e.to_string())?;
    } else if let Some(webview) = app.get_webview(&label) {
        webview.close().map_err(|e| e.to_string())?;
    }

    let state = app.state::<AppState>();
    let mut registry = state.registry.lock().expect("registry mutex poisoned");
    registry.unregister(&label);

    Ok(())
}

#[cfg(mobile)]
#[tauri::command]
pub async fn remove_column_webview(app: AppHandle, column_id: String) -> Result<(), String> {
    let label = webview_label(&column_id);

    #[cfg(target_os = "android")]
    {
        crate::android_bridge::remove_column_webview(&label).ok();
    }

    let state = app.state::<AppState>();
    let mut registry = state.registry.lock().expect("registry mutex poisoned");
    registry.unregister(&label);

    Ok(())
}

/// registry から column- プレフィックスを持つラベルのみを列挙する純粋関数。
fn column_webview_labels(registry: &crate::state::WebviewRegistry) -> Vec<String> {
    registry
        .entries
        .keys()
        .filter(|l| l.starts_with(labels::COLUMN_PREFIX))
        .cloned()
        .collect()
}

#[cfg(desktop)]
#[tauri::command]
pub async fn clear_cache(app: AppHandle) -> Result<(), String> {
    // ロックスコープを明確に分離して早期解放
    let column_labels = {
        let state = app.state::<AppState>();
        let registry = state.registry.lock().expect("registry mutex poisoned");
        column_webview_labels(&registry)
    };

    #[cfg(windows)]
    {
        use windows_core::Interface;

        for label in column_labels {
            if let Some(webview) = app.get_webview(&label) {
                let _ = webview.with_webview(move |platform_webview| {
                    let controller = platform_webview.controller();

                    // ICoreWebView2 を取得
                    let core_webview2 = unsafe { controller.CoreWebView2() }
                        .map_err(|e| log::warn!("Failed to get CoreWebView2 for {}: {:?}", label, e))
                        .ok();

                    if let Some(core_webview2) = core_webview2 {
                        // ICoreWebView2_13 にキャスト（Profile() メソッド取得用）
                        let webview13 = core_webview2
                            .cast::<webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2_13>()
                            .map_err(|e| log::warn!("Failed to cast to ICoreWebView2_13 for {}: {:?}", label, e))
                            .ok();

                        if let Some(webview13) = webview13 {
                            // ICoreWebView2Profile を取得
                            let profile = unsafe { webview13.Profile() }
                                .map_err(|e| log::warn!("Failed to get Profile for {}: {:?}", label, e))
                                .ok();

                            if let Some(profile) = profile {
                                // ICoreWebView2Profile2 にキャスト（ClearBrowsingData メソッド取得用）
                                let profile2 = profile
                                    .cast::<webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Profile2>()
                                    .map_err(|e| log::warn!("Failed to cast to ICoreWebView2Profile2 for {}: {:?}", label, e))
                                    .ok();

                                if let Some(profile2) = profile2 {
                                    // Cookie は削除しない（ログイン情報を保持）。
                                    let kinds = webview2_com::Microsoft::Web::WebView2::Win32::COREWEBVIEW2_BROWSING_DATA_KINDS_DISK_CACHE
                                        | webview2_com::Microsoft::Web::WebView2::Win32::COREWEBVIEW2_BROWSING_DATA_KINDS_CACHE_STORAGE;

                                    let handler = webview2_com::ClearBrowsingDataCompletedHandler::create(
                                        Box::new(|_hresult| Ok(()))
                                    );

                                    unsafe {
                                        let _ = profile2.ClearBrowsingData(kinds, &handler)
                                            .map_err(|e| log::warn!("Failed to clear browsing data for {}: {:?}", label, e));
                                    }
                                }
                            }
                        }
                    }
                });
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        for label in column_labels.clone() {
            if let Some(webview) = app.get_webview(&label) {
                let _ = webview.with_webview(move |platform_webview| {
                    unsafe {
                        use block2::RcBlock;
                        use objc2_foundation::{NSDate, NSSet};
                        use objc2_web_kit::{
                            WKWebView, WKWebsiteDataTypeDiskCache, WKWebsiteDataTypeMemoryCache,
                        };

                        let inner_ptr = platform_webview.inner();
                        let wk_webview: &WKWebView = &*(inner_ptr.cast::<WKWebView>());

                        // WKWebViewConfiguration を取得（Retained<T> を直接束縛）
                        let config = wk_webview.configuration();

                        // WKWebsiteDataStore を取得（Retained<T> を直接束縛）
                        let store = config.websiteDataStore();

                        // キャッシュ型集合を構築（Cookie は除外）
                        // WKWebsiteDataTypeDiskCache と WKWebsiteDataTypeMemoryCache を削除対象にする。
                        // WKWebsiteDataTypeCookies は絶対に含めない（ログイン情報保持要件）。
                        let cache_types = NSSet::from_slice(&[
                            WKWebsiteDataTypeDiskCache,
                            WKWebsiteDataTypeMemoryCache,
                        ]);

                        // 全期間を削除対象にする（1970年0時点を基準日とすることで、それ以降全てを対象にする）
                        let all_time = NSDate::dateWithTimeIntervalSince1970(0.0);

                        // 非同期実行完了ハンドラ（結果待機不要、空クロージャ）
                        let handler = RcBlock::new(|| {});

                        // キャッシュ削除を実行（戻り値 () で成功）
                        store.removeDataOfTypes_modifiedSince_completionHandler(
                            &cache_types,
                            &all_time,
                            &handler,
                        );
                    }
                });
            }
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        #[cfg(target_os = "linux")]
        {
            use webkit2gtk::{WebContextExt, WebViewExt};

            for label in column_labels {
                if let Some(webview_window) = app.get_webview_window(&label) {
                    let _ = webview_window.with_webview(move |platform_webview| {
                        let webview = platform_webview.inner();
                        if let Some(context) = webview.context() {
                            // Cookie（ログインセッション）は削除されない。
                            // webkit_web_context_clear_cache はキャッシュのみを消去し、
                            // Cookie は WebKitCookieManager が別途管理する。
                            context.clear_cache();
                        }
                    });
                } else if let Some(webview) = app.get_webview(&label) {
                    let _ = webview.with_webview(move |platform_webview| {
                        let webview = platform_webview.inner();
                        if let Some(context) = webview.context() {
                            // Cookie（ログインセッション）は削除されない。
                            // webkit_web_context_clear_cache はキャッシュのみを消去し、
                            // Cookie は WebKitCookieManager が別途管理する。
                            context.clear_cache();
                        }
                    });
                }
            }
        }

        #[cfg(not(target_os = "linux"))]
        {
            let _ = column_labels;
            // Windows は上の `#[cfg(windows)]` ブロックで処理済み
        }
    }

    Ok(())
}

#[cfg(mobile)]
#[tauri::command]
pub async fn clear_cache(app: AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    let registry = state.registry.lock().expect("registry mutex poisoned");
    let _labels = column_webview_labels(&registry);

    #[cfg(target_os = "android")]
    {
        crate::android_bridge::clear_all_column_webview_cache()?;
    }

    Ok(())
}

#[derive(serde::Deserialize)]
pub struct ResizeBounds {
    #[serde(rename = "columnId")]
    pub column_id: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[cfg(desktop)]
#[tauri::command]
pub async fn resize_column_webview(app: AppHandle, bounds: ResizeBounds) -> Result<(), String> {
    let label = webview_label(&bounds.column_id);

    // On Linux, column WebViews are undecorated WebviewWindows. Reposition by computing
    // screen coordinates from the main window's current inner position each time,
    // so columns stay in sync even after the main window is moved.
    #[cfg(target_os = "linux")]
    if let Some(webview_window) = app.get_webview_window(&label) {
        let window = app
            .get_window(labels::MAIN)
            .ok_or("main window not found")?;
        let scale = window.scale_factor().unwrap_or(1.0);
        let inner_pos = window.inner_position().map_err(|e| e.to_string())?;
        let inner_size = window.inner_size().map_err(|e| e.to_string())?;
        let win_logical_width = inner_size.width as f64 / scale;

        let screen_y = inner_pos.y as f64 / scale + bounds.y;

        // 幅クリップ（左右対称）: ウィンドウは常に x>=0 に配置し、はみ出し分だけ幅を縮める。
        // Linux WM がウィンドウを画面内にクランプするため負位置クリップ（案A）は使えない。
        // x_offset は常に 0 以上。完全に画面外のときのみ非表示にする。
        match linux_column_layout(bounds.x, bounds.width, win_logical_width) {
            None => {
                let _ = webview_window.hide();
                return Ok(());
            }
            Some((x_offset, vis_width)) => {
                let screen_x = inner_pos.x as f64 / scale + x_offset;
                // show 前に reposition してフラッシュ回避（既存コメント方針を踏襲）
                webview_window
                    .set_position(LogicalPosition::new(screen_x, screen_y))
                    .map_err(|e| e.to_string())?;
                webview_window
                    .set_size(LogicalSize::new(vis_width, bounds.height.max(1.0)))
                    .map_err(|e| e.to_string())?;
                let _ = webview_window.show();
            }
        }
    }

    #[cfg(not(target_os = "linux"))]
    if let Some(webview) = app.get_webview(&label) {
        // Windows / macOS: WebView は親ウィンドウの add_child で配置されるため、
        // 親ウィンドウのクライアント領域でクリップされる。Sidebar は廃止され
        // 横方向 TopBar に置き換わったため、左端クリップは不要。
        webview
            .set_bounds(tauri::Rect {
                position: LogicalPosition::new(bounds.x, bounds.y).into(),
                size: LogicalSize::new(bounds.width.max(1.0), bounds.height.max(1.0)).into(),
            })
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[cfg(mobile)]
#[tauri::command]
pub async fn resize_column_webview(_app: AppHandle, bounds: ResizeBounds) -> Result<(), String> {
    let label = webview_label(&bounds.column_id);

    #[cfg(target_os = "android")]
    {
        if bounds.x >= 0.0 {
            crate::android_bridge::show_column_webview(
                &label,
                bounds.x as i32,
                bounds.y as i32,
                bounds.width as i32,
                bounds.height as i32,
            )
            .ok();
        } else {
            crate::android_bridge::hide_column_webview(&label).ok();
        }
    }

    Ok(())
}

/// アクティブカラムのアカウントに CookieManager を切り替える（Android / Profile API 非対応端末のみ）。
/// setActiveColumn から resize_column_webview より先に呼ばれ、正しいアカウントで WebView が動作する。
#[tauri::command]
pub async fn set_column_cookies(
    #[allow(non_snake_case, unused_variables)] accountId: String,
) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        crate::android_bridge::set_account_cookies(&accountId)?;
    }
    Ok(())
}

/// Linux カラムの表示レイアウトを計算する純粋関数（幅クリップ・左右対称）。
///
/// 戻り値:
/// - `None`               : カラムを hide する（完全に画面外）
/// - `Some((x_offset, vis_width))` : screen_x = inner_pos.x/scale + x_offset で配置し、
///   幅 vis_width で表示する。x_offset は常に 0 以上（負にならない）。
///
/// ウィンドウは常に x>=0 に配置し、はみ出した分だけ幅を縮める（左右対称クリップ）。
/// Linux の WM はウィンドウ X 座標を画面内にクランプするため、負位置クリップ（案A）は使えない。
/// 左端はみ出し時: x_offset=0、vis_width=bounds_x+bounds_width（はみ出した左側分だけ縮む）。
/// 右端はみ出し時: x_offset=bounds_x、vis_width=win_logical_width-bounds_x（幅を縮める）。
#[cfg(target_os = "linux")]
fn linux_column_layout(
    bounds_x: f64,
    bounds_width: f64,
    win_logical_width: f64,
) -> Option<(f64, f64)> {
    // ウィンドウ配置の論理X（常に 0 以上）
    let left = bounds_x.max(0.0);
    // 可視領域の右端を win_logical_width でクリップ
    let right = (bounds_x + bounds_width).min(win_logical_width);
    // 可視幅が 0 以下なら完全に画面外（左または右）
    if right - left <= 0.0 {
        return None;
    }
    // f64 の加算精度で right-left が bounds_width をわずかに超える場合があるため
    // .min(bounds_width) で要求幅を超えないことを厳密に保証する。
    let vis_width = (right - left).min(bounds_width).max(1.0);
    Some((left, vis_width))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::settings::ColumnSettings;

    fn column(page_type: &str) -> ColumnData {
        ColumnData {
            id: "c1".into(),
            account_id: "a1".into(),
            page_type: page_type.into(),
            custom_url: None,
            home_tab_name: None,
            search_query: None,
            list_id: None,
            width: 400.0,
            order: 0,
            label: None,
            settings: serde_json::from_str::<ColumnSettings>(
                r#"{"autoReloadEnabled":true,"autoReloadInterval":600,"hideHeaderEnabled":true,"hideTweetInputEnabled":true,"customCSS":""}"#,
            )
            .unwrap(),
            grid_row: 1,
            grid_col: 1,
            height_mode: "auto".into(),
            height_value: None,
            height_unit: None,
        }
    }

    #[test]
    fn resolve_url_home_without_tab() {
        assert_eq!(resolve_url(&column("home")), "https://x.com/home");
    }

    #[test]
    fn resolve_url_home_with_tab_appends_query() {
        let mut col = column("home");
        col.home_tab_name = Some("フォロー中".into());
        assert!(resolve_url(&col).starts_with("https://x.com/home?"));
    }

    #[test]
    fn resolve_url_notifications() {
        assert_eq!(
            resolve_url(&column("notifications")),
            "https://x.com/notifications"
        );
    }

    #[test]
    fn resolve_url_search_encodes_query() {
        let mut col = column("search");
        col.search_query = Some("rust lang".into());
        assert_eq!(resolve_url(&col), "https://x.com/search?q=rust%20lang");
    }

    #[test]
    fn resolve_url_custom_uses_custom_url() {
        let mut col = column("custom");
        col.custom_url = Some("https://x.com/i/bookmarks".into());
        assert_eq!(resolve_url(&col), "https://x.com/i/bookmarks");
    }

    #[test]
    fn resolve_url_external_uses_custom_url() {
        let mut col = column("external");
        col.custom_url = Some("https://example.com".into());
        assert_eq!(resolve_url(&col), "https://example.com");
    }

    #[test]
    fn resolve_url_externalはcustom_url未指定時about_blankを返す() {
        assert_eq!(resolve_url(&column("external")), "about:blank");
    }

    #[test]
    fn resolve_url_composeはhomeを返す() {
        assert_eq!(resolve_url(&column("compose")), "https://x.com/home");
    }

    #[test]
    fn resolve_url_unknown_falls_back_to_home() {
        assert_eq!(resolve_url(&column("unknown")), "https://x.com/home");
    }

    #[test]
    fn webview_label_uses_column_prefix() {
        assert_eq!(webview_label("abc"), "column-abc");
    }

    #[test]
    fn effective_hide_tweet_input_enabledはcomposeカラムでtrue設定を無視してfalseになる() {
        let mut col = column("compose");
        col.settings.hide_tweet_input_enabled = true;
        assert!(!effective_hide_tweet_input_enabled(&col));
    }

    #[test]
    fn effective_hide_tweet_input_enabledはhomeカラムでtrue設定がそのまま反映される() {
        let mut col = column("home");
        col.settings.hide_tweet_input_enabled = true;
        assert!(effective_hide_tweet_input_enabled(&col));
    }

    #[test]
    fn effective_hide_tweet_input_enabledはhomeカラムでfalse設定がそのまま反映される() {
        let mut col = column("home");
        col.settings.hide_tweet_input_enabled = false;
        assert!(!effective_hide_tweet_input_enabled(&col));
    }

    #[test]
    fn is_safe_column_idは通常のuuidを許可する() {
        assert!(is_safe_column_id("550e8400-e29b-41d4-a716-446655440000"));
    }

    #[test]
    fn is_safe_column_idはスラッシュを含む値を拒否する() {
        assert!(!is_safe_column_id("abc/def"));
    }

    #[test]
    fn is_safe_column_idはバックスラッシュを含む値を拒否する() {
        assert!(!is_safe_column_id("abc\\def"));
    }

    #[test]
    fn is_safe_column_idは親ディレクトリ参照を含む値を拒否する() {
        assert!(!is_safe_column_id("../../etc/passwd"));
    }

    #[test]
    fn is_safe_column_idは空文字を拒否する() {
        assert!(!is_safe_column_id(""));
    }

    #[cfg(all(test, windows))]
    mod windows_cache_tests {
        use webview2_com::Microsoft::Web::WebView2::Win32::{
            COREWEBVIEW2_BROWSING_DATA_KINDS_CACHE_STORAGE,
            COREWEBVIEW2_BROWSING_DATA_KINDS_COOKIES, COREWEBVIEW2_BROWSING_DATA_KINDS_DISK_CACHE,
        };

        #[test]
        fn キャッシュクリア対象kindsにcookieが含まれない() {
            // Cookie は削除しない（ログイン情報を保持）。
            let kinds = COREWEBVIEW2_BROWSING_DATA_KINDS_DISK_CACHE
                | COREWEBVIEW2_BROWSING_DATA_KINDS_CACHE_STORAGE;

            // COOKIES が含まれていないことをアサート
            assert_eq!(
                kinds.0 & COREWEBVIEW2_BROWSING_DATA_KINDS_COOKIES.0,
                0,
                "COOKIES must not be included in cache clearing"
            );

            // DISK_CACHE と CACHE_STORAGE は含まれていることをアサート
            assert_ne!(kinds.0, 0, "Must include DISK_CACHE and/or CACHE_STORAGE");

            // DISK_CACHE が含まれていることをアサート
            assert_ne!(
                kinds.0 & COREWEBVIEW2_BROWSING_DATA_KINDS_DISK_CACHE.0,
                0,
                "DISK_CACHE must be included"
            );

            // CACHE_STORAGE が含まれていることをアサート
            assert_ne!(
                kinds.0 & COREWEBVIEW2_BROWSING_DATA_KINDS_CACHE_STORAGE.0,
                0,
                "CACHE_STORAGE must be included"
            );
        }
    }

    #[cfg(target_os = "linux")]
    #[allow(non_snake_case)]
    mod linux_layout {
        use super::super::linux_column_layout;

        #[test]
        fn 左端はみ出しはx_offsetが0でvis_widthがはみ出し分だけ縮む() {
            // bounds_x が負だが右側は表示範囲内 → x_offset=0、幅はみ出し分だけ縮小（幅クリップ・左右対称）
            let result = linux_column_layout(-100.0, 400.0, 1000.0);
            assert_eq!(result, Some((0.0, 300.0)));
        }

        #[test]
        fn 右端はみ出しはvis_widthがwin_logical_widthとbounds_xの差にクリップされる() {
            // bounds_x + bounds_width > win_logical_width → 右端のみクリップ
            let result = linux_column_layout(800.0, 400.0, 1000.0);
            assert_eq!(result, Some((800.0, 200.0)));
        }

        #[test]
        fn 完全に左の場合はNoneを返す() {
            // bounds_x + bounds_width <= 0.0 → 完全に画面外（左）
            let result = linux_column_layout(-400.0, 400.0, 1000.0);
            assert_eq!(result, None);
        }

        #[test]
        fn 完全に右の場合はNoneを返す() {
            // bounds_x >= win_logical_width → 完全に画面外（右）
            let result = linux_column_layout(1000.0, 400.0, 1000.0);
            assert_eq!(result, None);
        }

        #[test]
        fn ウィンドウ内に完全収容の場合はbounds_xとbounds_widthをそのまま返す() {
            // 左右どちらにもはみ出さない → bounds_x と bounds_width をそのまま返す
            let result = linux_column_layout(100.0, 400.0, 1000.0);
            assert_eq!(result, Some((100.0, 400.0)));
        }

        /// 回帰防止: 左端カラムが「全幅のまま左端に居座り、完全に画面外になるまで縮まない」
        /// デグレード（負の screen_x を指定して WM クランプされる案A）を捕捉する。
        /// 左へスクロールが進む（bounds_x が小さくなる）ほど x_offset は常に 0、
        /// vis_width は単調に縮み、全幅(400)で居座らないことを保証する。
        #[test]
        fn 左端カラムは全幅で居座らずスクロールが進むほど幅が縮む() {
            let width = 400.0;
            let win = 1000.0;
            // bounds_x: -50 → -150 → -250 と左へはみ出していくケース
            let r1 = linux_column_layout(-50.0, width, win).expect("一部可視なので表示");
            let r2 = linux_column_layout(-150.0, width, win).expect("一部可視なので表示");
            let r3 = linux_column_layout(-250.0, width, win).expect("一部可視なので表示");

            // x_offset は常に 0（WM クランプを受ける負位置にしない）
            assert_eq!(r1.0, 0.0);
            assert_eq!(r2.0, 0.0);
            assert_eq!(r3.0, 0.0);

            // 全幅(400)で居座らない＝デグレードしていないこと
            assert!(r1.1 < width, "vis_width={} が全幅のまま居座っている", r1.1);
            // はみ出すほど幅は単調に縮む
            assert!(
                r1.1 > r2.1,
                "{} は {} より大きいはず（縮小が進む）",
                r1.1,
                r2.1
            );
            assert!(
                r2.1 > r3.1,
                "{} は {} より大きいはず（縮小が進む）",
                r2.1,
                r3.1
            );

            // 具体値: width - |x| に一致
            assert_eq!(r1, (0.0, 350.0));
            assert_eq!(r2, (0.0, 250.0));
            assert_eq!(r3, (0.0, 150.0));
        }

        /// 回帰防止: 右端カラムが「全幅のまま右端に居座り、縮まない」デグレードを捕捉する。
        /// 右へはみ出しが進む（bounds_x が大きくなる）ほど x_offset は bounds_x のまま、
        /// vis_width は win_logical_width - bounds_x で単調に縮み、全幅(400)で居座らないことを保証する。
        #[test]
        fn 右端カラムは全幅で居座らずはみ出しが進むほど幅が縮む() {
            let width = 400.0;
            let win = 1000.0;
            // bounds_x: 650 → 750 → 850 と右へはみ出していくケース（いずれも x+width > win）
            let r1 = linux_column_layout(650.0, width, win).expect("一部可視なので表示");
            let r2 = linux_column_layout(750.0, width, win).expect("一部可視なので表示");
            let r3 = linux_column_layout(850.0, width, win).expect("一部可視なので表示");

            // x_offset は bounds_x のまま（右端は位置を動かさず幅だけクリップ）
            assert_eq!(r1.0, 650.0);
            assert_eq!(r2.0, 750.0);
            assert_eq!(r3.0, 850.0);

            // 全幅(400)で居座らない＝デグレードしていないこと
            assert!(r1.1 < width, "vis_width={} が全幅のまま居座っている", r1.1);
            // はみ出すほど幅は単調に縮む
            assert!(
                r1.1 > r2.1,
                "{} は {} より大きいはず（縮小が進む）",
                r1.1,
                r2.1
            );
            assert!(
                r2.1 > r3.1,
                "{} は {} より大きいはず（縮小が進む）",
                r2.1,
                r3.1
            );

            // 具体値: win - bounds_x に一致
            assert_eq!(r1, (650.0, 350.0));
            assert_eq!(r2, (750.0, 250.0));
            assert_eq!(r3, (850.0, 150.0));
        }
    }

    mod properties {
        use super::*;
        use proptest::prelude::*;

        proptest! {
            /// 検索クエリは URL エンコードされて埋め込まれ、デコードすると元の値に戻る（ラウンドトリップ）。
            #[test]
            fn resolve_url_search_query_roundtrips(query in any::<String>()) {
                let mut col = column("search");
                col.search_query = Some(query.clone());
                let url = resolve_url(&col);
                let encoded = url
                    .strip_prefix("https://x.com/search?q=")
                    .expect("search URL は固定プレフィックスで始まる");
                let decoded = urlencoding::decode(encoded)
                    .expect("エンコード結果は常にデコード可能")
                    .into_owned();
                prop_assert_eq!(decoded, query);
            }

            /// どの page_type・どんな入力でも、生成 URL は常に https:// スキームになる。
            #[test]
            fn resolve_url_always_https(
                page_type in prop::sample::select(vec![
                    "home", "notifications", "search", "list", "custom", "unknown",
                ]),
                value in any::<String>(),
            ) {
                let mut col = column(page_type);
                col.home_tab_name = Some(value.clone());
                col.search_query = Some(value.clone());
                col.list_id = Some(value.clone());
                // custom は URL をそのまま使うため、http(s) の値を与える
                col.custom_url = Some(format!("https://x.com/{value}"));
                let url = resolve_url(&col);
                prop_assert!(url.starts_with("https://"));
            }
        }
    }

    /// linux_column_layout のプロパティテスト（Linux 専用関数のため Linux ガード）。
    ///
    /// ジェネレータ範囲を有限値に制約する理由:
    ///   - f64 の `any::<f64>()` は NaN・±inf を含み、比較演算や算術演算が
    ///     不定動作を引き起こすため、有限区間のみを対象とする。
    ///   - `bounds_x`: 画面外への移動を含む実用範囲として ±10000 論理ピクセル。
    ///   - `bounds_width` / `win_logical_width`: 1 以上の正値（幅ゼロや負幅は
    ///     プロダクトコードの呼び出し側で保証済み）、上限 5000 は超大型ディスプレイ相当。
    #[cfg(target_os = "linux")]
    #[allow(non_snake_case)]
    mod linux_properties {
        use super::super::linux_column_layout;
        use proptest::prelude::*;

        proptest! {
            /// 表示されるときx_offsetは常にbounds_xを0でクランプした値である。
            ///
            /// linux_column_layout が Some を返す場合、x_offset は max(bounds_x, 0.0) に等しい。
            /// 左端はみ出し時は 0 に、それ以外は bounds_x をそのまま返す（幅クリップ・左右対称）。
            #[test]
            fn 表示されるときx_offsetは常にbounds_xを0でクランプした値である(
                bounds_x in -10000.0f64..10000.0,
                bounds_width in 1.0f64..5000.0,
                win_logical_width in 1.0f64..5000.0,
            ) {
                if let Some((x_offset, _)) = linux_column_layout(bounds_x, bounds_width, win_logical_width) {
                    prop_assert_eq!(x_offset, bounds_x.max(0.0));
                }
            }

            /// 表示されるときx_offsetは常に0以上である。
            ///
            /// Linux WM がウィンドウを画面内にクランプするため、x_offset が負になると
            /// WM クランプによってウィンドウが意図しない位置に配置される。
            /// この不変条件により WM クランプを受けないことを保証する。
            #[test]
            fn 表示されるときx_offsetは常に0以上である(
                bounds_x in -10000.0f64..10000.0,
                bounds_width in 1.0f64..5000.0,
                win_logical_width in 1.0f64..5000.0,
            ) {
                if let Some((x_offset, _)) = linux_column_layout(bounds_x, bounds_width, win_logical_width) {
                    prop_assert!(x_offset >= 0.0, "x_offset={x_offset} は 0.0 未満（WM クランプが発生する）");
                }
            }

            /// 表示されるときvis_widthは常に1以上である。
            ///
            /// WebView のサイズが 0 以下になると GTK がエラーを起こすため、
            /// vis_width は必ず 1.0 以上でなければならない。`.max(1.0)` による保証の不変条件。
            #[test]
            fn 表示されるときvis_widthは常に1以上である(
                bounds_x in -10000.0f64..10000.0,
                bounds_width in 1.0f64..5000.0,
                win_logical_width in 1.0f64..5000.0,
            ) {
                if let Some((_, vis_width)) = linux_column_layout(bounds_x, bounds_width, win_logical_width) {
                    prop_assert!(vis_width >= 1.0, "vis_width={vis_width} は 1.0 未満");
                }
            }

            /// bounds_widthが1以上ならvis_widthはbounds_width以下にクリップされる。
            ///
            /// 右端クリップは幅を「縮小のみ」する。入力より大きい幅を返すことはなく、
            /// カラムがウィンドウ右端を越えて表示されないことを保証する。
            #[test]
            fn bounds_widthが1以上ならvis_widthはbounds_width以下にクリップされる(
                bounds_x in -10000.0f64..10000.0,
                bounds_width in 1.0f64..5000.0,
                win_logical_width in 1.0f64..5000.0,
            ) {
                if let Some((_, vis_width)) = linux_column_layout(bounds_x, bounds_width, win_logical_width) {
                    prop_assert!(
                        vis_width <= bounds_width,
                        "vis_width={vis_width} が bounds_width={bounds_width} を超えている"
                    );
                }
            }

            /// Noneを返すのは完全に画面外のときだけである。
            ///
            /// None（WebView を hide）の条件と、実際の戻り値の双方向一致を検証する。
            /// カラムが部分的にでも表示範囲に入っている場合は必ず Some を返す。
            #[test]
            fn Noneを返すのは完全に画面外のときだけである(
                bounds_x in -10000.0f64..10000.0,
                bounds_width in 1.0f64..5000.0,
                win_logical_width in 1.0f64..5000.0,
            ) {
                let result = linux_column_layout(bounds_x, bounds_width, win_logical_width);
                let is_out_of_screen =
                    bounds_x + bounds_width <= 0.0 || bounds_x >= win_logical_width;
                prop_assert_eq!(
                    result.is_none(),
                    is_out_of_screen,
                    "bounds_x={}, bounds_width={}, win_logical_width={}: result={:?}, is_out_of_screen={}",
                    bounds_x, bounds_width, win_logical_width, result, is_out_of_screen
                );
            }
        }
    }

    #[cfg(test)]
    mod column_webview_labels_tests {
        use super::*;
        use std::collections::HashMap;

        fn new_registry() -> crate::state::WebviewRegistry {
            crate::state::WebviewRegistry {
                entries: HashMap::new(),
            }
        }

        #[test]
        fn 空のregistryは空配列を返す() {
            let registry = new_registry();
            let labels = column_webview_labels(&registry);
            assert!(labels.is_empty());
        }

        #[test]
        fn columnラベルのみが返される() {
            let mut registry = new_registry();
            registry.entries.insert(
                "column-a".to_string(),
                crate::state::WebviewEntry {
                    column_id: "a".to_string(),
                    account_id: "acc1".to_string(),
                    data_directory: "/data/a".to_string(),
                },
            );
            registry.entries.insert(
                "popup-b".to_string(),
                crate::state::WebviewEntry {
                    column_id: "b".to_string(),
                    account_id: "acc2".to_string(),
                    data_directory: "/data/b".to_string(),
                },
            );
            registry.entries.insert(
                "column-c".to_string(),
                crate::state::WebviewEntry {
                    column_id: "c".to_string(),
                    account_id: "acc3".to_string(),
                    data_directory: "/data/c".to_string(),
                },
            );

            let mut labels = column_webview_labels(&registry);
            labels.sort();
            assert_eq!(labels, vec!["column-a".to_string(), "column-c".to_string()]);
        }

        #[test]
        fn 複数のcolumnラベルが全て返される() {
            let mut registry = new_registry();
            registry.entries.insert(
                "column-1".to_string(),
                crate::state::WebviewEntry {
                    column_id: "1".to_string(),
                    account_id: "acc1".to_string(),
                    data_directory: "/data/1".to_string(),
                },
            );
            registry.entries.insert(
                "column-2".to_string(),
                crate::state::WebviewEntry {
                    column_id: "2".to_string(),
                    account_id: "acc2".to_string(),
                    data_directory: "/data/2".to_string(),
                },
            );
            registry.entries.insert(
                "column-3".to_string(),
                crate::state::WebviewEntry {
                    column_id: "3".to_string(),
                    account_id: "acc3".to_string(),
                    data_directory: "/data/3".to_string(),
                },
            );

            let mut labels = column_webview_labels(&registry);
            labels.sort();
            assert_eq!(
                labels,
                vec![
                    "column-1".to_string(),
                    "column-2".to_string(),
                    "column-3".to_string()
                ]
            );
        }

        #[test]
        fn composeやadd_accountラベルは除外される() {
            let mut registry = new_registry();
            registry.entries.insert(
                "column-a".to_string(),
                crate::state::WebviewEntry {
                    column_id: "a".to_string(),
                    account_id: "acc1".to_string(),
                    data_directory: "/data/a".to_string(),
                },
            );
            registry.entries.insert(
                "compose-1".to_string(),
                crate::state::WebviewEntry {
                    column_id: "compose1".to_string(),
                    account_id: "acc2".to_string(),
                    data_directory: "/data/compose1".to_string(),
                },
            );
            registry.entries.insert(
                "add-account-1".to_string(),
                crate::state::WebviewEntry {
                    column_id: "add1".to_string(),
                    account_id: "acc3".to_string(),
                    data_directory: "/data/add1".to_string(),
                },
            );

            let labels = column_webview_labels(&registry);
            assert_eq!(labels, vec!["column-a".to_string()]);
        }
    }
}
