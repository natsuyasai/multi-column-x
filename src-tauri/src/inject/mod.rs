// src-tauri/src/inject/mod.rs

pub fn build_init_script(
    home_tab_name: Option<&str>,
    area_remove_enabled: bool,
    auto_reload_enabled: bool,
    auto_reload_interval: u32,
    custom_css: &str,
) -> String {
    let tab_selector = include_str!("tab_selector.js");
    let area_remove = include_str!("area_remove.js");
    let auto_reload = include_str!("auto_reload.js");
    let custom_css_js = include_str!("custom_css.js");
    let image_popup = include_str!("image_popup.js");

    let mut script = format!(
        "{}\n{}\n{}\n{}\n{}",
        tab_selector, area_remove, auto_reload, custom_css_js, image_popup
    );

    if let Some(tab_name) = home_tab_name {
        script.push_str(&format!(
            "\nwindow.__twitterViewer.selectHomeTab({:?});",
            tab_name
        ));
    }

    if !area_remove_enabled {
        script.push_str("\nwindow.__twitterViewer.applyAreaRemove(false);");
    }

    if auto_reload_enabled {
        script.push_str(&format!(
            "\nwindow.__twitterViewer.startAutoReload({});",
            auto_reload_interval
        ));
    }

    if !custom_css.is_empty() {
        script.push_str(&format!(
            "\nwindow.__twitterViewer.applyCustomCSS({:?});",
            custom_css
        ));
    }

    script
}
