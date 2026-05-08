// src-tauri/src/inject/mod.rs

pub fn build_init_script(
    is_mobile: bool,
    area_remove_enabled: bool,
    show_custom_menu: bool,
    auto_reload_enabled: bool,
    video_auto_play_stop_enabled: bool,
    custom_css: &str,
    visible_links: &[String],
) -> String {
    let tab_selector = include_str!("tab_selector.js");
    let header_customizer = include_str!("header_customizer.js");
    let auto_reload = include_str!("auto_reload.js");
    let custom_css_js = include_str!("custom_css.js");
    let image_popup = if is_mobile {
        ""
    } else {
        include_str!("image_popup.js")
    };
    let context_menu = include_str!("context_menu.js");
    let scroll_event = include_str!("scroll_event.js");
    let video_control = include_str!("video_control.js");

    let visible_links_json =
        serde_json::to_string(visible_links).unwrap_or_else(|_| "[]".to_string());
    let config = format!(
        "window.__multiColumnXConfig = {{ areaRemoveEnabled: {}, showCustomMenu: {}, visibleLinks: {} }};",
        area_remove_enabled,
        show_custom_menu,
        visible_links_json
    );

    let header_part = if area_remove_enabled {
        format!("\n{}", header_customizer)
    } else {
        String::new()
    };
    let auto_reload_part = if auto_reload_enabled {
        format!("\n{}", auto_reload)
    } else {
        String::new()
    };
    let video_control_part = if video_auto_play_stop_enabled {
        format!("\n{}", video_control)
    } else {
        String::new()
    };

    let mut script = format!(
        "{}\n{}{}{}{}{}{}{}{}",
        config,
        tab_selector,
        header_part,
        auto_reload_part,
        video_control_part,
        custom_css_js,
        image_popup,
        context_menu,
        scroll_event
    );

    if !custom_css.is_empty() {
        script.push_str(&format!(
            "\nwindow.__multiColumnX.applyCustomCSS({:?});",
            custom_css
        ));
    }

    script
}

pub fn build_popup_init_script(
    accounts_json: &str,
    current_account_id: &str,
    target_href: &str,
    esc_close_enabled: bool,
) -> String {
    let popup_toolbar = include_str!("popup_toolbar.js");
    format!(
        "window.__tvAccounts={};window.__tvCurrentAccountId={:?};window.__tvTargetHref={:?};window.__tvEscCloseEnabled={};\n{}",
        accounts_json, current_account_id, target_href, esc_close_enabled, popup_toolbar
    )
}
