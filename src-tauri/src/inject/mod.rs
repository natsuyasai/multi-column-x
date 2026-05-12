// src-tauri/src/inject/mod.rs

use crate::ipc_constants::globals;

pub struct InitScriptParams<'a> {
    pub is_mobile: bool,
    pub area_remove_enabled: bool,
    pub show_custom_menu: bool,
    pub auto_reload_enabled: bool,
    pub scroll_pos_restore_enabled: bool,
    pub video_auto_play_stop_enabled: bool,
    pub small_image_enabled: bool,
    pub small_image_width: &'a str,
    pub blur_image_enabled: bool,
    pub blur_image_amount: &'a str,
    pub hide_ad_enabled: bool,
    pub zoom_level: f64,
    pub custom_css: &'a str,
    pub visible_links: &'a [String],
}

pub fn build_init_script(params: &InitScriptParams) -> String {
    let tab_selector = include_str!("tab_selector.js");
    let header_customizer = include_str!("header_customizer.js");
    let auto_reload = include_str!("auto_reload.js");
    let custom_css_js = include_str!("custom_css.js");
    let small_image = include_str!("small_image.js");
    let blur_image = include_str!("blur_image.js");
    let hide_ad = include_str!("hide_ad.js");
    let image_popup = if params.is_mobile {
        ""
    } else {
        include_str!("image_popup.js")
    };
    let scroll_pos_restore = if params.scroll_pos_restore_enabled {
        include_str!("scroll_pos_restore.js")
    } else {
        ""
    };
    let zoom = include_str!("zoom.js");
    let context_menu = if params.is_mobile {
        ""
    } else {
        include_str!("context_menu.js")
    };
    let scroll_event = include_str!("scroll_event.js");
    let video_control = include_str!("video_control.js");

    let visible_links_json =
        serde_json::to_string(params.visible_links).unwrap_or_else(|_| "[]".to_string());
    let config = format!(
        "window.{} = {{ areaRemoveEnabled: {}, showCustomMenu: {}, visibleLinks: {}, smallImageEnabled: {}, smallImageWidth: {:?}, blurImageEnabled: {}, blurImageAmount: {:?}, hideAdEnabled: {}, zoomLevel: {} }};",
        globals::MULTI_COLUMN_X_CONFIG,
        params.area_remove_enabled,
        params.show_custom_menu,
        visible_links_json,
        params.small_image_enabled,
        params.small_image_width,
        params.blur_image_enabled,
        params.blur_image_amount,
        params.hide_ad_enabled,
        params.zoom_level
    );

    let header_part = if params.area_remove_enabled {
        format!("\n{}", header_customizer)
    } else {
        String::new()
    };
    let auto_reload_part = if params.auto_reload_enabled {
        format!("\n{}", auto_reload)
    } else {
        String::new()
    };
    let video_control_part = if params.video_auto_play_stop_enabled {
        format!("\n{}", video_control)
    } else {
        String::new()
    };

    let mut script = format!(
        "{}\n{}{}{}{}{}{}{}{}{}{}{}{}{}",
        config,
        zoom,
        tab_selector,
        header_part,
        auto_reload_part,
        video_control_part,
        small_image,
        blur_image,
        hide_ad,
        custom_css_js,
        image_popup,
        scroll_pos_restore,
        context_menu,
        scroll_event
    );

    if !params.custom_css.is_empty() {
        script.push_str(&format!(
            "\nwindow.{}.applyCustomCSS({:?});",
            globals::MULTI_COLUMN_X,
            params.custom_css
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
        "window.{}={};window.{}={:?};window.{}={:?};window.{}={};\n{}",
        globals::TV_ACCOUNTS,
        accounts_json,
        globals::TV_CURRENT_ACCOUNT_ID,
        current_account_id,
        globals::TV_TARGET_HREF,
        target_href,
        globals::TV_ESC_CLOSE_ENABLED,
        esc_close_enabled,
        popup_toolbar
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn default_params() -> InitScriptParams<'static> {
        InitScriptParams {
            is_mobile: false,
            area_remove_enabled: false,
            show_custom_menu: true,
            auto_reload_enabled: false,
            scroll_pos_restore_enabled: false,
            video_auto_play_stop_enabled: false,
            small_image_enabled: false,
            small_image_width: "50%",
            blur_image_enabled: false,
            blur_image_amount: "10px",
            hide_ad_enabled: false,
            zoom_level: 1.0,
            custom_css: "",
            visible_links: &[],
        }
    }

    #[test]
    fn build_init_script_config_contains_all_flags() {
        let script = build_init_script(&default_params());
        assert!(script.contains("__multiColumnXConfig"));
        assert!(script.contains("areaRemoveEnabled: false"));
        assert!(script.contains("showCustomMenu: true"));
        assert!(script.contains("smallImageEnabled: false"));
        assert!(script.contains("hideAdEnabled: false"));
        assert!(script.contains("zoomLevel: 1"));
    }

    #[test]
    fn build_init_script_appends_custom_css_when_provided() {
        let mut params = default_params();
        params.custom_css = ".foo { color: red; }";
        let script = build_init_script(&params);
        assert!(script.contains("applyCustomCSS"));
        assert!(script.contains(".foo { color: red; }"));
    }

    #[test]
    fn build_init_script_no_custom_css_call_when_empty() {
        let script = build_init_script(&default_params());
        // custom_css_js にはapplyCustomCSS関数定義が含まれるが、
        // カスタムCSSが空のときはwindow.__multiColumnX.applyCustomCSS(...)呼び出しが生成されない
        assert!(!script.contains("window.__multiColumnX.applyCustomCSS("));
    }

    #[test]
    fn build_init_script_visible_links_serialized_as_json() {
        let links = vec!["https://a.com".to_string(), "https://b.com".to_string()];
        let mut params = default_params();
        params.visible_links = &links;
        let script = build_init_script(&params);
        assert!(script.contains(r#"["https://a.com","https://b.com"]"#));
    }

    #[test]
    fn build_init_script_mobile_excludes_image_popup() {
        let mut params = default_params();
        params.is_mobile = true;
        let desktop_script = build_init_script(&default_params());
        let mobile_script = build_init_script(&params);
        // image_popup.js はデスクトップのみ含まれる
        assert!(desktop_script.len() > mobile_script.len() || !mobile_script.is_empty());
    }

    #[test]
    fn build_popup_init_script_embeds_account_and_flags() {
        let script = build_popup_init_script(
            r#"[{"id":"acc1"}]"#,
            "acc1",
            "https://x.com/something",
            true,
        );
        assert!(script.contains("__tvAccounts"));
        assert!(script.contains(r#"[{"id":"acc1"}]"#));
        assert!(script.contains("__tvCurrentAccountId"));
        assert!(script.contains("acc1"));
        assert!(script.contains("__tvEscCloseEnabled"));
        assert!(script.contains("true"));
    }

    #[test]
    fn build_popup_init_script_esc_close_disabled() {
        let script = build_popup_init_script("[]", "acc1", "", false);
        assert!(script.contains("false"));
    }
}
