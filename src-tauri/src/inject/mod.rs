// src-tauri/src/inject/mod.rs

pub fn build_init_script(
    area_remove_enabled: bool,
    custom_css: &str,
) -> String {
    let tab_selector = include_str!("tab_selector.js");
    let header_customizer = include_str!("header_customizer.js");
    let auto_reload = include_str!("auto_reload.js");
    let custom_css_js = include_str!("custom_css.js");
    let image_popup = include_str!("image_popup.js");
    let scroll_event = include_str!("scroll_event.js");

    // header_customizer.js が読み取る初期設定を先に注入する
    let config = format!(
        "window.__twitterViewerConfig = {{ areaRemoveEnabled: {} }};",
        area_remove_enabled
    );

    let mut script = format!(
        "{}\n{}\n{}\n{}\n{}\n{}\n{}",
        config, tab_selector, header_customizer, auto_reload, custom_css_js, image_popup, scroll_event
    );

    if !custom_css.is_empty() {
        script.push_str(&format!(
            "\nwindow.__twitterViewer.applyCustomCSS({:?});",
            custom_css
        ));
    }

    script
}
