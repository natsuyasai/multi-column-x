fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            // src-tauri/src/lib.rs の generate_handler! に登録されている全コマンド
            // （cfg 付きの Linux/desktop 専用コマンドも含める）。
            // アプリの ACL マニフェストを定義すると、ここに列挙されていないコマンドは
            // capability による許可の有無に関わらず ACL 未定義として拒否される。
            "load_settings",
            "save_settings",
            "create_column_webview",
            "get_external_column_data_directory",
            "delete_external_column_data",
            "remove_column_webview",
            "resize_column_webview",
            "open_popup_window",
            "open_link_popup_window",
            "close_popup_window",
            "switch_popup_session",
            "eval_in_webview",
            "report_webview_scroll",
            "report_new_posts_count",
            "report_official_settings",
            "report_api_rate_limit",
            "report_keyboard_shortcut",
            "get_mobile_insets",
            "set_column_cookies",
            "is_webview_profile_supported",
            "open_in_browser",
            "update_mobile_swipe_bar",
            "flash_mobile_swipe_bar",
            "open_add_account_window",
            "reauth_account_window",
            "delete_account_data",
            "close_window",
            "open_compose_window",
            "install_apk_update",
            "check_media_codec_support",
            "download_and_enable_h264",
            "download_video",
        ]),
    ))
    .expect("failed to run tauri-build");
}
