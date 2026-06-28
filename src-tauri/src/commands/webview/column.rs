//! カラム WebView の作成・削除・リサイズ・Cookie 切替。
#[cfg(desktop)]
use super::parse_url;
use crate::commands::settings::ColumnData;
use crate::commands::settings_store::{
    load_global_ng_words, load_hide_ad_enabled, load_image_popup_enabled,
    load_video_auto_play_stop_enabled, load_video_popup_enabled,
};
use crate::inject::{build_init_script, InitScriptParams};
use crate::ipc_constants::labels;
use crate::state::AppState;
#[cfg(desktop)]
use std::path::PathBuf;
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

#[cfg(desktop)]
#[tauri::command]
pub async fn create_column_webview(app: AppHandle, args: CreateWebviewArgs) -> Result<(), String> {
    let url = resolve_url(&args.column);
    let label = webview_label(&args.column.id);
    let data_dir = PathBuf::from(&args.data_directory);

    let video_auto_play_stop_enabled = load_video_auto_play_stop_enabled(&app);
    let hide_ad_enabled = load_hide_ad_enabled(&app);
    let image_popup_enabled = load_image_popup_enabled(&app);
    let video_popup_enabled = load_video_popup_enabled(&app);
    let global_ng_words = load_global_ng_words(&app);
    let init_script = build_init_script(&InitScriptParams {
        is_mobile: false,
        area_remove_enabled: args.column.settings.area_remove_enabled,
        show_custom_menu: args.column.settings.show_custom_menu,
        scroll_pos_restore_enabled: args.column.settings.scroll_pos_restore_enabled,
        video_auto_play_stop_enabled,
        small_image_enabled: args.column.settings.small_image_enabled,
        small_image_width: &args.column.settings.small_image_width,
        blur_image_enabled: args.column.settings.blur_image_enabled,
        blur_image_amount: &args.column.settings.blur_image_amount,
        hide_ad_enabled,
        image_popup_enabled,
        video_popup_enabled,
        custom_css: &args.column.settings.custom_css,
        visible_links: &args.column.settings.visible_links,
        ng_words: &args.column.settings.ng_words,
        global_ng_words: &global_ng_words,
    });

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
    }

    #[cfg(not(target_os = "linux"))]
    window
        .add_child(
            WebviewBuilder::new(&label, WebviewUrl::External(parse_url(&url)?))
                .initialization_script(&init_script)
                .data_directory(data_dir),
            LogicalPosition::new(args.x, args.y),
            LogicalSize::new(args.width, args.height),
        )
        .map_err(|e| e.to_string())?;

    let state = app.state::<AppState>();
    let mut registry = state.registry.lock().unwrap();
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

    let video_auto_play_stop_enabled = load_video_auto_play_stop_enabled(&app);
    let hide_ad_enabled = load_hide_ad_enabled(&app);
    let image_popup_enabled = load_image_popup_enabled(&app);
    let video_popup_enabled = load_video_popup_enabled(&app);
    let global_ng_words = load_global_ng_words(&app);
    let init_script = build_init_script(&InitScriptParams {
        is_mobile: true,
        area_remove_enabled: args.column.settings.area_remove_enabled,
        show_custom_menu: args.column.settings.show_custom_menu,
        scroll_pos_restore_enabled: args.column.settings.scroll_pos_restore_enabled,
        video_auto_play_stop_enabled,
        small_image_enabled: args.column.settings.small_image_enabled,
        small_image_width: &args.column.settings.small_image_width,
        blur_image_enabled: args.column.settings.blur_image_enabled,
        blur_image_amount: &args.column.settings.blur_image_amount,
        hide_ad_enabled,
        image_popup_enabled,
        video_popup_enabled,
        custom_css: &args.column.settings.custom_css,
        visible_links: &args.column.settings.visible_links,
        ng_words: &args.column.settings.ng_words,
        global_ng_words: &global_ng_words,
    });

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
    let mut registry = state.registry.lock().unwrap();
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
    let mut registry = state.registry.lock().unwrap();
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
    let mut registry = state.registry.lock().unwrap();
    registry.unregister(&label);

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

        // 案A: スクリーン左端で自然クリップ。完全に画面外のときのみ非表示にし、
        // 左端はみ出しは x_offset を負のまま配置して OS のクリップに委ねる（コンテンツ位置を維持）。
        // 右端のみ win_logical_width でクリップして幅を制限する。
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

/// Linux カラムの表示レイアウトを計算する純粋関数（案A: スクリーン左端で自然クリップ）。
///
/// 戻り値:
/// - `None`               : カラムを hide する（完全に画面外）
/// - `Some((x_offset, vis_width))` : screen_x = inner_pos.x/scale + x_offset で配置し、
///   幅 vis_width で表示する。x_offset は負値になりうる（左端クリップは OS に委ねる）。
///
/// 左端にはみ出す場合は x_offset が負のまま配置し、スクリーン左端で自然クリップさせる。
/// これによりコンテンツの水平位置を保ったまま見えている部分だけを表示できる（幅は縮小しない）。
/// 右端のみ win_logical_width でクリップして正しい幅を計算する。
#[cfg(target_os = "linux")]
fn linux_column_layout(
    bounds_x: f64,
    bounds_width: f64,
    win_logical_width: f64,
) -> Option<(f64, f64)> {
    // 完全に左（右端が 0 以下）または完全に右（左端がウィンドウ幅以上）なら非表示
    if bounds_x + bounds_width <= 0.0 || bounds_x >= win_logical_width {
        return None;
    }
    // 右端を win_logical_width でクリップ、左端はクリップしない（OS の自然クリップに委ねる）
    let vis_width = (win_logical_width - bounds_x).min(bounds_width).max(1.0);
    Some((bounds_x, vis_width))
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
                r#"{"autoReloadEnabled":true,"autoReloadInterval":600,"areaRemoveEnabled":true,"customCSS":""}"#,
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
    fn resolve_url_unknown_falls_back_to_home() {
        assert_eq!(resolve_url(&column("unknown")), "https://x.com/home");
    }

    #[test]
    fn webview_label_uses_column_prefix() {
        assert_eq!(webview_label("abc"), "column-abc");
    }

    #[cfg(target_os = "linux")]
    #[allow(non_snake_case)]
    mod linux_layout {
        use super::super::linux_column_layout;

        #[test]
        fn 左端はみ出しはx_offsetが負でvis_widthはbounds_widthと等しい() {
            // bounds_x が負だが右側は表示範囲内 → x_offset が負・幅は縮小しない（案A: スクリーン左端で自然クリップ）
            let result = linux_column_layout(-100.0, 400.0, 1000.0);
            assert_eq!(result, Some((-100.0, 400.0)));
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
}
