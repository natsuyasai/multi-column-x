// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Wayland はトップレベルウィンドウへの絶対座標配置をサポートしない。
    // WAYLAND_DISPLAY が存在する場合は GTK を X11 バックエンド（XWayland）で動かし、
    // カラム WebView の set_position / inner_position が正しく機能するようにする。
    #[cfg(target_os = "linux")]
    if std::env::var("WAYLAND_DISPLAY").is_ok() {
        std::env::set_var("GDK_BACKEND", "x11");
    }

    multi_column_x_lib::run()
}
