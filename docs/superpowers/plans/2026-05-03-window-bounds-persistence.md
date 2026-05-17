# Window Bounds Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** メインウィンドウの位置とサイズを閉じるときに保存し、次回起動時に復元する。

**Architecture:** `lib.rs` に `.setup()` と `.on_window_event()` を追加するのみ。`.setup()` で起動時に `settings.json` から `windowBounds` を読んで `set_position` / `set_size` で復元。`.on_window_event()` の `CloseRequested` で現在の位置・サイズを取得して `settings.json` に書き戻す。`settings.rs` の `WindowBounds` / `AppSettingsData` 構造体はすでに定義済みのため変更不要。フロントエンド変更なし。

**Tech Stack:** Tauri v2 (Rust), tauri-plugin-store v2, serde_json

---

## File Map

| File                   | Action | 内容                                      |
| ---------------------- | ------ | ----------------------------------------- |
| `src-tauri/src/lib.rs` | Modify | `.setup()` と `.on_window_event()` を追加 |

---

### Task 1: 起動時にウィンドウ位置・サイズを復元する

**Files:**

- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: `.setup()` ハンドラを追加する**

`src-tauri/src/lib.rs` を以下のように編集する。`use` 宣言と `.setup()` を追加する。

```rust
mod state;
mod inject;
mod commands;

use state::AppState;
use tauri::{Manager, PhysicalPosition, PhysicalSize};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(AppState::new())
        .setup(|app| {
            let store = app.store("settings.json").map_err(|e| e.to_string())?;
            if let Some(value) = store.get("appSettings") {
                if let Some(bounds) = value
                    .get("globalSettings")
                    .and_then(|gs| gs.get("windowBounds"))
                {
                    let x = bounds.get("x").and_then(|v| v.as_f64()).unwrap_or(0.0);
                    let y = bounds.get("y").and_then(|v| v.as_f64()).unwrap_or(0.0);
                    let w = bounds.get("width").and_then(|v| v.as_f64()).unwrap_or(1400.0);
                    let h = bounds.get("height").and_then(|v| v.as_f64()).unwrap_or(900.0);

                    if let Some(window) = app.get_webview_window("main") {
                        // 画面外チェック: 利用可能なモニター全体の矩形と照合する
                        let monitors = window.available_monitors().unwrap_or_default();
                        let on_screen = monitors.iter().any(|m| {
                            let pos = m.position();
                            let size = m.size();
                            x >= pos.x as f64
                                && y >= pos.y as f64
                                && x < (pos.x as f64 + size.width as f64)
                                && y < (pos.y as f64 + size.height as f64)
                        });

                        if on_screen {
                            let _ = window.set_position(PhysicalPosition::new(x as i32, y as i32));
                        }
                        let clamped_w = w.max(600.0) as u32;
                        let clamped_h = h.max(400.0) as u32;
                        let _ = window.set_size(PhysicalSize::new(clamped_w, clamped_h));
                    }
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::settings::load_settings,
            commands::settings::save_settings,
            commands::webview::create_column_webview,
            commands::webview::remove_column_webview,
            commands::webview::resize_column_webview,
            commands::webview::open_popup_window,
            commands::webview::switch_popup_session,
            commands::webview::eval_in_webview,
            commands::webview::report_webview_scroll,
            commands::webview::open_in_browser,
            commands::account::open_add_account_window,
            commands::account::notify_account_logged_in,
            commands::account::delete_account_data,
            commands::account::close_window,
            commands::webview::open_compose_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 2: ビルドして復元が動作することを確認する**

```powershell
cd c:\Users\fuku\Desktop\twitter-viewer
$env:Path += ";$env:USERPROFILE\.cargo\bin"
npm run tauri:dev
```

アプリを起動し、ウィンドウを移動・リサイズ後に閉じる。再起動して位置・サイズが `tauri.conf.json` のデフォルト（1400×900）ではなく前回値に戻ることを確認する。

- [ ] **Step 3: Commit**

```powershell
git add src-tauri/src/lib.rs
git commit -m "feat: restore window position and size on startup"
```

---

### Task 2: ウィンドウを閉じるときに位置・サイズを保存する

**Files:**

- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: `.on_window_event()` を追加する**

Task 1 で追加した `.setup()` と `.invoke_handler()` の間に以下を挿入する。

```rust
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if window.label() == "main" {
                    if let (Ok(pos), Ok(size)) = (window.outer_position(), window.outer_size()) {
                        if let Ok(store) = window.app_handle().store("settings.json") {
                            let current: serde_json::Value = store
                                .get("appSettings")
                                .unwrap_or_else(|| serde_json::json!({}));
                            let mut settings = current.clone();
                            settings["globalSettings"]["windowBounds"] = serde_json::json!({
                                "x": pos.x as f64,
                                "y": pos.y as f64,
                                "width": size.width as f64,
                                "height": size.height as f64,
                            });
                            store.set("appSettings", settings);
                            let _ = store.save();
                        }
                    }
                }
            }
        })
```

完成後の `lib.rs` 全体:

```rust
mod state;
mod inject;
mod commands;

use state::AppState;
use tauri::{Manager, PhysicalPosition, PhysicalSize};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(AppState::new())
        .setup(|app| {
            let store = app.store("settings.json").map_err(|e| e.to_string())?;
            if let Some(value) = store.get("appSettings") {
                if let Some(bounds) = value
                    .get("globalSettings")
                    .and_then(|gs| gs.get("windowBounds"))
                {
                    let x = bounds.get("x").and_then(|v| v.as_f64()).unwrap_or(0.0);
                    let y = bounds.get("y").and_then(|v| v.as_f64()).unwrap_or(0.0);
                    let w = bounds.get("width").and_then(|v| v.as_f64()).unwrap_or(1400.0);
                    let h = bounds.get("height").and_then(|v| v.as_f64()).unwrap_or(900.0);

                    if let Some(window) = app.get_webview_window("main") {
                        let monitors = window.available_monitors().unwrap_or_default();
                        let on_screen = monitors.iter().any(|m| {
                            let pos = m.position();
                            let size = m.size();
                            x >= pos.x as f64
                                && y >= pos.y as f64
                                && x < (pos.x as f64 + size.width as f64)
                                && y < (pos.y as f64 + size.height as f64)
                        });

                        if on_screen {
                            let _ = window.set_position(PhysicalPosition::new(x as i32, y as i32));
                        }
                        let clamped_w = w.max(600.0) as u32;
                        let clamped_h = h.max(400.0) as u32;
                        let _ = window.set_size(PhysicalSize::new(clamped_w, clamped_h));
                    }
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if window.label() == "main" {
                    if let (Ok(pos), Ok(size)) = (window.outer_position(), window.outer_size()) {
                        if let Ok(store) = window.app_handle().store("settings.json") {
                            let current: serde_json::Value = store
                                .get("appSettings")
                                .unwrap_or_else(|| serde_json::json!({}));
                            let mut settings = current.clone();
                            settings["globalSettings"]["windowBounds"] = serde_json::json!({
                                "x": pos.x as f64,
                                "y": pos.y as f64,
                                "width": size.width as f64,
                                "height": size.height as f64,
                            });
                            store.set("appSettings", settings);
                            let _ = store.save();
                        }
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::settings::load_settings,
            commands::settings::save_settings,
            commands::webview::create_column_webview,
            commands::webview::remove_column_webview,
            commands::webview::resize_column_webview,
            commands::webview::open_popup_window,
            commands::webview::switch_popup_session,
            commands::webview::eval_in_webview,
            commands::webview::report_webview_scroll,
            commands::webview::open_in_browser,
            commands::account::open_add_account_window,
            commands::account::notify_account_logged_in,
            commands::account::delete_account_data,
            commands::account::close_window,
            commands::webview::open_compose_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 2: ビルドして保存と復元の両方を確認する**

```powershell
npm run tauri:dev
```

1. アプリを起動する
2. ウィンドウを任意の位置・サイズに変更する
3. アプリを閉じる
4. `%APPDATA%\com.twitter-viewer\settings.json` を開き `windowBounds` に保存された値を確認する
5. アプリを再起動して前回の位置・サイズで表示されることを確認する

- [ ] **Step 3: Commit**

```powershell
git add src-tauri/src/lib.rs
git commit -m "feat: save window position and size on close"
```
