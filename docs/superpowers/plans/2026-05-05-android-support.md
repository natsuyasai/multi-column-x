# Android Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Android support to MultiColumnX using Tauri 2's mobile build, with tab-based single-column display on Android while keeping all desktop behavior unchanged.

**Architecture:** `#[cfg(mobile)]` / `#[cfg(desktop)]` in Rust conditionally replaces window-based APIs (popups, account login) with fullscreen child WebViews. The frontend reads `isMobile` from `tauri-plugin-os` and renders a `MobileTabBar` instead of `Sidebar`. All column WebViews are kept alive on Android; only one is visible at a time via position switching.

**Tech Stack:** Tauri 2 mobile, tauri-plugin-os 2, React 19, Zustand 5, TypeScript, Vitest

---

## File Structure

| File                                                   | Action | Responsibility                                                                                                                                                      |
| ------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src-tauri/Cargo.toml`                                 | Modify | Add tauri-plugin-os dependency                                                                                                                                      |
| `src-tauri/tauri.conf.json`                            | Modify | Add Android minSdkVersion                                                                                                                                           |
| `src-tauri/src/lib.rs`                                 | Modify | Guard window bounds logic with `#[cfg(desktop)]`, register OS plugin                                                                                                |
| `src-tauri/src/commands/account.rs`                    | Modify | Split `open_add_account_window` and `close_window` for desktop/mobile                                                                                               |
| `src-tauri/src/commands/webview.rs`                    | Modify | Split popup commands for desktop/mobile, fix `close_popup_window`                                                                                                   |
| `src/store/useAppStore.ts`                             | Modify | Add `isMobile: boolean` and `setIsMobile`                                                                                                                           |
| `src/store/useAppStore.test.ts`                        | Modify | Test `isMobile` default and setter                                                                                                                                  |
| `src/hooks/useColumns.ts`                              | Modify | Add `MOBILE_TAB_BAR_HEIGHT`, `activeColumnId`, `setActiveColumn`; mobile paths in `restoreColumns`, `handleAddColumn`, `recalculateAllBounds`, `handleRemoveColumn` |
| `src/components/MobileTabBar/MobileTabBar.tsx`         | Create | Android tab bar component                                                                                                                                           |
| `src/components/MobileTabBar/MobileTabBar.module.scss` | Create | Tab bar styles                                                                                                                                                      |
| `src/components/MobileTabBar/MobileTabBar.test.tsx`    | Create | Render and interaction tests                                                                                                                                        |
| `src/App.tsx`                                          | Modify | Platform detection, conditional Sidebar/MobileTabBar/ColumnHeader rendering                                                                                         |
| `package.json`                                         | Modify | Add `@tauri-apps/plugin-os`                                                                                                                                         |

---

### Task 1: Build Configuration

**Files:**

- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `package.json`

- [ ] **Step 1: Add tauri-plugin-os to Cargo.toml**

  In `src-tauri/Cargo.toml`, add to `[dependencies]`:

  ```toml
  tauri-plugin-os = "2"
  ```

- [ ] **Step 2: Add Android configuration to tauri.conf.json**

  In `src-tauri/tauri.conf.json`, add `"bundle"` inside the top-level object (alongside `"productName"`, `"app"`, etc.):

  ```json
  "bundle": {
    "android": {
      "minSdkVersion": 24
    }
  }
  ```

- [ ] **Step 3: Install @tauri-apps/plugin-os**

  ```bash
  npm install @tauri-apps/plugin-os
  ```

  Expected: package added to `dependencies` in `package.json`.

- [ ] **Step 4: Verify Rust compiles**

  ```bash
  cd src-tauri && cargo check
  ```

  Expected: no errors (warnings OK).

- [ ] **Step 5: Commit**

  ```bash
  git add src-tauri/Cargo.toml src-tauri/tauri.conf.json package.json package-lock.json
  git commit -m "feat: add tauri-plugin-os and Android build configuration"
  ```

---

### Task 2: Guard Desktop-Only Code in lib.rs

**Files:**

- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Wrap save_window_bounds with `#[cfg(desktop)]`**

  Find `fn save_window_bounds(window: &tauri::Window)` at the top of `lib.rs` and wrap the entire function:

  ```rust
  #[cfg(desktop)]
  fn save_window_bounds(window: &tauri::Window) {
      use crate::commands::settings::{AppSettingsData, GlobalSettingsData, WindowBounds};
      let Ok(pos) = window.outer_position() else {
          return;
      };
      let Ok(size) = window.outer_size() else {
          return;
      };
      let Ok(store) = window.app_handle().store("settings.json") else {
          return;
      };
      let mut settings = store
          .get("appSettings")
          .and_then(|v| serde_json::from_value::<AppSettingsData>(v).ok())
          .unwrap_or_else(|| AppSettingsData {
              accounts: vec![],
              columns: vec![],
              global_settings: GlobalSettingsData {
                  theme: "dark".to_string(),
                  custom_css: String::new(),
                  window_bounds: WindowBounds {
                      x: 0.0,
                      y: 0.0,
                      width: 1400.0,
                      height: 900.0,
                  },
                  default_account_id: None,
                  default_auto_reload_enabled: true,
                  default_auto_reload_interval: 600,
                  popup_esc_close_enabled: true,
                  video_auto_play_stop_enabled: false,
              },
          });
      settings.global_settings.window_bounds = WindowBounds {
          x: pos.x as f64,
          y: pos.y as f64,
          width: size.width as f64,
          height: size.height as f64,
      };
      let Ok(value) = serde_json::to_value(&settings) else {
          return;
      };
      store.set("appSettings", value);
      if let Err(e) = store.save() {
          eprintln!("[MultiColumnX] failed to save window bounds: {e}");
      }
  }
  ```

- [ ] **Step 2: Add OS plugin and guard desktop-only setup/event code in `run()`**

  Replace the entire `pub fn run()` with the following:

  ```rust
  #[cfg_attr(mobile, tauri::mobile_entry_point)]
  pub fn run() {
      let builder = tauri::Builder::default()
          .plugin(tauri_plugin_opener::init())
          .plugin(tauri_plugin_os::init())
          .plugin(tauri_plugin_store::Builder::new().build())
          .manage(AppState::new())
          .setup(|app| {
              #[cfg(desktop)]
              {
                  use crate::commands::settings::AppSettingsData;
                  let store = app.store("settings.json").map_err(|e| e.to_string())?;
                  if let Some(settings) = store
                      .get("appSettings")
                      .and_then(|v| serde_json::from_value::<AppSettingsData>(v).ok())
                  {
                      let wb = &settings.global_settings.window_bounds;
                      if let Some(window) = app.get_webview_window("main") {
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
                              let _ = window.set_position(PhysicalPosition::new(
                                  wb.x as i32,
                                  wb.y as i32,
                              ));
                          }
                          let clamped_w = wb.width.max(600.0) as u32;
                          let clamped_h = wb.height.max(400.0) as u32;
                          let _ = window.set_size(PhysicalSize::new(clamped_w, clamped_h));
                      }
                  }
              }
              Ok(())
          });

      #[cfg(desktop)]
      let builder = builder.on_window_event(|window, event| {
          if let tauri::WindowEvent::CloseRequested { .. } = event {
              if window.label() == "main" {
                  save_window_bounds(window);
              }
          }
      });

      builder
          .invoke_handler(tauri::generate_handler![
              commands::settings::load_settings,
              commands::settings::save_settings,
              commands::webview::create_column_webview,
              commands::webview::remove_column_webview,
              commands::webview::resize_column_webview,
              commands::webview::open_popup_window,
              commands::webview::open_link_popup_window,
              commands::webview::close_popup_window,
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

- [ ] **Step 3: Verify Rust compiles**

  ```bash
  cd src-tauri && cargo check
  ```

  Expected: no errors.

- [ ] **Step 4: Commit**

  ```bash
  git add src-tauri/src/lib.rs
  git commit -m "feat: guard desktop-only window bounds code with cfg(desktop), register OS plugin"
  ```

---

### Task 3: Fix close Commands for Mobile Compatibility

**Files:**

- Modify: `src-tauri/src/commands/webview.rs`
- Modify: `src-tauri/src/commands/account.rs`

- [ ] **Step 1: Update close_popup_window to fall back to get_webview**

  Replace the current `close_popup_window` in `src-tauri/src/commands/webview.rs`:

  ```rust
  #[tauri::command]
  pub async fn close_popup_window(app: AppHandle, label: String) -> Result<(), String> {
      if let Some(window) = app.get_webview_window(&label) {
          window.close().map_err(|e| e.to_string())?;
      } else if let Some(webview) = app.get_webview(&label) {
          webview.close().map_err(|e| e.to_string())?;
      }
      Ok(())
  }
  ```

- [ ] **Step 2: Update close_window in account.rs the same way**

  Replace `close_window` in `src-tauri/src/commands/account.rs`:

  ```rust
  #[tauri::command]
  pub async fn close_window(app: AppHandle, label: String) -> Result<(), String> {
      if let Some(window) = app.get_webview_window(&label) {
          window.close().map_err(|e| e.to_string())?;
      } else if let Some(webview) = app.get_webview(&label) {
          webview.close().map_err(|e| e.to_string())?;
      }
      Ok(())
  }
  ```

- [ ] **Step 3: Verify Rust compiles**

  ```bash
  cd src-tauri && cargo check
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add src-tauri/src/commands/webview.rs src-tauri/src/commands/account.rs
  git commit -m "fix: close_popup_window and close_window fall back to child WebView on mobile"
  ```

---

### Task 4: Mobile Popup and Compose Commands (Rust)

**Files:**

- Modify: `src-tauri/src/commands/webview.rs`

- [ ] **Step 1: Split open_popup_window into desktop/mobile**

  In `src-tauri/src/commands/webview.rs`, add `#[cfg(desktop)]` on the line immediately above the existing `#[tauri::command]` for `open_popup_window`. Do not touch the function body. Then add the mobile version immediately after the closing `}`:

  ```rust
  #[cfg(mobile)]
  #[tauri::command]
  pub async fn open_popup_window(
      app: AppHandle,
      webview_label_caller: String,
      url: String,
  ) -> Result<(), String> {
      let state = app.state::<AppState>();
      let (data_dir, current_account_id) = {
          let registry = state.registry.lock().unwrap();
          let data_dir = registry
              .get_data_directory(&webview_label_caller)
              .map(PathBuf::from)
              .unwrap_or_default();
          let account_id = registry
              .get_account_id(&webview_label_caller)
              .unwrap_or("")
              .to_string();
          (data_dir, account_id)
      };

      let accounts_json = load_accounts_json(&app);
      let esc_close_enabled = load_popup_esc_close_enabled(&app);
      let popup_init = crate::inject::build_popup_init_script(
          &accounts_json,
          &current_account_id,
          &url,
          esc_close_enabled,
      );
      let popup_label = format!("popup-{}", uuid::Uuid::new_v4());

      let window = app.get_window("main").ok_or("main window not found")?;
      let size = window.inner_size().map_err(|e| e.to_string())?;
      let scale = window.scale_factor().unwrap_or(1.0);
      let logical_w = size.width as f64 / scale;
      let logical_h = size.height as f64 / scale;

      window
          .add_child(
              WebviewBuilder::new(&popup_label, WebviewUrl::External(parse_url(&url)?))
                  .initialization_script(&popup_init)
                  .data_directory(data_dir),
              LogicalPosition::new(0.0, 0.0),
              LogicalSize::new(logical_w, logical_h),
          )
          .map_err(|e| e.to_string())?;

      Ok(())
  }
  ```

- [ ] **Step 2: Split open_link_popup_window into desktop/mobile**

  Wrap existing with `#[cfg(desktop)]` and add after:

  ```rust
  #[cfg(mobile)]
  #[tauri::command]
  pub async fn open_link_popup_window(
      app: AppHandle,
      webview_label_caller: Option<String>,
      #[allow(non_snake_case)] accountId: Option<String>,
      #[allow(non_snake_case)] dataDirectory: Option<String>,
      url: String,
  ) -> Result<(), String> {
      let (data_dir, current_account_id) = if let (Some(aid), Some(dd)) = (accountId, dataDirectory) {
          (PathBuf::from(dd), aid)
      } else {
          let label = webview_label_caller.unwrap_or_default();
          let state = app.state::<AppState>();
          let registry = state.registry.lock().unwrap();
          let dd = registry
              .get_data_directory(&label)
              .map(PathBuf::from)
              .unwrap_or_default();
          let aid = registry
              .get_account_id(&label)
              .unwrap_or("")
              .to_string();
          (dd, aid)
      };

      let accounts_json = load_accounts_json(&app);
      let esc_close_enabled = load_popup_esc_close_enabled(&app);
      let popup_init = crate::inject::build_popup_init_script(
          &accounts_json,
          &current_account_id,
          "",
          esc_close_enabled,
      );
      let popup_label = format!("popup-{}", uuid::Uuid::new_v4());

      let window = app.get_window("main").ok_or("main window not found")?;
      let size = window.inner_size().map_err(|e| e.to_string())?;
      let scale = window.scale_factor().unwrap_or(1.0);
      let logical_w = size.width as f64 / scale;
      let logical_h = size.height as f64 / scale;

      window
          .add_child(
              WebviewBuilder::new(&popup_label, WebviewUrl::External(parse_url(&url)?))
                  .initialization_script(&popup_init)
                  .data_directory(data_dir),
              LogicalPosition::new(0.0, 0.0),
              LogicalSize::new(logical_w, logical_h),
          )
          .map_err(|e| e.to_string())?;

      Ok(())
  }
  ```

- [ ] **Step 3: Split open_compose_window into desktop/mobile**

  Wrap existing with `#[cfg(desktop)]` and add after:

  ```rust
  #[cfg(mobile)]
  #[tauri::command]
  pub async fn open_compose_window(
      app: AppHandle,
      #[allow(non_snake_case)] accountId: String,
      #[allow(non_snake_case)] dataDirectory: String,
  ) -> Result<(), String> {
      let data_dir = PathBuf::from(&dataDirectory);
      let accounts_json = load_accounts_json(&app);
      let esc_close_enabled = load_popup_esc_close_enabled(&app);
      let popup_init = crate::inject::build_popup_init_script(
          &accounts_json,
          &accountId,
          "",
          esc_close_enabled,
      );
      let compose_label = format!("compose-{}", uuid::Uuid::new_v4());

      let window = app.get_window("main").ok_or("main window not found")?;
      let size = window.inner_size().map_err(|e| e.to_string())?;
      let scale = window.scale_factor().unwrap_or(1.0);
      let logical_w = size.width as f64 / scale;
      let logical_h = size.height as f64 / scale;

      window
          .add_child(
              WebviewBuilder::new(
                  &compose_label,
                  WebviewUrl::External(parse_url("https://x.com/compose/post")?),
              )
              .initialization_script(&popup_init)
              .data_directory(data_dir),
              LogicalPosition::new(0.0, 0.0),
              LogicalSize::new(logical_w, logical_h),
          )
          .map_err(|e| e.to_string())?;

      Ok(())
  }
  ```

- [ ] **Step 4: Verify Rust compiles**

  ```bash
  cd src-tauri && cargo check
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add src-tauri/src/commands/webview.rs
  git commit -m "feat: add mobile fullscreen WebView implementations for popup and compose commands"
  ```

---

### Task 5: Mobile Account Login Command (Rust)

**Files:**

- Modify: `src-tauri/src/commands/account.rs`

- [ ] **Step 1: Wrap existing open_add_account_window with `#[cfg(desktop)]`**

  Add `#[cfg(desktop)]` attribute above the existing `#[tauri::command]` for `open_add_account_window`.

- [ ] **Step 2: Add mobile implementation immediately after**

  ```rust
  #[cfg(mobile)]
  #[tauri::command]
  pub async fn open_add_account_window(app: AppHandle) -> Result<String, String> {
      let account_id = uuid::Uuid::new_v4().to_string();
      let window_label = format!("add-account-{}", &account_id[..8]);

      let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
      let data_dir = app_data
          .join("accounts")
          .join(format!("account-{}", &account_id));
      std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;

      let window = app.get_window("main").ok_or("main window not found")?;
      let size = window.inner_size().map_err(|e| e.to_string())?;
      let scale = window.scale_factor().unwrap_or(1.0);
      let logical_w = size.width as f64 / scale;
      let logical_h = size.height as f64 / scale;

      window
          .add_child(
              WebviewBuilder::new(
                  &window_label,
                  WebviewUrl::External(
                      "https://x.com/login"
                          .parse()
                          .map_err(|e: url::ParseError| e.to_string())?,
                  ),
              )
              .data_directory(data_dir.clone()),
              LogicalPosition::new(0.0, 0.0),
              LogicalSize::new(logical_w, logical_h),
          )
          .map_err(|e| e.to_string())?;

      let app_clone = app.clone();
      let window_label_clone = window_label.clone();
      tokio::spawn(async move {
          let mut notified = false;
          loop {
              tokio::time::sleep(std::time::Duration::from_millis(500)).await;
              match app_clone.get_webview(&window_label_clone) {
                  Some(w) => {
                      if let Ok(url) = w.url() {
                          if !notified && url.path() == "/home" {
                              notified = true;
                              let _ = app_clone.emit("account-login-complete", ());
                          }
                      }
                  }
                  None => break,
              }
          }
      });

      Ok(serde_json::json!({
          "accountId": account_id,
          "dataDirectory": data_dir.to_string_lossy(),
          "windowLabel": window_label,
      })
      .to_string())
  }
  ```

  Note: `WebviewBuilder` and `WebviewUrl` must be imported. Add to the top of `account.rs`:

  ```rust
  use tauri::{AppHandle, Emitter, Manager, WebviewBuilder, WebviewUrl};
  ```

  (Replace the existing `use tauri::{AppHandle, Emitter, Manager, WebviewUrl};` line.)

- [ ] **Step 3: Verify Rust compiles**

  ```bash
  cd src-tauri && cargo check
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add src-tauri/src/commands/account.rs
  git commit -m "feat: add mobile fullscreen WebView implementation for account login"
  ```

---

### Task 6: Add isMobile to useAppStore

**Files:**

- Modify: `src/store/useAppStore.ts`
- Modify: `src/store/useAppStore.test.ts`

- [ ] **Step 1: Write the failing tests**

  Add to the end of `src/store/useAppStore.test.ts`, inside the existing `describe("useAppStore", ...)` block:

  ```typescript
  it("isMobile のデフォルト値は false", () => {
    const { result } = renderHook(() => useAppStore());
    expect(result.current.isMobile).toBe(false);
  });

  it("setIsMobile で isMobile を変更できる", () => {
    const { result } = renderHook(() => useAppStore());
    act(() => {
      result.current.setIsMobile(true);
    });
    expect(result.current.isMobile).toBe(true);
  });
  ```

  Also update the `beforeEach` reset to include `isMobile: false`:

  ```typescript
  useAppStore.setState({
    accounts: [],
    columns: [],
    globalSettings: {
      /* existing values */
    },
    isLoaded: false,
    isMobile: false, // add this line
  });
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```bash
  npm test
  ```

  Expected: 2 new failures about `isMobile` and `setIsMobile` being undefined.

- [ ] **Step 3: Add isMobile to the store**

  In `src/store/useAppStore.ts`, update the `AppStore` interface:

  ```typescript
  interface AppStore {
    accounts: Account[];
    columns: Column[];
    globalSettings: GlobalSettings;
    isLoaded: boolean;
    isMobile: boolean;
    sidebarExpanded: boolean;
    setSidebarExpanded: (v: boolean) => void;
    setIsMobile: (v: boolean) => void;
    loadSettings: () => Promise<void>;
    saveSettings: () => Promise<void>;
    addAccount: (account: Account) => void;
    removeAccount: (id: string) => void;
    addColumn: (column: Column) => void;
    removeColumn: (id: string) => void;
    updateColumn: (id: string, patch: Partial<Column>) => void;
    updateGlobalSettings: (patch: Partial<GlobalSettings>) => void;
    moveColumn: (columnId: string, direction: "left" | "right") => void;
    replaceColumns: (columns: Column[]) => void;
  }
  ```

  In `create<AppStore>((set, get) => ({`, add:

  ```typescript
  isMobile: false,
  setIsMobile: (v) => set({ isMobile: v }),
  ```

- [ ] **Step 4: Run tests to confirm they pass**

  ```bash
  npm test
  ```

  Expected: all tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add src/store/useAppStore.ts src/store/useAppStore.test.ts
  git commit -m "feat: add isMobile flag to useAppStore"
  ```

---

### Task 7: Add Mobile Column Management to useColumns

**Files:**

- Modify: `src/hooks/useColumns.ts`
- Modify: `src/hooks/useColumns.test.ts`

- [ ] **Step 1: Write failing test for MOBILE_TAB_BAR_HEIGHT export**

  Add to `src/hooks/useColumns.test.ts`:

  ```typescript
  import { calculateGridBounds, MOBILE_TAB_BAR_HEIGHT } from "./useColumns";

  // ...existing tests...

  describe("MOBILE_TAB_BAR_HEIGHT", () => {
    it("56 px で定義されている", () => {
      expect(MOBILE_TAB_BAR_HEIGHT).toBe(56);
    });
  });
  ```

- [ ] **Step 2: Run test to confirm it fails**

  ```bash
  npm test
  ```

  Expected: FAIL — `MOBILE_TAB_BAR_HEIGHT` is not exported.

- [ ] **Step 3: Add MOBILE_TAB_BAR_HEIGHT constant and mobile state to useColumns.ts**

  At the top of `src/hooks/useColumns.ts`, after the existing constants:

  ```typescript
  export const MOBILE_TAB_BAR_HEIGHT = 56;
  ```

  Inside `useColumns()`, after the existing `useState` for `columnBounds`:

  ```typescript
  const [activeColumnId, setActiveColumnIdState] = useState<string | null>(
    null,
  );
  ```

- [ ] **Step 4: Add setActiveColumn function**

  Inside `useColumns()`, add after `setActiveColumnIdState`:

  ```typescript
  const setActiveColumn = useCallback(async (id: string) => {
    setActiveColumnIdState(id);
    const { columns: currentColumns } = useAppStore.getState();
    await Promise.all(
      currentColumns.map((col) => {
        const isActive = col.id === id;
        return invoke("resize_column_webview", {
          bounds: {
            columnId: col.id,
            x: isActive ? 0 : -99999,
            y: isActive ? MOBILE_TAB_BAR_HEIGHT : 0,
            width: window.innerWidth,
            height: window.innerHeight - MOBILE_TAB_BAR_HEIGHT,
          },
        }).catch(console.error);
      }),
    );
  }, []);
  ```

- [ ] **Step 5: Add mobile path to restoreColumns**

  Replace the existing `restoreColumns` with:

  ```typescript
  const restoreColumns = useCallback(async (sidebarWidth: number) => {
    if (!containerRef.current) return;
    const containerHeight = containerRef.current.clientHeight;
    const scrollLeft = scrollbarRef.current?.scrollLeft ?? 0;
    const {
      columns: currentColumns,
      accounts: currentAccounts,
      isMobile,
    } = useAppStore.getState();

    if (isMobile) {
      const sortedByOrder = [...currentColumns].sort(
        (a, b) => a.order - b.order,
      );
      const firstColumn = sortedByOrder[0];
      for (const column of sortedByOrder) {
        const account = currentAccounts.find((a) => a.id === column.accountId);
        if (!account) continue;
        const isFirst = column.id === firstColumn?.id;
        await invoke("create_column_webview", {
          args: {
            column,
            dataDirectory: account.dataDirectory,
            x: isFirst ? 0 : -99999,
            y: isFirst ? MOBILE_TAB_BAR_HEIGHT : 0,
            width: window.innerWidth,
            height: window.innerHeight - MOBILE_TAB_BAR_HEIGHT,
          },
        }).catch(console.error);
      }
      if (firstColumn) {
        setActiveColumnIdState(firstColumn.id);
      }
      return;
    }

    const bounds = calculateGridBounds(currentColumns, {
      containerHeight,
      scrollLeft,
      sidebarWidth,
      headerHeight: HEADER_HEIGHT,
      scrollbarHeight: SCROLLBAR_HEIGHT,
    });

    setColumnBounds(bounds);

    for (const column of currentColumns) {
      const account = currentAccounts.find((a) => a.id === column.accountId);
      if (!account) continue;
      const b = bounds[column.id];
      if (!b) continue;
      await invoke("create_column_webview", {
        args: {
          column,
          dataDirectory: account.dataDirectory,
          ...b,
        },
      }).catch(console.error);
    }
  }, []);
  ```

- [ ] **Step 6: Add mobile path to handleAddColumn**

  Replace the existing `handleAddColumn` with:

  ```typescript
  const handleAddColumn = useCallback(
    async (column: Column) => {
      const account = accounts.find((a) => a.id === column.accountId);
      if (!account || !containerRef.current) return;

      addColumn(column);

      const { isMobile } = useAppStore.getState();
      if (isMobile) {
        await invoke("create_column_webview", {
          args: {
            column,
            dataDirectory: account.dataDirectory,
            x: -99999,
            y: 0,
            width: window.innerWidth,
            height: window.innerHeight - MOBILE_TAB_BAR_HEIGHT,
          },
        });
        if (activeColumnId === null) {
          await setActiveColumn(column.id);
        }
        return;
      }

      const containerHeight = containerRef.current.clientHeight;
      const scrollLeft = scrollbarRef.current?.scrollLeft ?? 0;
      const { sidebarExpanded, columns: updatedColumns } =
        useAppStore.getState();
      const sidebarWidth = sidebarExpanded
        ? SIDEBAR_EXPANDED_WIDTH
        : SIDEBAR_COLLAPSED_WIDTH;

      const bounds = calculateGridBounds(updatedColumns, {
        containerHeight,
        scrollLeft,
        sidebarWidth,
        headerHeight: HEADER_HEIGHT,
        scrollbarHeight: SCROLLBAR_HEIGHT,
      });

      setColumnBounds(bounds);
      const b = bounds[column.id];
      if (!b) return;

      await invoke("create_column_webview", {
        args: { column, dataDirectory: account.dataDirectory, ...b },
      });
    },
    [accounts, addColumn, activeColumnId, setActiveColumn],
  );
  ```

- [ ] **Step 7: Add mobile path to recalculateAllBounds**

  Replace the existing `recalculateAllBounds` with:

  ```typescript
  const recalculateAllBounds = useCallback(async () => {
    const { isMobile } = useAppStore.getState();
    if (isMobile) {
      if (activeColumnId) {
        await setActiveColumn(activeColumnId);
      }
      return;
    }

    if (!containerRef.current) return;
    const containerHeight = containerRef.current.clientHeight;
    const scrollLeft = scrollbarRef.current?.scrollLeft ?? 0;
    const { columns: currentColumns, sidebarExpanded } = useAppStore.getState();
    const sidebarWidth = sidebarExpanded
      ? SIDEBAR_EXPANDED_WIDTH
      : SIDEBAR_COLLAPSED_WIDTH;

    const bounds = calculateGridBounds(currentColumns, {
      containerHeight,
      scrollLeft,
      sidebarWidth,
      headerHeight: HEADER_HEIGHT,
      scrollbarHeight: SCROLLBAR_HEIGHT,
    });

    setColumnBounds(bounds);

    await Promise.all(
      Object.entries(bounds).map(([columnId, b]) =>
        invoke("resize_column_webview", {
          bounds: { columnId, ...b },
        }).catch(console.error),
      ),
    );
  }, [activeColumnId, setActiveColumn]);
  ```

- [ ] **Step 8: Add mobile path to handleRemoveColumn**

  Replace the existing `handleRemoveColumn` with:

  ```typescript
  const handleRemoveColumn = useCallback(
    async (columnId: string) => {
      await invoke("remove_column_webview", { columnId });
      removeColumn(columnId);
      const { isMobile, columns: remainingColumns } = useAppStore.getState();
      if (isMobile) {
        if (activeColumnId === columnId) {
          const next = remainingColumns.find((c) => c.id !== columnId);
          if (next) {
            await setActiveColumn(next.id);
          } else {
            setActiveColumnIdState(null);
          }
        }
        return;
      }
      await recalculateAllBounds();
    },
    [removeColumn, recalculateAllBounds, activeColumnId, setActiveColumn],
  );
  ```

- [ ] **Step 9: Expose activeColumnId and setActiveColumn in return value**

  In the `return` statement at the bottom of `useColumns()`, add:

  ```typescript
  return {
    columns,
    columnBounds,
    containerRef,
    scrollbarRef,
    restoreColumns,
    handleAddColumn,
    handleRemoveColumn,
    handleMoveColumn,
    handleUpdateColumn,
    recalculateAllBounds,
    hideColumnWebviews,
    handleScrollbarScroll,
    activeColumnId,
    setActiveColumn,
  };
  ```

- [ ] **Step 10: Run tests to confirm they pass**

  ```bash
  npm test
  ```

  Expected: all tests pass (existing `calculateGridBounds` tests + new `MOBILE_TAB_BAR_HEIGHT` test).

- [ ] **Step 11: Commit**

  ```bash
  git add src/hooks/useColumns.ts src/hooks/useColumns.test.ts
  git commit -m "feat: add mobile tab switching support to useColumns (activeColumnId, setActiveColumn)"
  ```

---

### Task 8: Create MobileTabBar Component

**Files:**

- Create: `src/components/MobileTabBar/MobileTabBar.tsx`
- Create: `src/components/MobileTabBar/MobileTabBar.module.scss`
- Create: `src/components/MobileTabBar/MobileTabBar.test.tsx`

- [ ] **Step 1: Write failing tests**

  Create `src/components/MobileTabBar/MobileTabBar.test.tsx`:

  ```typescript
  import { describe, it, expect, vi } from "vitest";
  import { render, screen } from "@testing-library/react";
  import userEvent from "@testing-library/user-event";
  import { MobileTabBar } from "./MobileTabBar";
  import type { Column, Account } from "../../types";

  const baseSettings = {
    autoReloadEnabled: true,
    autoReloadInterval: 600,
    showCountdown: true,
    areaRemoveEnabled: true,
    showCustomMenu: false,
    customCSS: "",
    visibleLinks: [],
  };

  const acc1: Account = {
    id: "acc-1",
    label: "アカウント1",
    dataDirectory: "/data/1",
    color: "#1d9bf0",
    createdAt: "2026-01-01T00:00:00Z",
  };

  const col1: Column = {
    id: "col-1",
    accountId: "acc-1",
    pageType: "home",
    width: 350,
    order: 0,
    gridRow: 1,
    gridCol: 1,
    heightMode: "auto",
    settings: baseSettings,
  };

  const col2: Column = {
    id: "col-2",
    accountId: "acc-1",
    pageType: "notifications",
    width: 350,
    order: 1,
    gridRow: 1,
    gridCol: 2,
    heightMode: "auto",
    settings: baseSettings,
  };

  describe("MobileTabBar", () => {
    it("各列のタブが表示される", () => {
      render(
        <MobileTabBar
          columns={[col1, col2]}
          accounts={[acc1]}
          activeColumnId="col-1"
          onSelectColumn={vi.fn()}
          onOpenSettings={vi.fn()}
        />,
      );
      expect(screen.getByText("ホーム")).toBeInTheDocument();
      expect(screen.getByText("通知")).toBeInTheDocument();
    });

    it("タブをタップすると onSelectColumn が列 ID で呼ばれる", async () => {
      const onSelect = vi.fn();
      render(
        <MobileTabBar
          columns={[col1, col2]}
          accounts={[acc1]}
          activeColumnId="col-1"
          onSelectColumn={onSelect}
          onOpenSettings={vi.fn()}
        />,
      );
      await userEvent.click(screen.getByText("通知"));
      expect(onSelect).toHaveBeenCalledWith("col-2");
    });

    it("カスタムラベルがある場合は pageType 名の代わりに表示される", () => {
      const colWithLabel: Column = { ...col1, label: "マイホーム" };
      render(
        <MobileTabBar
          columns={[colWithLabel]}
          accounts={[acc1]}
          activeColumnId="col-1"
          onSelectColumn={vi.fn()}
          onOpenSettings={vi.fn()}
        />,
      );
      expect(screen.getByText("マイホーム")).toBeInTheDocument();
      expect(screen.queryByText("ホーム")).not.toBeInTheDocument();
    });

    it("設定ボタンをクリックすると onOpenSettings が列 ID で呼ばれる", async () => {
      const onSettings = vi.fn();
      render(
        <MobileTabBar
          columns={[col1]}
          accounts={[acc1]}
          activeColumnId="col-1"
          onSelectColumn={vi.fn()}
          onOpenSettings={onSettings}
        />,
      );
      await userEvent.click(screen.getByRole("button", { name: /設定/ }));
      expect(onSettings).toHaveBeenCalledWith("col-1");
    });
  });
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```bash
  npm test
  ```

  Expected: FAIL — `MobileTabBar` module not found.

- [ ] **Step 3: Create MobileTabBar.tsx**

  Create `src/components/MobileTabBar/MobileTabBar.tsx`:

  ```tsx
  import React from "react";
  import type { Column, Account, PageType } from "../../types";
  import styles from "./MobileTabBar.module.scss";

  function getTabLabel(column: Column): string {
    if (column.label) return column.label;
    const labels: Record<PageType, string> = {
      home: "ホーム",
      notifications: "通知",
      search: column.searchQuery ? `検索: ${column.searchQuery}` : "検索",
      list: "リスト",
      custom: column.customUrl ?? "カスタム",
    };
    return labels[column.pageType];
  }

  interface Props {
    columns: Column[];
    accounts: Account[];
    activeColumnId: string | null;
    onSelectColumn: (id: string) => void;
    onOpenSettings: (id: string) => void;
  }

  export const MobileTabBar: React.FC<Props> = ({
    columns,
    accounts,
    activeColumnId,
    onSelectColumn,
    onOpenSettings,
  }) => {
    const sorted = [...columns].sort((a, b) => a.order - b.order);

    return (
      <div className={styles.tabBar}>
        {sorted.map((col) => {
          const account = accounts.find((a) => a.id === col.accountId);
          const isActive = col.id === activeColumnId;
          return (
            <div
              key={col.id}
              className={`${styles.tab} ${isActive ? styles.active : ""}`}
              onClick={() => onSelectColumn(col.id)}
            >
              <div
                className={styles.accountColor}
                style={{ backgroundColor: account?.color ?? "#888" }}
              />
              <span className={styles.label}>{getTabLabel(col)}</span>
              <button
                className={styles.settingsBtn}
                aria-label="設定"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenSettings(col.id);
                }}
              >
                ⚙
              </button>
            </div>
          );
        })}
      </div>
    );
  };
  ```

- [ ] **Step 4: Create MobileTabBar.module.scss**

  Create `src/components/MobileTabBar/MobileTabBar.module.scss`:

  ```scss
  .tabBar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: 56px;
    display: flex;
    overflow-x: auto;
    overflow-y: hidden;
    background: #1c1c1e;
    border-top: 1px solid rgba(255, 255, 255, 0.12);
    z-index: 100;
    -webkit-overflow-scrolling: touch;

    &::-webkit-scrollbar {
      display: none;
    }
  }

  .tab {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    padding: 0 12px;
    cursor: pointer;
    white-space: nowrap;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.55);
    min-width: 80px;
    user-select: none;

    &.active {
      color: #fff;
      background: rgba(255, 255, 255, 0.08);
    }
  }

  .accountColor {
    width: 4px;
    height: 20px;
    border-radius: 2px;
    margin-right: 8px;
    flex-shrink: 0;
  }

  .label {
    max-width: 90px;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
  }

  .settingsBtn {
    margin-left: 6px;
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    padding: 2px 4px;
    font-size: 14px;
    opacity: 0.5;
    flex-shrink: 0;

    &:hover {
      opacity: 1;
    }
  }
  ```

- [ ] **Step 5: Run tests to confirm they pass**

  ```bash
  npm test
  ```

  Expected: all tests pass.

- [ ] **Step 6: Commit**

  ```bash
  git add src/components/MobileTabBar/
  git commit -m "feat: add MobileTabBar component for Android tab navigation"
  ```

---

### Task 9: Wire Up App.tsx

**Files:**

- Modify: `src/App.tsx`

- [ ] **Step 1: Add isMobile detection on startup**

  In `src/App.tsx`, add the import at the top with other imports:

  ```typescript
  import { platform } from "@tauri-apps/plugin-os";
  ```

  Add `isMobile` and `setIsMobile` to the `useAppStore` destructure:

  ```typescript
  const {
    loadSettings,
    isLoaded,
    accounts,
    globalSettings,
    updateGlobalSettings,
    sidebarExpanded,
    setSidebarExpanded,
    replaceColumns,
    isMobile,
    setIsMobile,
  } = useAppStore();
  ```

  Add `activeColumnId` and `setActiveColumn` to the `useColumns` destructure:

  ```typescript
  const {
    columns,
    columnBounds,
    containerRef,
    scrollbarRef,
    restoreColumns,
    handleAddColumn,
    handleRemoveColumn,
    handleMoveColumn,
    handleUpdateColumn,
    recalculateAllBounds,
    hideColumnWebviews,
    handleScrollbarScroll,
    activeColumnId,
    setActiveColumn,
  } = useColumns();
  ```

  Add platform detection effect (place before the `loadSettings` effect):

  ```typescript
  useEffect(() => {
    platform()
      .then((p) => setIsMobile(p === "android"))
      .catch(() => {});
  }, []);
  ```

- [ ] **Step 2: Add MobileTabBar import**

  ```typescript
  import { MobileTabBar } from "./components/MobileTabBar/MobileTabBar";
  ```

- [ ] **Step 3: Conditionally render Sidebar vs MobileTabBar**

  In the JSX `return`, replace `<Sidebar ... />` with:

  ```tsx
  {
    !isMobile && (
      <Sidebar
        columns={columns}
        accounts={accounts}
        expanded={sidebarExpanded}
        onToggleExpand={handleToggleSidebar}
        onAddColumn={() => setShowAddColumn(true)}
        onAccountManager={() => setShowAccountManager(true)}
        onAppSettings={() => setShowAppSettings(true)}
        onComposeTweet={handleComposeTweet}
        onOpenLinkPopup={handleOpenLinkPopup}
        onJumpToColumn={handleJumpToColumn}
      />
    );
  }
  {
    isMobile && (
      <MobileTabBar
        columns={columns}
        accounts={accounts}
        activeColumnId={activeColumnId}
        onSelectColumn={setActiveColumn}
        onOpenSettings={setSettingsColumnId}
      />
    );
  }
  ```

- [ ] **Step 4: Hide ColumnHeader on mobile**

  In the `columns.map(...)` section, wrap the `<div className={styles.columnHeaderWrapper}>` with a mobile check:

  ```tsx
  {
    columns.map((column) => {
      if (isMobile) return null; // タブバーが代替するため非表示
      const account = accounts.find((a) => a.id === column.accountId);
      const bounds = columnBounds[column.id];
      if (!account || !bounds) return null;
      const idx = sortedColumns.findIndex((c) => c.id === column.id);
      return (
        <div key={column.id} /* ... */>
          <ColumnHeader /* ... */ />
        </div>
      );
    });
  }
  ```

- [ ] **Step 5: Verify TypeScript compiles**

  ```bash
  npx tsc --noEmit
  ```

  Expected: no type errors.

- [ ] **Step 6: Run all tests**

  ```bash
  npm test
  ```

  Expected: all tests pass.

- [ ] **Step 7: Commit**

  ```bash
  git add src/App.tsx
  git commit -m "feat: integrate MobileTabBar and platform detection in App.tsx"
  ```

---

## Post-Implementation Verification

After completing all tasks, manually verify on Android (emulator or device):

1. `npm run tauri android init` — generates `src-tauri/gen/android/`
2. `npm run tauri android dev` — launches on connected device/emulator
3. Verify: columns load on startup, first column visible
4. Verify: tab bar appears at bottom, tapping switches column (previous column state preserved)
5. Verify: アカウント追加 → fullscreen login WebView opens, closes after login
6. Verify: ポップアップ → fullscreen WebView opens, back/close returns to column with state preserved
7. Verify: desktop build still works: `npm run tauri:dev`

**Known risk to verify:** Multiple account session isolation via `data_directory` on Android. If sessions are shared, report as a follow-up issue.
