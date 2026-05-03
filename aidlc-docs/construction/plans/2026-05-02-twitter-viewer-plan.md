# Twitter Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** TweetDeck風のマルチカラムレイアウトでX（旧Twitter）を複数アカウント同時表示するTauriデスクトップアプリを構築する。

**Architecture:** Tauri v2のマルチWebview機能を使い、1つのメインウィンドウに複数のWebviewをバインドする。Rustバックエンドがコマンド経由でWebviewのライフサイクルを管理し、React Shell UIがカラム操作UIを提供する。Chrome拡張機能（twitter-utils）のロジックをinit_scriptとして各WebViewに注入する。

**Tech Stack:** Tauri v2, React 18, TypeScript, Vite, SCSS Modules, tauri-plugin-store, Vitest, @testing-library/react

---

## ファイル構成

```
twitter-viewer/
├── src/                                  # React Shell UI
│   ├── main.tsx                          # Reactエントリポイント
│   ├── App.tsx                           # メインレイアウト（カラム列 + 操作UI）
│   ├── App.module.scss
│   ├── types/
│   │   └── index.ts                      # Account, Column, PageType 等の型定義
│   ├── store/
│   │   └── useAppStore.ts                # tauri-plugin-store ラッパー + Zustand
│   ├── hooks/
│   │   ├── useColumns.ts                 # カラムCRUD + WebViewライフサイクル
│   │   └── useAccounts.ts                # アカウントCRUD
│   └── components/
│       ├── ColumnHeader/
│       │   ├── ColumnHeader.tsx          # カラムヘッダ（更新/設定/削除ボタン）
│       │   ├── ColumnHeader.module.scss
│       │   └── ColumnHeader.test.tsx
│       ├── AddColumnDialog/
│       │   ├── AddColumnDialog.tsx       # カラム追加ダイアログ
│       │   ├── AddColumnDialog.module.scss
│       │   └── AddColumnDialog.test.tsx
│       ├── AccountManager/
│       │   ├── AccountManager.tsx        # アカウント一覧・追加・削除
│       │   ├── AccountManager.module.scss
│       │   └── AccountManager.test.tsx
│       └── SettingsPanel/
│           ├── SettingsPanel.tsx         # グローバル設定・カスタムCSS
│           ├── SettingsPanel.module.scss
│           └── SettingsPanel.test.tsx
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/default.json
│   └── src/
│       ├── main.rs                       # Tauriエントリポイント
│       ├── lib.rs                        # app setup, plugin登録, コマンド登録
│       ├── state.rs                      # AppState（WebViewレジストリ）
│       ├── commands/
│       │   ├── mod.rs
│       │   ├── webview.rs                # create/remove/resize WebView
│       │   └── account.rs               # add/remove account
│       └── inject/
│           ├── mod.rs                    # スクリプトビルダー
│           ├── tab_selector.js           # タブ自動選択
│           ├── area_remove.js            # 不要領域非表示
│           ├── auto_reload.js            # 自動更新
│           ├── custom_css.js             # カスタムCSS注入
│           └── image_popup.js            # 画像/動画ポップアップ
├── index.html
├── vite.config.ts
├── vitest.config.ts
├── package.json
└── tsconfig.json
```

---

## Task 1: Tauri v2 プロジェクト初期化

**Files:**

- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`
- Create: `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`
- Create: `src/main.tsx`, `src/App.tsx`

- [ ] **Step 1: Tauri v2 + React + TypeScript プロジェクトを作成**

```bash
cd "c:\Users\fuku\Desktop\twitter-viewer"
npm create tauri-app@latest . -- --template react-ts --manager npm
```

プロンプトが出た場合：

- App name: `twitter-viewer`
- Window title: `Twitter Viewer`
- Frontend: `React` + `TypeScript` + `Vite`

- [ ] **Step 2: 依存パッケージをインストール**

```bash
npm install
npm install @tauri-apps/plugin-store zustand
```

- [ ] **Step 3: Cargo.toml に tauri-plugin-store と必要な機能を追加**

`src-tauri/Cargo.toml` の `[dependencies]` セクションを以下に更新：

```toml
[package]
name = "twitter-viewer"
version = "0.1.0"
edition = "2021"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = ["devtools"] }
tauri-plugin-store = "2"
tauri-plugin-shell = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
uuid = { version = "1", features = ["v4"] }
tokio = { version = "1", features = ["full"] }

[profile.release]
panic = "abort"
codegen-units = 1
lto = true
opt-level = "s"
strip = true
```

- [ ] **Step 4: tauri.conf.json を設定**

`src-tauri/tauri.conf.json` を以下に書き換え：

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "twitter-viewer",
  "version": "0.1.0",
  "identifier": "com.twitter-viewer",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:1420",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "windows": [
      {
        "label": "main",
        "title": "Twitter Viewer",
        "width": 1400,
        "height": 900,
        "minWidth": 600,
        "minHeight": 400,
        "decorations": true,
        "transparent": false
      }
    ],
    "security": {
      "csp": null
    }
  },
  "plugins": {
    "store": {
      "autoSave": 100
    }
  }
}
```

- [ ] **Step 5: vitest.config.ts を作成**

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
  },
});
```

- [ ] **Step 6: テストセットアップファイルを作成**

```typescript
// src/test-setup.ts
import "@testing-library/jest-dom";

// Tauri APIをモック
Object.defineProperty(window, "__TAURI__", {
  value: {
    invoke: vi.fn(),
    event: {
      listen: vi.fn(),
      emit: vi.fn(),
    },
  },
  writable: true,
});
```

- [ ] **Step 7: devDependencies にテストライブラリを追加**

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

- [ ] **Step 8: 開発サーバーが起動することを確認**

```bash
npm run tauri dev
```

Expected: Tauriウィンドウが開き、Reactのデフォルト画面が表示される

- [ ] **Step 9: コミット**

```bash
git init
git add .
git commit -m "feat: initialize Tauri v2 project with React + TypeScript"
```

---

## Task 2: 型定義

**Files:**

- Create: `src/types/index.ts`
- Create: `src/types/index.test.ts`

- [ ] **Step 1: テストを書く**

```typescript
// src/types/index.test.ts
import { describe, it, expect } from "vitest";
import { resolveColumnUrl } from "./index";

describe("resolveColumnUrl", () => {
  it("homeページのURLを返す", () => {
    expect(resolveColumnUrl({ pageType: "home" })).toBe("https://x.com/home");
  });

  it("notificationsページのURLを返す", () => {
    expect(resolveColumnUrl({ pageType: "notifications" })).toBe(
      "https://x.com/notifications",
    );
  });

  it("searchページのURLをクエリ付きで返す", () => {
    expect(resolveColumnUrl({ pageType: "search", searchQuery: "tauri" })).toBe(
      "https://x.com/search?q=tauri",
    );
  });

  it("listページのURLをリストID付きで返す", () => {
    expect(resolveColumnUrl({ pageType: "list", listId: "12345" })).toBe(
      "https://x.com/i/lists/12345",
    );
  });

  it("customページのURLをそのまま返す", () => {
    expect(
      resolveColumnUrl({
        pageType: "custom",
        customUrl: "https://x.com/explore",
      }),
    ).toBe("https://x.com/explore");
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
npx vitest run src/types/index.test.ts
```

Expected: FAIL - `resolveColumnUrl` が未定義

- [ ] **Step 3: 型定義と `resolveColumnUrl` を実装**

```typescript
// src/types/index.ts

export type PageType = "home" | "notifications" | "search" | "list" | "custom";

export interface Account {
  id: string;
  label: string;
  dataDirectory: string;
  color: string;
  createdAt: string;
}

export interface ColumnSettings {
  autoReloadEnabled: boolean;
  autoReloadInterval: number; // 秒
  areaRemoveEnabled: boolean;
  customCSS: string;
}

export interface Column {
  id: string;
  accountId: string;
  pageType: PageType;
  customUrl?: string;
  homeTabName?: string;
  searchQuery?: string;
  listId?: string;
  width: number;
  order: number;
  label?: string;
  settings: ColumnSettings;
}

export interface GlobalSettings {
  theme: "dark" | "light";
  customCSS: string;
  windowBounds: { x: number; y: number; width: number; height: number };
}

export interface AppSettings {
  accounts: Account[];
  columns: Column[];
  globalSettings: GlobalSettings;
}

export const DEFAULT_COLUMN_SETTINGS: ColumnSettings = {
  autoReloadEnabled: true,
  autoReloadInterval: 60,
  areaRemoveEnabled: true,
  customCSS: "",
};

export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  theme: "dark",
  customCSS: "",
  windowBounds: { x: 0, y: 0, width: 1400, height: 900 },
};

interface ResolveColumnUrlInput {
  pageType: PageType;
  customUrl?: string;
  searchQuery?: string;
  listId?: string;
}

export function resolveColumnUrl(input: ResolveColumnUrlInput): string {
  switch (input.pageType) {
    case "home":
      return "https://x.com/home";
    case "notifications":
      return "https://x.com/notifications";
    case "search":
      return `https://x.com/search?q=${encodeURIComponent(input.searchQuery ?? "")}`;
    case "list":
      return `https://x.com/i/lists/${input.listId ?? ""}`;
    case "custom":
      return input.customUrl ?? "https://x.com/home";
  }
}
```

- [ ] **Step 4: テストが通ることを確認**

```bash
npx vitest run src/types/index.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 5: コミット**

```bash
git add src/types/
git commit -m "feat: add core type definitions and resolveColumnUrl"
```

---

## Task 3: 設定ストア（React側）

**Files:**

- Create: `src/store/useAppStore.ts`
- Create: `src/store/useAppStore.test.ts`

- [ ] **Step 1: テストを書く**

```typescript
// src/store/useAppStore.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAppStore } from "./useAppStore";
import type { Account, Column } from "../types";

const mockAccount: Account = {
  id: "acc-1",
  label: "テストアカウント",
  dataDirectory: "/path/to/data",
  color: "#1d9bf0",
  createdAt: "2026-05-02T00:00:00Z",
};

const mockColumn: Column = {
  id: "col-1",
  accountId: "acc-1",
  pageType: "home",
  homeTabName: "フォロー中",
  width: 350,
  order: 0,
  settings: {
    autoReloadEnabled: true,
    autoReloadInterval: 60,
    areaRemoveEnabled: true,
    customCSS: "",
  },
};

describe("useAppStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("アカウントを追加できる", () => {
    const { result } = renderHook(() => useAppStore());
    act(() => {
      result.current.addAccount(mockAccount);
    });
    expect(result.current.accounts).toContainEqual(mockAccount);
  });

  it("アカウントを削除できる", () => {
    const { result } = renderHook(() => useAppStore());
    act(() => {
      result.current.addAccount(mockAccount);
      result.current.removeAccount("acc-1");
    });
    expect(result.current.accounts).not.toContainEqual(mockAccount);
  });

  it("カラムを追加できる", () => {
    const { result } = renderHook(() => useAppStore());
    act(() => {
      result.current.addColumn(mockColumn);
    });
    expect(result.current.columns).toContainEqual(mockColumn);
  });

  it("カラムを削除できる", () => {
    const { result } = renderHook(() => useAppStore());
    act(() => {
      result.current.addColumn(mockColumn);
      result.current.removeColumn("col-1");
    });
    expect(result.current.columns).not.toContainEqual(mockColumn);
  });

  it("カラム設定を更新できる", () => {
    const { result } = renderHook(() => useAppStore());
    act(() => {
      result.current.addColumn(mockColumn);
      result.current.updateColumn("col-1", { width: 400 });
    });
    expect(result.current.columns[0].width).toBe(400);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
npx vitest run src/store/useAppStore.test.ts
```

Expected: FAIL

- [ ] **Step 3: useAppStore を実装**

```typescript
// src/store/useAppStore.ts
import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { Account, Column, GlobalSettings, AppSettings } from "../types";
import { DEFAULT_GLOBAL_SETTINGS } from "../types";

interface AppStore {
  accounts: Account[];
  columns: Column[];
  globalSettings: GlobalSettings;
  isLoaded: boolean;
  loadSettings: () => Promise<void>;
  saveSettings: () => Promise<void>;
  addAccount: (account: Account) => void;
  removeAccount: (id: string) => void;
  addColumn: (column: Column) => void;
  removeColumn: (id: string) => void;
  updateColumn: (id: string, patch: Partial<Column>) => void;
  updateGlobalSettings: (patch: Partial<GlobalSettings>) => void;
}

export const useAppStore = create<AppStore>((set, get) => ({
  accounts: [],
  columns: [],
  globalSettings: DEFAULT_GLOBAL_SETTINGS,
  isLoaded: false,

  loadSettings: async () => {
    try {
      const settings = await invoke<AppSettings>("load_settings");
      set({
        accounts: settings.accounts,
        columns: settings.columns.sort((a, b) => a.order - b.order),
        globalSettings: settings.globalSettings,
        isLoaded: true,
      });
    } catch {
      set({ isLoaded: true });
    }
  },

  saveSettings: async () => {
    const { accounts, columns, globalSettings } = get();
    await invoke("save_settings", {
      settings: { accounts, columns, globalSettings },
    });
  },

  addAccount: (account) => {
    set((state) => ({ accounts: [...state.accounts, account] }));
    get().saveSettings();
  },

  removeAccount: (id) => {
    set((state) => ({ accounts: state.accounts.filter((a) => a.id !== id) }));
    get().saveSettings();
  },

  addColumn: (column) => {
    set((state) => ({ columns: [...state.columns, column] }));
    get().saveSettings();
  },

  removeColumn: (id) => {
    set((state) => ({ columns: state.columns.filter((c) => c.id !== id) }));
    get().saveSettings();
  },

  updateColumn: (id, patch) => {
    set((state) => ({
      columns: state.columns.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
    get().saveSettings();
  },

  updateGlobalSettings: (patch) => {
    set((state) => ({ globalSettings: { ...state.globalSettings, ...patch } }));
    get().saveSettings();
  },
}));
```

- [ ] **Step 4: テストが通ることを確認**

```bash
npx vitest run src/store/useAppStore.test.ts
```

Expected: PASS (6 tests)

- [ ] **Step 5: コミット**

```bash
git add src/store/
git commit -m "feat: add useAppStore with account/column CRUD"
```

---

## Task 4: インジェクションスクリプト

**Files:**

- Create: `src-tauri/src/inject/tab_selector.js`
- Create: `src-tauri/src/inject/area_remove.js`
- Create: `src-tauri/src/inject/auto_reload.js`
- Create: `src-tauri/src/inject/custom_css.js`
- Create: `src-tauri/src/inject/image_popup.js`
- Create: `src-tauri/src/inject/mod.rs`

- [ ] **Step 1: tab_selector.js を作成**

```javascript
// src-tauri/src/inject/tab_selector.js
(function () {
  function selectHomeTab(tabName) {
    if (!tabName) return;
    var observer = new MutationObserver(function () {
      var tabs = document.querySelectorAll('[role="tab"]');
      for (var i = 0; i < tabs.length; i++) {
        if (tabs[i].textContent && tabs[i].textContent.includes(tabName)) {
          tabs[i].click();
          observer.disconnect();
          return;
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(function () {
      observer.disconnect();
    }, 10000);
  }
  window.__twitterViewer = window.__twitterViewer || {};
  window.__twitterViewer.selectHomeTab = selectHomeTab;
})();
```

- [ ] **Step 2: area_remove.js を作成**

`D:\project\twitter-utils\src\content-scripts\area-remove\AreaRemove.ts` のロジックを移植：

```javascript
// src-tauri/src/inject/area_remove.js
(function () {
  var SIDEBAR_STYLE_ID = "twitter-viewer-sidebar-hide";
  var INPUT_STYLE_ID = "twitter-viewer-input-hide";

  function applyAreaRemove(enabled) {
    if (!enabled) {
      var s1 = document.getElementById(SIDEBAR_STYLE_ID);
      var s2 = document.getElementById(INPUT_STYLE_ID);
      if (s1) s1.remove();
      if (s2) s2.remove();
      return;
    }
    if (!document.getElementById(SIDEBAR_STYLE_ID)) {
      var sidebarStyle = document.createElement("style");
      sidebarStyle.id = SIDEBAR_STYLE_ID;
      sidebarStyle.textContent =
        "header[role='banner'] { display: none !important; }";
      document.head.appendChild(sidebarStyle);
    }
    if (!document.getElementById(INPUT_STYLE_ID)) {
      var inputStyle = document.createElement("style");
      inputStyle.id = INPUT_STYLE_ID;
      inputStyle.textContent =
        "div:has(> [role='progressbar'] + * div[data-testid*='tweetTextarea']) { display: none !important; }";
      document.head.appendChild(inputStyle);
    }
    removeHomeTitleElement();
  }

  function removeHomeTitleElement() {
    var h2s = document.querySelectorAll("h2");
    for (var i = 0; i < h2s.length; i++) {
      if (h2s[i].innerHTML.indexOf("ホーム") >= 0) {
        var el = getElementWithNavAsSibling(h2s[i]);
        if (el) el.style.display = "none";
        break;
      }
    }
  }

  function getElementWithNavAsSibling(el) {
    if (!el) return null;
    if (el.nextElementSibling !== null) return el;
    return getElementWithNavAsSibling(el.parentElement);
  }

  function debounce(fn, wait) {
    var t;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, wait);
    };
  }

  var debouncedApply = debounce(function () {
    applyAreaRemove(true);
  }, 500);
  var observer = new MutationObserver(debouncedApply);
  var main = document.getElementsByTagName("main");
  if (main.length > 0) {
    observer.observe(main[0], { childList: true, subtree: true });
  }

  window.__twitterViewer = window.__twitterViewer || {};
  window.__twitterViewer.applyAreaRemove = applyAreaRemove;

  // 初期適用
  applyAreaRemove(true);
})();
```

- [ ] **Step 3: auto_reload.js を作成**

```javascript
// src-tauri/src/inject/auto_reload.js
(function () {
  var timerId = null;
  var isEnabled = true;
  var intervalSec = 60;
  var isScrolling = false;
  var scrollTimer = null;

  document.addEventListener(
    "scroll",
    function () {
      isScrolling = true;
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(function () {
        isScrolling = false;
      }, 1000);
    },
    true,
  );

  function startAutoReload(intervalSeconds) {
    stopAutoReload();
    intervalSec = intervalSeconds || intervalSec;
    isEnabled = true;
    timerId = setInterval(function () {
      if (!isScrolling && isEnabled) {
        window.location.reload();
      }
    }, intervalSec * 1000);
  }

  function stopAutoReload() {
    if (timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }
    isEnabled = false;
  }

  function setAutoReloadEnabled(enabled, intervalSeconds) {
    if (enabled) {
      startAutoReload(intervalSeconds);
    } else {
      stopAutoReload();
    }
  }

  window.__twitterViewer = window.__twitterViewer || {};
  window.__twitterViewer.setAutoReloadEnabled = setAutoReloadEnabled;
  window.__twitterViewer.startAutoReload = startAutoReload;
  window.__twitterViewer.stopAutoReload = stopAutoReload;
})();
```

- [ ] **Step 4: custom_css.js を作成**

```javascript
// src-tauri/src/inject/custom_css.js
(function () {
  var CUSTOM_CSS_ID = "twitter-viewer-custom-css";

  function applyCustomCSS(css) {
    var existing = document.getElementById(CUSTOM_CSS_ID);
    if (existing) existing.remove();
    if (!css || css.trim() === "") return;
    var style = document.createElement("style");
    style.id = CUSTOM_CSS_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  window.__twitterViewer = window.__twitterViewer || {};
  window.__twitterViewer.applyCustomCSS = applyCustomCSS;
})();
```

- [ ] **Step 5: image_popup.js を作成**

```javascript
// src-tauri/src/inject/image_popup.js
(function () {
  function isMediaLink(el) {
    if (!el) return false;
    var href = el.getAttribute("href") || "";
    // ツイートの画像/動画リンク: /username/status/xxx/photo/1 や /i/status/xxx
    return (
      /\/status\/\d+\/(photo|video)\//.test(href) ||
      /\/i\/status\/\d+/.test(href)
    );
  }

  document.addEventListener(
    "click",
    function (e) {
      var target = e.target;
      if (!target) return;
      var link = target.closest("a");
      if (link && isMediaLink(link)) {
        e.preventDefault();
        e.stopPropagation();
        var href = link.getAttribute("href");
        var url = href.startsWith("http") ? href : "https://x.com" + href;
        if (window.__TAURI__ && window.__TAURI__.invoke) {
          window.__TAURI__.invoke("open_popup_window", { url: url });
        }
      }
    },
    true,
  );
})();
```

- [ ] **Step 6: inject/mod.rs を作成**

```rust
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
```

- [ ] **Step 7: コミット**

```bash
git add src-tauri/src/inject/
git commit -m "feat: add injection scripts for auto-reload, area-remove, custom CSS, image popup, tab selector"
```

---

## Task 5: Rust AppState

**Files:**

- Create: `src-tauri/src/state.rs`

- [ ] **Step 1: state.rs を作成**

```rust
// src-tauri/src/state.rs
use std::collections::HashMap;
use std::sync::Mutex;

/// WebviewのIDからアカウントIDへのマッピング
/// key: webview label (例: "column-abc123")
/// value: account_id
pub struct WebviewRegistry {
    pub entries: HashMap<String, WebviewEntry>,
}

pub struct WebviewEntry {
    pub column_id: String,
    pub account_id: String,
    pub data_directory: String,
}

pub struct AppState {
    pub registry: Mutex<WebviewRegistry>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            registry: Mutex::new(WebviewRegistry {
                entries: HashMap::new(),
            }),
        }
    }
}

impl WebviewRegistry {
    pub fn register(&mut self, label: String, column_id: String, account_id: String, data_directory: String) {
        self.entries.insert(label, WebviewEntry {
            column_id,
            account_id,
            data_directory,
        });
    }

    pub fn unregister(&mut self, label: &str) {
        self.entries.remove(label);
    }

    pub fn get_account_id(&self, label: &str) -> Option<&str> {
        self.entries.get(label).map(|e| e.account_id.as_str())
    }

    pub fn get_data_directory(&self, label: &str) -> Option<&str> {
        self.entries.get(label).map(|e| e.data_directory.as_str())
    }
}
```

- [ ] **Step 2: コミット**

```bash
git add src-tauri/src/state.rs
git commit -m "feat: add AppState with WebView registry for column-to-account mapping"
```

---

## Task 6: Rust 設定コマンド

**Files:**

- Create: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: commands/mod.rs を作成**

```rust
// src-tauri/src/commands/mod.rs
pub mod webview;
pub mod account;
pub mod settings;
```

- [ ] **Step 2: commands/settings.rs を作成**

```rust
// src-tauri/src/commands/settings.rs
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AccountData {
    pub id: String,
    pub label: String,
    #[serde(rename = "dataDirectory")]
    pub data_directory: String,
    pub color: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ColumnSettings {
    #[serde(rename = "autoReloadEnabled")]
    pub auto_reload_enabled: bool,
    #[serde(rename = "autoReloadInterval")]
    pub auto_reload_interval: u32,
    #[serde(rename = "areaRemoveEnabled")]
    pub area_remove_enabled: bool,
    #[serde(rename = "customCSS")]
    pub custom_css: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ColumnData {
    pub id: String,
    #[serde(rename = "accountId")]
    pub account_id: String,
    #[serde(rename = "pageType")]
    pub page_type: String,
    #[serde(rename = "customUrl")]
    pub custom_url: Option<String>,
    #[serde(rename = "homeTabName")]
    pub home_tab_name: Option<String>,
    #[serde(rename = "searchQuery")]
    pub search_query: Option<String>,
    #[serde(rename = "listId")]
    pub list_id: Option<String>,
    pub width: f64,
    pub order: u32,
    pub label: Option<String>,
    pub settings: ColumnSettings,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct WindowBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct GlobalSettingsData {
    pub theme: String,
    #[serde(rename = "customCSS")]
    pub custom_css: String,
    #[serde(rename = "windowBounds")]
    pub window_bounds: WindowBounds,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AppSettingsData {
    pub accounts: Vec<AccountData>,
    pub columns: Vec<ColumnData>,
    #[serde(rename = "globalSettings")]
    pub global_settings: GlobalSettingsData,
}

#[tauri::command]
pub async fn load_settings(app: AppHandle) -> Result<AppSettingsData, String> {
    let store = app.store("settings.json").map_err(|e| e.to_string())?;

    let settings = store.get("appSettings")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_else(|| AppSettingsData {
            accounts: vec![],
            columns: vec![],
            global_settings: GlobalSettingsData {
                theme: "dark".to_string(),
                custom_css: String::new(),
                window_bounds: WindowBounds { x: 0.0, y: 0.0, width: 1400.0, height: 900.0 },
            },
        });

    Ok(settings)
}

#[tauri::command]
pub async fn save_settings(app: AppHandle, settings: AppSettingsData) -> Result<(), String> {
    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    store.set("appSettings", serde_json::to_value(&settings).map_err(|e| e.to_string())?);
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}
```

- [ ] **Step 3: lib.rs を更新して設定コマンドを登録**

```rust
// src-tauri/src/lib.rs
mod state;
mod inject;
mod commands;

use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::settings::load_settings,
            commands::settings::save_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 4: ビルドが通ることを確認**

```bash
cargo build --manifest-path src-tauri/Cargo.toml
```

Expected: Compiling twitter-viewer ... Finished

- [ ] **Step 5: コミット**

```bash
git add src-tauri/src/commands/ src-tauri/src/lib.rs
git commit -m "feat: add settings load/save Tauri commands"
```

---

## Task 7: Rust WebView コマンド

**Files:**

- Create: `src-tauri/src/commands/webview.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: commands/webview.rs を作成**

```rust
// src-tauri/src/commands/webview.rs
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, WebviewBuilder, WebviewUrl};
use std::path::PathBuf;
use crate::state::AppState;
use crate::inject::build_init_script;
use super::settings::ColumnData;

fn webview_label(column_id: &str) -> String {
    format!("column-{}", column_id)
}

fn resolve_url(column: &ColumnData) -> String {
    match column.page_type.as_str() {
        "home" => "https://x.com/home".to_string(),
        "notifications" => "https://x.com/notifications".to_string(),
        "search" => format!(
            "https://x.com/search?q={}",
            urlencoding::encode(column.search_query.as_deref().unwrap_or(""))
        ),
        "list" => format!(
            "https://x.com/i/lists/{}",
            column.list_id.as_deref().unwrap_or("")
        ),
        "custom" => column.custom_url.clone().unwrap_or_else(|| "https://x.com/home".to_string()),
        _ => "https://x.com/home".to_string(),
    }
}

#[derive(serde::Deserialize)]
pub struct CreateWebviewArgs {
    pub column: ColumnData,
    pub data_directory: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[tauri::command]
pub async fn create_column_webview(
    app: AppHandle,
    args: CreateWebviewArgs,
) -> Result<(), String> {
    let url = resolve_url(&args.column);
    let label = webview_label(&args.column.id);
    let data_dir = PathBuf::from(&args.data_directory);

    let init_script = build_init_script(
        args.column.home_tab_name.as_deref(),
        args.column.settings.area_remove_enabled,
        args.column.settings.auto_reload_enabled,
        args.column.settings.auto_reload_interval,
        &args.column.settings.custom_css,
    );

    let window = app.get_window("main").ok_or("main window not found")?;

    window.add_child(
        WebviewBuilder::new(&label, WebviewUrl::External(url.parse().map_err(|e: url::ParseError| e.to_string())?))
            .initialization_script(&init_script)
            .data_directory(data_dir),
        LogicalPosition::new(args.x, args.y),
        LogicalSize::new(args.width, args.height),
    ).map_err(|e| e.to_string())?;

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

#[tauri::command]
pub async fn remove_column_webview(
    app: AppHandle,
    column_id: String,
) -> Result<(), String> {
    let label = webview_label(&column_id);

    if let Some(webview) = app.get_webview(&label) {
        webview.close().map_err(|e| e.to_string())?;
    }

    let state = app.state::<AppState>();
    let mut registry = state.registry.lock().unwrap();
    registry.unregister(&label);

    Ok(())
}

#[derive(serde::Deserialize)]
pub struct ResizeBounds {
    pub column_id: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[tauri::command]
pub async fn resize_column_webview(
    app: AppHandle,
    bounds: ResizeBounds,
) -> Result<(), String> {
    let label = webview_label(&bounds.column_id);

    if let Some(webview) = app.get_webview(&label) {
        webview.set_bounds(tauri::Rect {
            position: LogicalPosition::new(bounds.x, bounds.y).into(),
            size: LogicalSize::new(bounds.width, bounds.height).into(),
        }).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub async fn open_popup_window(
    app: AppHandle,
    webview_label_caller: String,
    url: String,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    let data_dir = {
        let registry = state.registry.lock().unwrap();
        registry.get_data_directory(&webview_label_caller)
            .map(|s| PathBuf::from(s))
            .unwrap_or_else(|| PathBuf::from(""))
    };

    let popup_label = format!("popup-{}", uuid::Uuid::new_v4());

    tauri::WebviewWindowBuilder::new(
        &app,
        &popup_label,
        WebviewUrl::External(url.parse().map_err(|e: url::ParseError| e.to_string())?),
    )
    .title("X - メディア")
    .inner_size(900.0, 700.0)
    .data_directory(data_dir)
    .build()
    .map_err(|e| e.to_string())?;

    Ok(())
}
```

注：`image_popup.js` 内の invoke 呼び出しを以下に変更して webview_label_caller を渡す：

```javascript
// src-tauri/src/inject/image_popup.js の invoke 呼び出し部分を更新
window.__TAURI__.invoke("open_popup_window", {
  webviewLabelCaller: window.__TAURI_INTERNALS__.metadata.currentWindow.label,
  url: url,
});
```

- [ ] **Step 2: Cargo.toml に urlencoding を追加**

```toml
# src-tauri/Cargo.toml の [dependencies] に追加
urlencoding = "2"
```

- [ ] **Step 3: lib.rs にコマンドを追加**

```rust
// src-tauri/src/lib.rs の invoke_handler を更新
.invoke_handler(tauri::generate_handler![
    commands::settings::load_settings,
    commands::settings::save_settings,
    commands::webview::create_column_webview,
    commands::webview::remove_column_webview,
    commands::webview::resize_column_webview,
    commands::webview::open_popup_window,
])
```

- [ ] **Step 4: ビルドが通ることを確認**

```bash
cargo build --manifest-path src-tauri/Cargo.toml
```

Expected: Finished

- [ ] **Step 5: コミット**

```bash
git add src-tauri/
git commit -m "feat: add WebView create/remove/resize/popup Tauri commands"
```

---

## Task 8: Rust アカウントコマンド

**Files:**

- Create: `src-tauri/src/commands/account.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: commands/account.rs を作成**

```rust
// src-tauri/src/commands/account.rs
use tauri::{AppHandle, WebviewUrl};
use std::path::PathBuf;

#[tauri::command]
pub async fn open_add_account_window(app: AppHandle) -> Result<String, String> {
    let account_id = uuid::Uuid::new_v4().to_string();
    let window_label = format!("add-account-{}", &account_id[..8]);

    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let data_dir = app_data.join("accounts").join(format!("account-{}", &account_id));
    std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;

    // ログイン完了（x.com/homeへの遷移）を検知するスクリプト
    let detect_script = r#"
        (function() {
            var observer = new MutationObserver(function() {
                if (window.location.pathname === '/home') {
                    window.__TAURI__.invoke('notify_account_logged_in');
                    observer.disconnect();
                }
            });
            observer.observe(document, { subtree: true, childList: true });
            // URL変化もポーリングで監視（SPAのため）
            var lastUrl = window.location.href;
            setInterval(function() {
                if (window.location.href !== lastUrl) {
                    lastUrl = window.location.href;
                    if (window.location.pathname === '/home') {
                        window.__TAURI__.invoke('notify_account_logged_in');
                    }
                }
            }, 500);
        })();
    "#;

    tauri::WebviewWindowBuilder::new(
        &app,
        &window_label,
        WebviewUrl::External("https://x.com/login".parse().map_err(|e: url::ParseError| e.to_string())?),
    )
    .title("アカウントを追加")
    .inner_size(500.0, 700.0)
    .data_directory(data_dir.clone())
    .initialization_script(detect_script)
    .build()
    .map_err(|e| e.to_string())?;

    // data_directoryとaccount_idを返す（フロントエンドがアカウント登録に使う）
    Ok(serde_json::json!({
        "accountId": account_id,
        "dataDirectory": data_dir.to_string_lossy(),
        "windowLabel": window_label,
    }).to_string())
}

#[tauri::command]
pub async fn notify_account_logged_in(app: AppHandle) -> Result<(), String> {
    // フロントエンドにログイン完了を通知
    app.emit("account-login-complete", ()).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn delete_account_data(data_directory: String) -> Result<(), String> {
    let path = PathBuf::from(data_directory);
    if path.exists() {
        std::fs::remove_dir_all(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}
```

- [ ] **Step 2: lib.rs にコマンドを追加**

```rust
.invoke_handler(tauri::generate_handler![
    commands::settings::load_settings,
    commands::settings::save_settings,
    commands::webview::create_column_webview,
    commands::webview::remove_column_webview,
    commands::webview::resize_column_webview,
    commands::webview::open_popup_window,
    commands::account::open_add_account_window,
    commands::account::notify_account_logged_in,
    commands::account::delete_account_data,
])
```

- [ ] **Step 3: ビルドが通ることを確認**

```bash
cargo build --manifest-path src-tauri/Cargo.toml
```

Expected: Finished

- [ ] **Step 4: コミット**

```bash
git add src-tauri/src/commands/account.rs src-tauri/src/lib.rs
git commit -m "feat: add account management Tauri commands"
```

---

## Task 9: ColumnHeader コンポーネント

**Files:**

- Create: `src/components/ColumnHeader/ColumnHeader.tsx`
- Create: `src/components/ColumnHeader/ColumnHeader.module.scss`
- Create: `src/components/ColumnHeader/ColumnHeader.test.tsx`

- [ ] **Step 1: テストを書く**

```typescript
// src/components/ColumnHeader/ColumnHeader.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ColumnHeader } from './ColumnHeader';
import type { Column, Account } from '../../types';

const mockAccount: Account = {
  id: 'acc-1',
  label: 'テストアカウント',
  dataDirectory: '/path/to/data',
  color: '#1d9bf0',
  createdAt: '2026-05-02T00:00:00Z',
};

const mockColumn: Column = {
  id: 'col-1',
  accountId: 'acc-1',
  pageType: 'home',
  homeTabName: 'フォロー中',
  width: 350,
  order: 0,
  settings: {
    autoReloadEnabled: true,
    autoReloadInterval: 60,
    areaRemoveEnabled: true,
    customCSS: '',
  },
};

describe('ColumnHeader', () => {
  it('アカウント名を表示する', () => {
    render(
      <ColumnHeader
        column={mockColumn}
        account={mockAccount}
        onReload={vi.fn()}
        onSettings={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('テストアカウント')).toBeInTheDocument();
  });

  it('閉じるボタンクリックでonCloseが呼ばれる', () => {
    const onClose = vi.fn();
    render(
      <ColumnHeader
        column={mockColumn}
        account={mockAccount}
        onReload={vi.fn()}
        onSettings={vi.fn()}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByLabelText('カラムを閉じる'));
    expect(onClose).toHaveBeenCalledWith('col-1');
  });

  it('更新ボタンクリックでonReloadが呼ばれる', () => {
    const onReload = vi.fn();
    render(
      <ColumnHeader
        column={mockColumn}
        account={mockAccount}
        onReload={onReload}
        onSettings={vi.fn()}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(screen.getByLabelText('更新'));
    expect(onReload).toHaveBeenCalledWith('col-1');
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
npx vitest run src/components/ColumnHeader/ColumnHeader.test.tsx
```

Expected: FAIL

- [ ] **Step 3: ColumnHeader コンポーネントを実装**

```typescript
// src/components/ColumnHeader/ColumnHeader.tsx
import React from 'react';
import type { Account, Column } from '../../types';
import styles from './ColumnHeader.module.scss';

interface ColumnHeaderProps {
  column: Column;
  account: Account;
  onReload: (columnId: string) => void;
  onSettings: (columnId: string) => void;
  onClose: (columnId: string) => void;
}

export const ColumnHeader: React.FC<ColumnHeaderProps> = ({
  column,
  account,
  onReload,
  onSettings,
  onClose,
}) => {
  const label = column.label ?? `${account.label} - ${getPageLabel(column)}`;

  return (
    <div className={styles.header} style={{ borderTopColor: account.color }}>
      <span className={styles.dot} style={{ backgroundColor: account.color }} />
      <span className={styles.label}>{label}</span>
      <div className={styles.actions}>
        <button
          className={styles.actionBtn}
          onClick={() => onReload(column.id)}
          aria-label="更新"
          title="更新"
        >
          ↺
        </button>
        <button
          className={styles.actionBtn}
          onClick={() => onSettings(column.id)}
          aria-label="設定"
          title="設定"
        >
          ⚙
        </button>
        <button
          className={styles.actionBtn}
          onClick={() => onClose(column.id)}
          aria-label="カラムを閉じる"
          title="カラムを閉じる"
        >
          ✕
        </button>
      </div>
    </div>
  );
};

function getPageLabel(column: Column): string {
  switch (column.pageType) {
    case 'home': return column.homeTabName ?? 'ホーム';
    case 'notifications': return '通知';
    case 'search': return `検索: ${column.searchQuery ?? ''}`;
    case 'list': return 'リスト';
    case 'custom': return 'カスタム';
  }
}
```

```scss
// src/components/ColumnHeader/ColumnHeader.module.scss
.header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: #111;
  border-top: 2px solid transparent;
  border-bottom: 1px solid #222;
  height: 36px;
  flex-shrink: 0;
  user-select: none;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.label {
  font-size: 12px;
  color: #aaa;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.actions {
  display: flex;
  gap: 2px;
}

.actionBtn {
  background: none;
  border: none;
  color: #555;
  cursor: pointer;
  font-size: 14px;
  padding: 2px 4px;
  border-radius: 3px;
  line-height: 1;

  &:hover {
    color: #aaa;
    background: #222;
  }
}
```

- [ ] **Step 4: テストが通ることを確認**

```bash
npx vitest run src/components/ColumnHeader/ColumnHeader.test.tsx
```

Expected: PASS (3 tests)

- [ ] **Step 5: コミット**

```bash
git add src/components/ColumnHeader/
git commit -m "feat: add ColumnHeader component"
```

---

## Task 10: AddColumnDialog コンポーネント

**Files:**

- Create: `src/components/AddColumnDialog/AddColumnDialog.tsx`
- Create: `src/components/AddColumnDialog/AddColumnDialog.module.scss`
- Create: `src/components/AddColumnDialog/AddColumnDialog.test.tsx`

- [ ] **Step 1: テストを書く**

```typescript
// src/components/AddColumnDialog/AddColumnDialog.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AddColumnDialog } from './AddColumnDialog';
import type { Account } from '../../types';

const mockAccounts: Account[] = [
  {
    id: 'acc-1',
    label: 'アカウントA',
    dataDirectory: '/data/a',
    color: '#1d9bf0',
    createdAt: '2026-05-02T00:00:00Z',
  },
];

describe('AddColumnDialog', () => {
  it('アカウント一覧が表示される', () => {
    render(
      <AddColumnDialog
        accounts={mockAccounts}
        onAdd={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText('アカウントA')).toBeInTheDocument();
  });

  it('homeを選択するとタブ名入力欄が表示される', () => {
    render(
      <AddColumnDialog
        accounts={mockAccounts}
        onAdd={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText('ページタイプ'), {
      target: { value: 'home' },
    });
    expect(screen.getByLabelText('タブ名')).toBeInTheDocument();
  });

  it('キャンセルボタンでonCancelが呼ばれる', () => {
    const onCancel = vi.fn();
    render(
      <AddColumnDialog
        accounts={mockAccounts}
        onAdd={vi.fn()}
        onCancel={onCancel}
      />
    );
    fireEvent.click(screen.getByText('キャンセル'));
    expect(onCancel).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
npx vitest run src/components/AddColumnDialog/AddColumnDialog.test.tsx
```

Expected: FAIL

- [ ] **Step 3: AddColumnDialog を実装**

```typescript
// src/components/AddColumnDialog/AddColumnDialog.tsx
import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Account, Column, PageType } from '../../types';
import { DEFAULT_COLUMN_SETTINGS } from '../../types';
import styles from './AddColumnDialog.module.scss';

interface AddColumnDialogProps {
  accounts: Account[];
  onAdd: (column: Column) => void;
  onCancel: () => void;
}

export const AddColumnDialog: React.FC<AddColumnDialogProps> = ({
  accounts,
  onAdd,
  onCancel,
}) => {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [pageType, setPageType] = useState<PageType>('home');
  const [homeTabName, setHomeTabName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [listId, setListId] = useState('');
  const [customUrl, setCustomUrl] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const column: Column = {
      id: uuidv4(),
      accountId,
      pageType,
      homeTabName: pageType === 'home' && homeTabName ? homeTabName : undefined,
      searchQuery: pageType === 'search' ? searchQuery : undefined,
      listId: pageType === 'list' ? listId : undefined,
      customUrl: pageType === 'custom' ? customUrl : undefined,
      width: 350,
      order: 9999,
      settings: { ...DEFAULT_COLUMN_SETTINGS },
    };
    onAdd(column);
  };

  return (
    <div className={styles.overlay}>
      <form className={styles.dialog} onSubmit={handleSubmit}>
        <h2 className={styles.title}>カラムを追加</h2>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="account-select">アカウント</label>
          <select
            id="account-select"
            className={styles.select}
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="page-type-select">ページタイプ</label>
          <select
            id="page-type-select"
            aria-label="ページタイプ"
            className={styles.select}
            value={pageType}
            onChange={(e) => setPageType(e.target.value as PageType)}
          >
            <option value="home">ホーム</option>
            <option value="notifications">通知</option>
            <option value="search">検索</option>
            <option value="list">リスト</option>
            <option value="custom">カスタムURL</option>
          </select>
        </div>

        {pageType === 'home' && (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="tab-name" aria-label="タブ名">
              タブ名（任意）
            </label>
            <input
              id="tab-name"
              aria-label="タブ名"
              className={styles.input}
              value={homeTabName}
              onChange={(e) => setHomeTabName(e.target.value)}
              placeholder="例: フォロー中"
            />
          </div>
        )}

        {pageType === 'search' && (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="search-query">検索クエリ</label>
            <input
              id="search-query"
              className={styles.input}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="例: tauri"
              required
            />
          </div>
        )}

        {pageType === 'list' && (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="list-id">リストID</label>
            <input
              id="list-id"
              className={styles.input}
              value={listId}
              onChange={(e) => setListId(e.target.value)}
              placeholder="例: 1234567890"
              required
            />
          </div>
        )}

        {pageType === 'custom' && (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="custom-url">URL</label>
            <input
              id="custom-url"
              className={styles.input}
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              placeholder="https://x.com/..."
              required
            />
          </div>
        )}

        <div className={styles.actions}>
          <button type="button" className={styles.cancelBtn} onClick={onCancel}>
            キャンセル
          </button>
          <button
            type="submit"
            className={styles.submitBtn}
            disabled={accounts.length === 0}
          >
            追加
          </button>
        </div>
      </form>
    </div>
  );
};
```

```scss
// src/components/AddColumnDialog/AddColumnDialog.module.scss
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog {
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 8px;
  padding: 24px;
  width: 400px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.title {
  font-size: 16px;
  color: #eee;
  margin: 0;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.label {
  font-size: 12px;
  color: #888;
}

.select,
.input {
  background: #0d0d0d;
  border: 1px solid #333;
  border-radius: 4px;
  color: #eee;
  font-size: 13px;
  padding: 8px;
  width: 100%;
  box-sizing: border-box;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

.cancelBtn {
  background: #222;
  border: 1px solid #444;
  border-radius: 4px;
  color: #aaa;
  cursor: pointer;
  font-size: 13px;
  padding: 8px 16px;
}

.submitBtn {
  background: #1d9bf0;
  border: none;
  border-radius: 4px;
  color: white;
  cursor: pointer;
  font-size: 13px;
  font-weight: bold;
  padding: 8px 16px;

  &:disabled {
    background: #333;
    cursor: not-allowed;
  }
}
```

- [ ] **Step 4: uuid をインストール**

```bash
npm install uuid
npm install -D @types/uuid
```

- [ ] **Step 5: テストが通ることを確認**

```bash
npx vitest run src/components/AddColumnDialog/AddColumnDialog.test.tsx
```

Expected: PASS (3 tests)

- [ ] **Step 6: コミット**

```bash
git add src/components/AddColumnDialog/
git commit -m "feat: add AddColumnDialog component"
```

---

## Task 11: AccountManager コンポーネント

**Files:**

- Create: `src/components/AccountManager/AccountManager.tsx`
- Create: `src/components/AccountManager/AccountManager.module.scss`
- Create: `src/components/AccountManager/AccountManager.test.tsx`

- [ ] **Step 1: テストを書く**

```typescript
// src/components/AccountManager/AccountManager.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AccountManager } from './AccountManager';
import type { Account } from '../../types';

const mockAccounts: Account[] = [
  {
    id: 'acc-1',
    label: 'アカウントA',
    dataDirectory: '/data/a',
    color: '#1d9bf0',
    createdAt: '2026-05-02T00:00:00Z',
  },
];

describe('AccountManager', () => {
  it('アカウント一覧が表示される', () => {
    render(
      <AccountManager
        accounts={mockAccounts}
        onAddAccount={vi.fn()}
        onRemoveAccount={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('アカウントA')).toBeInTheDocument();
  });

  it('削除ボタンでonRemoveAccountが呼ばれる', () => {
    const onRemoveAccount = vi.fn();
    render(
      <AccountManager
        accounts={mockAccounts}
        onAddAccount={vi.fn()}
        onRemoveAccount={onRemoveAccount}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(screen.getByLabelText('アカウントA を削除'));
    expect(onRemoveAccount).toHaveBeenCalledWith('acc-1');
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
npx vitest run src/components/AccountManager/AccountManager.test.tsx
```

Expected: FAIL

- [ ] **Step 3: AccountManager を実装**

```typescript
// src/components/AccountManager/AccountManager.tsx
import React from 'react';
import type { Account } from '../../types';
import styles from './AccountManager.module.scss';

interface AccountManagerProps {
  accounts: Account[];
  onAddAccount: () => void;
  onRemoveAccount: (id: string) => void;
  onClose: () => void;
}

export const AccountManager: React.FC<AccountManagerProps> = ({
  accounts,
  onAddAccount,
  onRemoveAccount,
  onClose,
}) => {
  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <h2 className={styles.title}>アカウント管理</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="閉じる">✕</button>
        </div>

        <div className={styles.list}>
          {accounts.length === 0 && (
            <p className={styles.empty}>アカウントがありません</p>
          )}
          {accounts.map((account) => (
            <div key={account.id} className={styles.item}>
              <span
                className={styles.dot}
                style={{ backgroundColor: account.color }}
              />
              <span className={styles.label}>{account.label}</span>
              <button
                className={styles.removeBtn}
                onClick={() => onRemoveAccount(account.id)}
                aria-label={`${account.label} を削除`}
              >
                削除
              </button>
            </div>
          ))}
        </div>

        <button className={styles.addBtn} onClick={onAddAccount}>
          + アカウントを追加
        </button>
      </div>
    </div>
  );
};
```

```scss
// src/components/AccountManager/AccountManager.module.scss
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.panel {
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 8px;
  padding: 24px;
  width: 360px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.title {
  font-size: 16px;
  color: #eee;
  margin: 0;
}

.closeBtn {
  background: none;
  border: none;
  color: #666;
  cursor: pointer;
  font-size: 16px;
  &:hover {
    color: #aaa;
  }
}

.list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 60px;
}

.empty {
  color: #555;
  font-size: 13px;
  text-align: center;
  padding: 16px 0;
}

.item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  background: #0d0d0d;
  border-radius: 6px;
  border: 1px solid #222;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.label {
  flex: 1;
  font-size: 13px;
  color: #ccc;
}

.removeBtn {
  background: none;
  border: 1px solid #444;
  border-radius: 4px;
  color: #e06c75;
  cursor: pointer;
  font-size: 12px;
  padding: 4px 10px;
  &:hover {
    background: #2a1515;
  }
}

.addBtn {
  background: #1d9bf0;
  border: none;
  border-radius: 6px;
  color: white;
  cursor: pointer;
  font-size: 13px;
  font-weight: bold;
  padding: 10px;
  width: 100%;
}
```

- [ ] **Step 4: テストが通ることを確認**

```bash
npx vitest run src/components/AccountManager/AccountManager.test.tsx
```

Expected: PASS (2 tests)

- [ ] **Step 5: コミット**

```bash
git add src/components/AccountManager/
git commit -m "feat: add AccountManager component"
```

---

## Task 12: useColumns / useAccounts フック

**Files:**

- Create: `src/hooks/useColumns.ts`
- Create: `src/hooks/useAccounts.ts`

- [ ] **Step 1: useAccounts.ts を作成**

```typescript
// src/hooks/useAccounts.ts
import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { useAppStore } from "../store/useAppStore";
import type { Account } from "../types";

const ACCOUNT_COLORS = [
  "#1d9bf0",
  "#e5c07b",
  "#98c379",
  "#c678dd",
  "#e06c75",
  "#61afef",
  "#56b6c2",
  "#abb2bf",
];

export function useAccounts() {
  const { accounts, addAccount, removeAccount } = useAppStore();

  useEffect(() => {
    const unlisten = listen<void>("account-login-complete", () => {
      // ログイン完了時にフロントエンドがaddPendingAccountを呼び出す
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const startAddAccount = useCallback(async () => {
    const result = await invoke<string>("open_add_account_window");
    const { accountId, dataDirectory, windowLabel } = JSON.parse(result);

    // ログイン完了を待つ
    return new Promise<void>((resolve) => {
      const unlisten = listen<void>("account-login-complete", async () => {
        unlisten.then((fn) => fn());

        const label =
          prompt("このアカウントの名前を入力してください") ??
          `アカウント ${accounts.length + 1}`;
        const color = ACCOUNT_COLORS[accounts.length % ACCOUNT_COLORS.length];

        const account: Account = {
          id: accountId,
          label,
          dataDirectory,
          color,
          createdAt: new Date().toISOString(),
        };

        addAccount(account);

        // ログインウィンドウを閉じる
        await invoke("close_window", { label: windowLabel }).catch(() => {});
        resolve();
      });
    });
  }, [accounts, addAccount]);

  const handleRemoveAccount = useCallback(
    async (id: string) => {
      const account = accounts.find((a) => a.id === id);
      if (!account) return;

      const confirmed = confirm(
        `「${account.label}」を削除しますか？セッションデータも削除されます。`,
      );
      if (!confirmed) return;

      await invoke("delete_account_data", {
        dataDirectory: account.dataDirectory,
      });
      removeAccount(id);
    },
    [accounts, removeAccount],
  );

  return { accounts, startAddAccount, removeAccount: handleRemoveAccount };
}
```

- [ ] **Step 2: useColumns.ts を作成**

```typescript
// src/hooks/useColumns.ts
import { useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../store/useAppStore";
import type { Column } from "../types";
import { resolveColumnUrl } from "../types";

const HEADER_HEIGHT = 36; // ColumnHeaderの高さ（px）
const COLUMN_HEADER_Y = 0; // ヘッダはShell UIで表示するためWebViewのY開始点

export function useColumns() {
  const { columns, accounts, addColumn, removeColumn, updateColumn } =
    useAppStore();
  const containerRef = useRef<HTMLDivElement>(null);

  // カラムのWebViewのboundsを計算する
  const calculateBounds = useCallback(
    (
      columnIndex: number,
      allColumns: Column[],
      containerWidth: number,
      containerHeight: number,
    ) => {
      let x = 0;
      for (let i = 0; i < columnIndex; i++) {
        x += allColumns[i].width;
      }
      return {
        x,
        y: HEADER_HEIGHT,
        width: allColumns[columnIndex].width,
        height: containerHeight - HEADER_HEIGHT,
      };
    },
    [],
  );

  // 全カラムのWebViewを作成（起動時に呼ぶ）
  const restoreColumns = useCallback(async () => {
    if (!containerRef.current) return;
    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;

    for (let i = 0; i < columns.length; i++) {
      const column = columns[i];
      const account = accounts.find((a) => a.id === column.accountId);
      if (!account) continue;

      const bounds = calculateBounds(
        i,
        columns,
        containerWidth,
        containerHeight,
      );
      await invoke("create_column_webview", {
        args: {
          column,
          dataDirectory: account.dataDirectory,
          ...bounds,
        },
      }).catch(console.error);
    }
  }, [columns, accounts, calculateBounds]);

  // カラム追加
  const handleAddColumn = useCallback(
    async (column: Column) => {
      const account = accounts.find((a) => a.id === column.accountId);
      if (!account || !containerRef.current) return;

      const orderedColumns = [...columns, { ...column, order: columns.length }];
      const containerHeight = containerRef.current.clientHeight;
      const containerWidth = containerRef.current.clientWidth;
      const bounds = calculateBounds(
        orderedColumns.length - 1,
        orderedColumns,
        containerWidth,
        containerHeight,
      );

      await invoke("create_column_webview", {
        args: {
          column: { ...column, order: columns.length },
          dataDirectory: account.dataDirectory,
          ...bounds,
        },
      });

      addColumn({ ...column, order: columns.length });
    },
    [columns, accounts, addColumn, calculateBounds],
  );

  // カラム削除
  const handleRemoveColumn = useCallback(
    async (columnId: string) => {
      await invoke("remove_column_webview", { columnId });
      removeColumn(columnId);
      // 残りカラムのboundsを再計算
      await recalculateAllBounds();
    },
    [removeColumn],
  );

  // 全カラムのboundsを再計算して更新
  const recalculateAllBounds = useCallback(async () => {
    if (!containerRef.current) return;
    const containerHeight = containerRef.current.clientHeight;
    const containerWidth = containerRef.current.clientWidth;
    const sortedColumns = [...columns].sort((a, b) => a.order - b.order);

    for (let i = 0; i < sortedColumns.length; i++) {
      const bounds = calculateBounds(
        i,
        sortedColumns,
        containerWidth,
        containerHeight,
      );
      await invoke("resize_column_webview", {
        bounds: { columnId: sortedColumns[i].id, ...bounds },
      }).catch(console.error);
    }
  }, [columns, calculateBounds]);

  // カラム更新（設定変更）
  const handleUpdateColumn = useCallback(
    (id: string, patch: Partial<Column>) => {
      updateColumn(id, patch);
    },
    [updateColumn],
  );

  // ウィンドウリサイズ時に全カラムを再配置
  useEffect(() => {
    const handleResize = () => {
      recalculateAllBounds();
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [recalculateAllBounds]);

  return {
    columns,
    containerRef,
    restoreColumns,
    handleAddColumn,
    handleRemoveColumn,
    handleUpdateColumn,
    recalculateAllBounds,
  };
}
```

- [ ] **Step 3: コミット**

```bash
git add src/hooks/
git commit -m "feat: add useColumns and useAccounts hooks"
```

---

## Task 13: App.tsx メインレイアウト

**Files:**

- Modify: `src/App.tsx`
- Create: `src/App.module.scss`

- [ ] **Step 1: App.tsx を実装**

```typescript
// src/App.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { useAppStore } from './store/useAppStore';
import { useColumns } from './hooks/useColumns';
import { useAccounts } from './hooks/useAccounts';
import { ColumnHeader } from './components/ColumnHeader/ColumnHeader';
import { AddColumnDialog } from './components/AddColumnDialog/AddColumnDialog';
import { AccountManager } from './components/AccountManager/AccountManager';
import { invoke } from '@tauri-apps/api/core';
import styles from './App.module.scss';

const App: React.FC = () => {
  const { loadSettings, isLoaded, accounts } = useAppStore();
  const {
    columns,
    containerRef,
    restoreColumns,
    handleAddColumn,
    handleRemoveColumn,
    handleUpdateColumn,
  } = useColumns();
  const { startAddAccount, removeAccount } = useAccounts();

  const [showAddColumn, setShowAddColumn] = useState(false);
  const [showAccountManager, setShowAccountManager] = useState(false);

  // 起動時に設定を読み込んでカラムを復元
  useEffect(() => {
    loadSettings().then(() => {
      restoreColumns();
    });
  }, []);

  // カラムのリロード
  const handleReload = useCallback(async (columnId: string) => {
    const webviewLabel = `column-${columnId}`;
    await invoke('eval_in_webview', { label: webviewLabel, script: 'window.location.reload();' })
      .catch(console.error);
  }, []);

  if (!isLoaded) {
    return (
      <div className={styles.loading}>
        <span>読み込み中...</span>
      </div>
    );
  }

  return (
    <div className={styles.app} ref={containerRef}>
      {/* カラムヘッダ行 */}
      <div className={styles.headerRow}>
        <div className={styles.columnHeaders}>
          {columns
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((column) => {
              const account = accounts.find((a) => a.id === column.accountId);
              if (!account) return null;
              return (
                <div
                  key={column.id}
                  style={{ width: column.width, flexShrink: 0 }}
                >
                  <ColumnHeader
                    column={column}
                    account={account}
                    onReload={handleReload}
                    onSettings={() => {}}
                    onClose={handleRemoveColumn}
                  />
                </div>
              );
            })}
        </div>

        <div className={styles.toolbar}>
          <button
            className={styles.toolbarBtn}
            onClick={() => setShowAddColumn(true)}
            title="カラムを追加"
            aria-label="カラムを追加"
          >
            +
          </button>
          <button
            className={styles.toolbarBtn}
            onClick={() => setShowAccountManager(true)}
            title="アカウント管理"
            aria-label="アカウント管理"
          >
            👤
          </button>
        </div>
      </div>

      {/* WebViewエリア（Rustが管理）*/}
      <div className={styles.webviewArea} />

      {/* ダイアログ */}
      {showAddColumn && accounts.length > 0 && (
        <AddColumnDialog
          accounts={accounts}
          onAdd={(column) => {
            handleAddColumn(column);
            setShowAddColumn(false);
          }}
          onCancel={() => setShowAddColumn(false)}
        />
      )}

      {showAddColumn && accounts.length === 0 && (
        <div className={styles.noAccountsPrompt}>
          <p>先にアカウントを追加してください</p>
          <button onClick={() => { setShowAddColumn(false); setShowAccountManager(true); }}>
            アカウント管理を開く
          </button>
        </div>
      )}

      {showAccountManager && (
        <AccountManager
          accounts={accounts}
          onAddAccount={startAddAccount}
          onRemoveAccount={removeAccount}
          onClose={() => setShowAccountManager(false)}
        />
      )}
    </div>
  );
};

export default App;
```

```scss
// src/App.module.scss
.app {
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  background: #000;
  overflow: hidden;
}

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100vw;
  height: 100vh;
  color: #555;
  font-size: 14px;
}

.headerRow {
  display: flex;
  align-items: stretch;
  height: 36px;
  flex-shrink: 0;
  border-bottom: 1px solid #1a1a1a;
  overflow-x: auto;
  overflow-y: hidden;
}

.columnHeaders {
  display: flex;
  flex: 1;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  background: #0a0a0a;
  border-left: 1px solid #222;
  flex-shrink: 0;
}

.toolbarBtn {
  background: none;
  border: none;
  color: #555;
  cursor: pointer;
  font-size: 18px;
  padding: 4px 6px;
  border-radius: 4px;
  line-height: 1;

  &:hover {
    color: #aaa;
    background: #1a1a1a;
  }
}

.webviewArea {
  flex: 1;
  // WebViewはRustが直接このエリアに配置する
  // このdivは高さ確保のためのプレースホルダー
}

.noAccountsPrompt {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 8px;
  padding: 24px;
  text-align: center;
  color: #aaa;

  button {
    margin-top: 12px;
    background: #1d9bf0;
    border: none;
    border-radius: 4px;
    color: white;
    cursor: pointer;
    font-size: 13px;
    padding: 8px 16px;
  }
}
```

- [ ] **Step 2: eval_in_webview コマンドを Rust に追加**

`src-tauri/src/commands/webview.rs` の末尾に追加：

```rust
#[tauri::command]
pub async fn eval_in_webview(
    app: AppHandle,
    label: String,
    script: String,
) -> Result<(), String> {
    if let Some(webview) = app.get_webview(&label) {
        webview.eval(&script).map_err(|e| e.to_string())?;
    }
    Ok(())
}
```

`src-tauri/src/lib.rs` の `invoke_handler` を以下の完全な状態に更新：

```rust
.invoke_handler(tauri::generate_handler![
    commands::settings::load_settings,
    commands::settings::save_settings,
    commands::webview::create_column_webview,
    commands::webview::remove_column_webview,
    commands::webview::resize_column_webview,
    commands::webview::open_popup_window,
    commands::webview::eval_in_webview,
    commands::account::open_add_account_window,
    commands::account::notify_account_logged_in,
    commands::account::delete_account_data,
    commands::account::close_window,
])
```

- [ ] **Step 3: close_window コマンドを account.rs に追加**

`src-tauri/src/commands/account.rs` の末尾に追加：

```rust
#[tauri::command]
pub async fn close_window(app: AppHandle, label: String) -> Result<(), String> {
    if let Some(window) = app.get_window(&label) {
        window.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}
```

- [ ] **Step 4: 全体ビルドが通ることを確認**

```bash
npm run tauri build -- --debug
```

Expected: Build成功、実行ファイルが生成される

- [ ] **Step 5: 手動動作確認**

```bash
npm run tauri dev
```

確認項目：

1. アプリが起動してメインウィンドウが開く
2. 「👤」ボタンからアカウント管理パネルが開く
3. 「アカウントを追加」でX.comのログイン画面が開く
4. ログイン後にアカウントが追加される
5. 「+」ボタンからカラム追加ダイアログが開く
6. カラムを追加するとx.comのコンテンツがWebViewに表示される
7. カラムの✕ボタンでカラムが削除される
8. アプリを再起動しても前回のカラムが復元される

- [ ] **Step 6: コミット**

```bash
git add src/App.tsx src/App.module.scss src-tauri/
git commit -m "feat: implement main app layout with column management"
```

---

## Task 14: 最終確認・クリーンアップ

**Files:**

- Modify: `CALUDE.md` → `CLAUDE.md` (誤字修正)
- Create: `.gitignore`

- [ ] **Step 1: .gitignore を作成**

```gitignore
# .gitignore
node_modules/
dist/
src-tauri/target/
.tauri/
src-tauri/gen/
.superpowers/
aidlc-docs/audit.md
```

- [ ] **Step 2: テストスイート全体を実行**

```bash
npx vitest run
```

Expected: 全テストがPASS（15+ tests）

- [ ] **Step 3: 型チェックを実行**

```bash
npx tsc --noEmit
```

Expected: エラーなし

- [ ] **Step 4: Rustのビルドチェック**

```bash
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
```

Expected: 警告なし

- [ ] **Step 5: 最終コミット**

```bash
git add .
git commit -m "feat: complete Twitter Viewer MVP implementation"
```

---

## 実装後の確認チェックリスト

- [ ] 複数アカウントのログインが正常に動作する
- [ ] 複数カラムが横に並んで表示される
- [ ] タブ自動選択（homeTabName）が正常に動作する
- [ ] 自動更新（auto-reload）が動作する
- [ ] 不要領域の非表示（area-remove）が適用される
- [ ] 画像クリック時に別ウィンドウでポップアップが開く
- [ ] アプリ再起動後にカラム・アカウントが復元される
- [ ] ウィンドウリサイズ時にWebViewのサイズが追従する
