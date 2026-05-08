# Android タブバー修正 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 注入タブバー（mobile_tab_bar.js）を廃止し、React MobileTabBar を画面下部 56px に常時表示することで、Android でのタブバー操作を正常化する。

**Architecture:** column WebView の height を `window.innerHeight - MOBILE_TAB_BAR_HEIGHT` に縮めて下部 56px を開け、main React WebView 内の MobileTabBar コンポーネントをその領域に表示する。x.com 外部 WebView からの Tauri IPC には一切依存しない。

**Tech Stack:** Tauri v2, React 19, TypeScript, Rust, Vitest

---

## File Structure

| ファイル | 変更種別 | 内容 |
|---|---|---|
| `src-tauri/src/inject/mod.rs` | Modify | `build_mobile_column_init_script` を削除 |
| `src-tauri/src/commands/webview.rs` | Modify | `CreateWebviewArgs` を簡略化、`switch_mobile_column`・`open_mobile_dialog` を削除 |
| `src-tauri/src/lib.rs` | Modify | invoke_handler から 2 コマンドを削除 |
| `src-tauri/src/inject/_src/mobile_tab_bar.ts` | Delete | column への注入廃止 |
| `src-tauri/src/inject/mobile_tab_bar.js` | Delete | 同上（ビルド成果物） |
| `src/hooks/useColumns.ts` | Modify | height 修正・注入タブバー関連ロジック削除 |
| `src/App.tsx` | Modify | MobileTabBar 常時表示・不要イベントリスナー削除 |

---

### Task 1: Rust — inject スクリプトと不要コマンドを削除

**Files:**
- Modify: `src-tauri/src/inject/mod.rs`
- Modify: `src-tauri/src/commands/webview.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: `inject/mod.rs` から `build_mobile_column_init_script` を削除する**

  `src-tauri/src/inject/mod.rs` の内容全体を以下に置き換える（`build_mobile_column_init_script` 関数を削除、他はそのまま）:

  ```rust
  // src-tauri/src/inject/mod.rs

  pub fn build_init_script(
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
      let image_popup = include_str!("image_popup.js");
      let context_menu = include_str!("context_menu.js");
      let scroll_event = include_str!("scroll_event.js");
      let video_control = include_str!("video_control.js");

      let visible_links_json = serde_json::to_string(visible_links).unwrap_or_else(|_| "[]".to_string());
      let config = format!(
          "window.__multiColumnXConfig = {{ areaRemoveEnabled: {}, showCustomMenu: {}, visibleLinks: {} }};",
          area_remove_enabled,
          show_custom_menu,
          visible_links_json
      );

      let header_part = if area_remove_enabled { format!("\n{}", header_customizer) } else { String::new() };
      let auto_reload_part = if auto_reload_enabled { format!("\n{}", auto_reload) } else { String::new() };
      let video_control_part = if video_auto_play_stop_enabled { format!("\n{}", video_control) } else { String::new() };

      let mut script = format!(
          "{}\n{}{}{}{}{}{}{}{}",
          config, tab_selector, header_part, auto_reload_part, video_control_part, custom_css_js, image_popup, context_menu, scroll_event
      );

      if !custom_css.is_empty() {
          script.push_str(&format!(
              "\nwindow.__multiColumnX.applyCustomCSS({:?});",
              custom_css
          ));
      }

      script
  }

  pub fn build_popup_init_script(accounts_json: &str, current_account_id: &str, target_href: &str, esc_close_enabled: bool) -> String {
      let popup_toolbar = include_str!("popup_toolbar.js");
      format!(
          "window.__tvAccounts={};window.__tvCurrentAccountId={:?};window.__tvTargetHref={:?};window.__tvEscCloseEnabled={};\n{}",
          accounts_json, current_account_id, target_href, esc_close_enabled, popup_toolbar
      )
  }
  ```

- [ ] **Step 2: `webview.rs` — `CreateWebviewArgs` から mobile_tabs / mobile_active_id を削除する**

  `src-tauri/src/commands/webview.rs` の `CreateWebviewArgs` 構造体を以下に置き換える:

  ```rust
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
  ```

- [ ] **Step 3: `webview.rs` — mobile `create_column_webview` を簡略化する**

  `#[cfg(mobile)]` の `create_column_webview` 全体を以下に置き換える。`build_mobile_column_init_script` 分岐と `android_bridge` 参照を削除し、通常の `build_init_script` を使用する:

  ```rust
  #[cfg(mobile)]
  #[tauri::command]
  pub async fn create_column_webview(app: AppHandle, args: CreateWebviewArgs) -> Result<(), String> {
      let url = resolve_url(&args.column);
      let label = webview_label(&args.column.id);
      let data_dir = PathBuf::from(&args.data_directory);

      let video_auto_play_stop_enabled = load_video_auto_play_stop_enabled(&app);
      let init_script = build_init_script(
          args.column.settings.area_remove_enabled,
          args.column.settings.show_custom_menu,
          args.column.settings.auto_reload_enabled,
          video_auto_play_stop_enabled,
          &args.column.settings.custom_css,
          &args.column.settings.visible_links,
      );

      let webview = tauri::WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(parse_url(&url)?))
          .initialization_script(&init_script)
          .data_directory(data_dir)
          .inner_size(args.width, args.height)
          .position(args.x, args.y)
          .build()
          .map_err(|e| e.to_string())?;

      if args.x < 0.0 {
          let _ = webview.hide();
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
  ```

- [ ] **Step 4: `webview.rs` — `switch_mobile_column` と `open_mobile_dialog` を削除する**

  以下の 2 関数を `webview.rs` から完全に削除する:

  ```rust
  // 削除対象1
  #[tauri::command]
  pub async fn switch_mobile_column(app: AppHandle, column_id: String) -> Result<(), String> {
      app.emit("mobile-switch-column", column_id)
          .map_err(|e| e.to_string())
  }

  // 削除対象2
  #[tauri::command]
  pub async fn open_mobile_dialog(
      app: AppHandle,
      dialog: String,
      column_id: Option<String>,
  ) -> Result<(), String> {
      app.emit(
          "mobile-open-dialog",
          serde_json::json!({ "dialog": dialog, "columnId": column_id }),
      )
      .map_err(|e| e.to_string())
  }
  ```

- [ ] **Step 5: `lib.rs` — invoke_handler から 2 コマンドを削除する**

  `src-tauri/src/lib.rs` の `.invoke_handler(tauri::generate_handler![...])` ブロックから以下 2 行を削除する:

  ```rust
  // 削除
  commands::webview::switch_mobile_column,
  commands::webview::open_mobile_dialog,
  ```

- [ ] **Step 6: Rust コンパイル確認**

  ```powershell
  cd src-tauri && cargo check
  ```

  期待: エラーなし（警告は可）

- [ ] **Step 7: Commit**

  ```powershell
  git add src-tauri/src/inject/mod.rs src-tauri/src/commands/webview.rs src-tauri/src/lib.rs
  git commit -m "refactor: 注入タブバー関連の Rust コードを削除"
  ```

---

### Task 2: inject ファイルを削除する

**Files:**
- Delete: `src-tauri/src/inject/_src/mobile_tab_bar.ts`
- Delete: `src-tauri/src/inject/mobile_tab_bar.js`

- [ ] **Step 1: ファイルを削除する**

  ```powershell
  Remove-Item "src-tauri\src\inject\_src\mobile_tab_bar.ts"
  Remove-Item "src-tauri\src\inject\mobile_tab_bar.js"
  ```

- [ ] **Step 2: inject ビルドが通ることを確認する**

  ```powershell
  npm run build:inject
  ```

  期待: エラーなし。`src-tauri/src/inject/` 配下に `mobile_tab_bar.js` が生成されないことを確認する。

- [ ] **Step 3: Commit**

  ```powershell
  git add -A
  git commit -m "refactor: mobile_tab_bar inject ファイルを削除"
  ```

---

### Task 3: useColumns.ts — 高さ修正と注入タブバーロジックを削除する

**Files:**
- Modify: `src/hooks/useColumns.ts`

- [ ] **Step 1: `buildMobileTabsJson` 関数を削除する**

  `src/hooks/useColumns.ts` の以下の関数を丸ごと削除する:

  ```typescript
  function buildMobileTabsJson(columns: Column[]): string {
    return JSON.stringify(
      columns.map((col) => ({
        id: col.id,
        label: getMobileTabLabel(col),
        order: col.order,
      })),
    );
  }
  ```

- [ ] **Step 2: `setActiveColumn` を修正する**

  `setActiveColumn` を以下に置き換える（height 変更 + `eval_in_webview` ブロック削除）:

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
            y: 0,
            width: window.innerWidth,
            height: window.innerHeight - MOBILE_TAB_BAR_HEIGHT,
          },
        }).catch(console.error);
      }),
    );
  }, []);
  ```

- [ ] **Step 3: `restoreColumns` の mobile ブランチを修正する**

  `restoreColumns` 内の `if (isMobile) { ... return; }` ブロックを以下に置き換える（`buildMobileTabsJson`・`getMobileInsets`・`mobileTabs`・`mobileActiveId` を削除）:

  ```typescript
  if (isMobile) {
    const sortedByOrder = [...currentColumns].sort((a, b) => a.order - b.order);
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
          y: 0,
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
  ```

- [ ] **Step 4: `handleAddColumn` の mobile ブランチを修正する**

  `handleAddColumn` 内の `if (isMobile) { ... return; }` ブロックを以下に置き換える（不要な変数・`getMobileInsets`・`eval_in_webview` ブロックを削除）:

  ```typescript
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
    }).catch(console.error);
    if (activeColumnId === null) {
      await setActiveColumn(column.id);
    }
    return;
  }
  ```

- [ ] **Step 5: `hideColumnWebviews` の mobile 時 height を修正する**

  `hideColumnWebviews` 内の `isMobile` 三項演算子の mobile 側を修正する:

  ```typescript
  // Before
  ? { columnId: col.id, x: -99999, y: 0, width: window.innerWidth, height: window.innerHeight }

  // After
  ? { columnId: col.id, x: -99999, y: 0, width: window.innerWidth, height: window.innerHeight - MOBILE_TAB_BAR_HEIGHT }
  ```

- [ ] **Step 6: `handleRemoveColumn` の `eval_in_webview` ブロックを削除する**

  `handleRemoveColumn` 内の `if (isMobile) { ... return; }` ブロックを以下に置き換える（`eval_in_webview` でタブバーを更新していたコードを削除）:

  ```typescript
  if (isMobile) {
    if (activeColumnId === columnId) {
      const next = [...remainingColumns].sort((a, b) => a.order - b.order)[0];
      if (next) {
        await setActiveColumn(next.id);
      } else {
        setActiveColumnIdState(null);
      }
    }
    return;
  }
  ```

- [ ] **Step 7: TypeScript の型エラーがないことを確認する**

  ```powershell
  npx tsc --noEmit
  ```

  期待: エラーなし

- [ ] **Step 8: 既存テストが通ることを確認する**

  ```powershell
  npm test
  ```

  期待: 全テスト PASS

- [ ] **Step 9: Commit**

  ```powershell
  git add src/hooks/useColumns.ts
  git commit -m "refactor: column WebView 高さを -56px に修正し注入タブバーロジックを削除"
  ```

---

### Task 4: App.tsx — MobileTabBar を常時表示し不要リスナーを削除する

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: `mobile-switch-column` イベントリスナーを削除する**

  `src/App.tsx` から以下の `useEffect` ブロック全体を削除する:

  ```typescript
  // Mobile: column WebView 内のタブバーからカラム切り替え要求を受信
  useEffect(() => {
    if (!isMobile) return;
    const unlisten = listen<string>("mobile-switch-column", (e) => {
      setActiveColumn(e.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [isMobile, setActiveColumn]);
  ```

- [ ] **Step 2: `mobile-open-dialog` イベントリスナーを削除する**

  `src/App.tsx` から以下の `useEffect` ブロック全体を削除する:

  ```typescript
  // Mobile: column WebView 内のタブバーからダイアログ開示要求を受信
  useEffect(() => {
    if (!isMobile) return;
    const unlisten = listen<{ dialog: string; columnId?: string | null }>(
      "mobile-open-dialog",
      (e) => {
        if (e.payload.dialog === "add_column") {
          setShowAddColumn(true);
        } else if (e.payload.dialog === "account_manager") {
          setShowAccountManager(true);
        } else if (e.payload.dialog === "column_settings" && e.payload.columnId) {
          setSettingsColumnId(e.payload.columnId);
        }
      },
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [isMobile]);
  ```

- [ ] **Step 3: MobileTabBar を `columns.length === 0` 条件なしで常時表示する**

  `src/App.tsx` の JSX 内、以下の条件付きレンダリングを修正する:

  ```tsx
  // Before
  {isMobile && columns.length === 0 && (
    <MobileTabBar
      columns={columns}
      accounts={accounts}
      activeColumnId={activeColumnId}
      onSelectColumn={setActiveColumn}
      onOpenSettings={setSettingsColumnId}
      onAddColumn={() => setShowAddColumn(true)}
      onAccountManager={() => setShowAccountManager(true)}
    />
  )}

  // After
  {isMobile && (
    <MobileTabBar
      columns={columns}
      accounts={accounts}
      activeColumnId={activeColumnId}
      onSelectColumn={setActiveColumn}
      onOpenSettings={setSettingsColumnId}
      onAddColumn={() => setShowAddColumn(true)}
      onAccountManager={() => setShowAccountManager(true)}
    />
  )}
  ```

- [ ] **Step 4: `listen` のインポートが不要になった場合は削除する**

  `src/App.tsx` の先頭で `listen` が他の箇所（`webview-scroll` リスナー）でも使われているか確認する。`webview-scroll` リスナーは残すため、`listen` のインポートはそのまま維持する（削除不要）。

- [ ] **Step 5: TypeScript の型エラーがないことを確認する**

  ```powershell
  npx tsc --noEmit
  ```

  期待: エラーなし

- [ ] **Step 6: 既存テストが通ることを確認する**

  ```powershell
  npm test
  ```

  期待: 全テスト PASS

- [ ] **Step 7: Commit**

  ```powershell
  git add src/App.tsx
  git commit -m "feat: MobileTabBar を常時表示に変更し不要なモバイルイベントリスナーを削除"
  ```

---

### Task 5: Android ビルド確認

**Files:** なし（ビルド検証のみ）

- [ ] **Step 1: Android ビルドが通ることを確認する**

  Android ビルド環境がある場合:
  ```powershell
  npm run tauri:android:build
  ```

  環境がない場合は `cargo check` で代替（`#[cfg(mobile)]` ブロックは通常のデスクトップ向けチェックでは検証されないため、ビルド環境が必須）:
  ```powershell
  cd src-tauri && cargo check
  ```

- [ ] **Step 2: 実機/エミュレーターで動作確認する**

  確認項目:
  1. 起動後、カラムが 0 件でも MobileTabBar が表示される
  2. カラムを追加後、MobileTabBar が下部に表示され x.com コンテンツが上部に表示される
  3. タブをタップすると対象カラムに切り替わる（`setActiveColumn` が呼ばれ WebView が切り替わる）
  4. ⚙ボタンでカラム設定ダイアログが開く
  5. ＋ボタンでカラム追加ダイアログが開く
  6. 👤ボタンでアカウント管理ダイアログが開く
  7. デスクトップビルドに変化がないことを確認する（`npm run tauri:dev`）
