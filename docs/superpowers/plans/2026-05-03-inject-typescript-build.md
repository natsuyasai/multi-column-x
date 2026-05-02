# Inject Scripts TypeScript Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** inject JSファイルをTypeScriptで記述し、Viteで事前ビルドして `src-tauri/src/inject/` に出力する仕組みを構築する。

**Architecture:** `src-tauri/src/inject/_src/` にTypeScriptソースを配置し、`vite.inject.config.ts` で各ファイルをIIFE形式にビルドして同じ inject ディレクトリに出力する。Rustの `include_str!()` 参照先は変更しない。package.json の `dev`/`build` スクリプトに `build:inject` を前置して自動実行する。

**Tech Stack:** TypeScript 5.8, Vite 7, IIFE output format

---

### Task 1: tsconfig.inject.json を作成する

**Files:**
- Create: `tsconfig.inject.json`

- [ ] **Step 1: tsconfig.inject.json を作成する**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["src-tauri/src/inject/_src"]
}
```

- [ ] **Step 2: コミットする**

```bash
git add tsconfig.inject.json
git commit -m "build: add tsconfig for inject scripts"
```

---

### Task 2: グローバル型定義ファイルを作成する

inject スクリプトが参照する `window.__twitterViewer`、`window.__twitterViewerConfig`、`window.__TAURI__`、`window.__TAURI_INTERNALS__` の型を定義する。

**Files:**
- Create: `src-tauri/src/inject/_src/types.d.ts`

- [ ] **Step 1: `_src/` ディレクトリを作成し、types.d.ts を作成する**

```typescript
// src-tauri/src/inject/_src/types.d.ts

interface TwitterViewerAPI {
  selectHomeTab: () => void;
  applyCustomCSS: (css: string) => void;
  triggerReload: () => void;
  applyAreaRemove: (enabled: boolean) => void;
}

interface TwitterViewerConfig {
  areaRemoveEnabled: boolean;
}

interface TauriCore {
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
}

interface TauriGlobal {
  core?: TauriCore;
  invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
}

interface TauriInternalsMetadata {
  currentWindow?: { label: string };
}

interface TauriInternals {
  metadata?: TauriInternalsMetadata;
}

declare global {
  interface Window {
    __twitterViewer: TwitterViewerAPI;
    __twitterViewerConfig?: TwitterViewerConfig;
    __TAURI__?: TauriGlobal;
    __TAURI_INTERNALS__?: TauriInternals;
  }
}

export {};
```

- [ ] **Step 2: コミットする**

```bash
git add src-tauri/src/inject/_src/types.d.ts
git commit -m "build: add global type definitions for inject scripts"
```

---

### Task 3: vite.inject.config.ts を作成する

**Files:**
- Create: `vite.inject.config.ts`

- [ ] **Step 1: vite.inject.config.ts を作成する**

```typescript
// vite.inject.config.ts
import { defineConfig } from "vite";
import { resolve } from "path";

const srcDir = resolve(__dirname, "src-tauri/src/inject/_src");
const outDir = resolve(__dirname, "src-tauri/src/inject");

export default defineConfig({
  build: {
    outDir,
    emptyOutDir: false,
    minify: false,
    lib: {
      entry: {
        image_popup: resolve(srcDir, "image_popup.ts"),
        tab_selector: resolve(srcDir, "tab_selector.ts"),
        header_customizer: resolve(srcDir, "header_customizer.ts"),
        custom_css: resolve(srcDir, "custom_css.ts"),
        auto_reload: resolve(srcDir, "auto_reload.ts"),
        scroll_event: resolve(srcDir, "scroll_event.ts"),
      },
      formats: ["iife"],
    },
    rollupOptions: {
      output: {
        entryFileNames: "[name].js",
      },
    },
  },
});
```

- [ ] **Step 2: コミットする**

```bash
git add vite.inject.config.ts
git commit -m "build: add vite config for inject scripts"
```

---

### Task 4: package.json の scripts を更新する

**Files:**
- Modify: `package.json`

- [ ] **Step 1: package.json の scripts セクションを確認する**

```bash
cat package.json | grep -A 10 '"scripts"'
```

- [ ] **Step 2: scripts を更新する**

現在の `dev` と `build` スクリプトの前に `build:inject` を追加する。`package.json` の scripts セクションを以下に変更する:

```json
"scripts": {
  "build:inject": "vite build --config vite.inject.config.ts",
  "dev": "npm run build:inject && tauri dev",
  "build": "npm run build:inject && tauri build",
  "preview": "vite preview",
  "test": "vitest"
}
```

※ 既存の `dev`/`build` の内容を確認した上で、先頭に `npm run build:inject &&` を追加する。他のスクリプトは既存のまま維持すること。

- [ ] **Step 3: コミットする**

```bash
git add package.json
git commit -m "build: prepend build:inject to dev and build scripts"
```

---

### Task 5: custom_css.ts を作成する（最もシンプルなスクリプトから移行）

**Files:**
- Create: `src-tauri/src/inject/_src/custom_css.ts`

- [ ] **Step 1: custom_css.ts を作成する**

```typescript
// src-tauri/src/inject/_src/custom_css.ts
(function () {
  const CUSTOM_CSS_ID = "twitter-viewer-custom-css";

  function applyCustomCSS(css: string): void {
    const existing = document.getElementById(CUSTOM_CSS_ID);
    if (existing) existing.remove();
    if (!css || css.trim() === "") return;
    const style = document.createElement("style");
    style.id = CUSTOM_CSS_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  window.__twitterViewer = window.__twitterViewer || ({} as Window["__twitterViewer"]);
  window.__twitterViewer.applyCustomCSS = applyCustomCSS;
})();
```

- [ ] **Step 2: ビルドして確認する**

```bash
npm run build:inject
```

期待される結果: `src-tauri/src/inject/custom_css.js` が生成される（エラーなし）

- [ ] **Step 3: コミットする**

```bash
git add src-tauri/src/inject/_src/custom_css.ts
git commit -m "feat: migrate custom_css inject script to TypeScript"
```

---

### Task 6: scroll_event.ts を作成する

**Files:**
- Create: `src-tauri/src/inject/_src/scroll_event.ts`

- [ ] **Step 1: scroll_event.ts を作成する**

```typescript
// src-tauri/src/inject/_src/scroll_event.ts
(function () {
  let accumulatedDelta = 0;
  let ticking = false;

  window.addEventListener(
    "wheel",
    function (e: WheelEvent) {
      const deltaX = e.deltaX;
      const deltaY = e.deltaY;
      const delta = Math.abs(deltaX) >= Math.abs(deltaY) ? deltaX : 0;
      if (delta === 0) return;

      accumulatedDelta += delta;

      if (!ticking) {
        ticking = true;
        requestAnimationFrame(function () {
          const d = accumulatedDelta;
          accumulatedDelta = 0;
          ticking = false;
          const invoke =
            window.__TAURI__?.core?.invoke ?? window.__TAURI__?.invoke;
          if (invoke) {
            invoke("report_webview_scroll", { delta: d }).catch(function () {});
          }
        });
      }
    },
    { passive: true }
  );
})();
```

- [ ] **Step 2: ビルドして確認する**

```bash
npm run build:inject
```

期待される結果: `src-tauri/src/inject/scroll_event.js` が生成される（エラーなし）

- [ ] **Step 3: コミットする**

```bash
git add src-tauri/src/inject/_src/scroll_event.ts
git commit -m "feat: migrate scroll_event inject script to TypeScript"
```

---

### Task 7: auto_reload.ts を作成する

**Files:**
- Create: `src-tauri/src/inject/_src/auto_reload.ts`

- [ ] **Step 1: auto_reload.ts を作成する**

```typescript
// src-tauri/src/inject/_src/auto_reload.ts
(function () {
  function isScrolling(): boolean {
    return document.scrollingElement
      ? document.scrollingElement.scrollTop > 0
      : false;
  }

  function isFollowingTabActive(): boolean {
    const tabs = document.querySelectorAll<HTMLElement>("div[role='tab']");
    for (const elem of tabs) {
      if (
        elem.getAttribute("aria-selected") === "true" &&
        elem.hasAttribute("aria-expanded")
      ) {
        return true;
      }
    }
    return false;
  }

  function findNewPostsButton(): HTMLButtonElement | null {
    const section = document.querySelector("section[aria-labelledby]");
    if (!section) return null;
    const cells = section.querySelectorAll('[data-testid="cellInnerDiv"]');
    for (const cell of cells) {
      if (cell.querySelector("article")) continue;
      const btn = cell.querySelector<HTMLButtonElement>('button[type="button"]');
      if (btn) return btn;
    }
    return null;
  }

  function waitAndClickNewPostsButton(): void {
    const btn = findNewPostsButton();
    if (btn) {
      btn.click();
      return;
    }
    const section = document.querySelector("section[aria-labelledby]");
    if (!section) return;
    const observer = new MutationObserver(function () {
      const found = findNewPostsButton();
      if (found) {
        observer.disconnect();
        found.click();
      }
    });
    observer.observe(section, { childList: true, subtree: true });
    setTimeout(function () {
      observer.disconnect();
    }, 30000);
  }

  function triggerFollowingRefresh(): void {
    window.dispatchEvent(new Event("focus"));
    waitAndClickNewPostsButton();
  }

  function reselectTab(): void {
    const tabs = document.querySelectorAll<HTMLElement>("div[role='tab']");
    for (const elem of tabs) {
      if (elem.getAttribute("aria-selected") === "true") {
        if (!elem.hasAttribute("aria-expanded")) {
          elem.click();
        }
        break;
      }
    }
  }

  function triggerReload(): void {
    if (isScrolling()) return;
    if (isFollowingTabActive()) {
      triggerFollowingRefresh();
    } else {
      reselectTab();
    }
  }

  window.__twitterViewer = window.__twitterViewer || ({} as Window["__twitterViewer"]);
  window.__twitterViewer.triggerReload = triggerReload;
})();
```

- [ ] **Step 2: ビルドして確認する**

```bash
npm run build:inject
```

期待される結果: `src-tauri/src/inject/auto_reload.js` が生成される（エラーなし）

- [ ] **Step 3: コミットする**

```bash
git add src-tauri/src/inject/_src/auto_reload.ts
git commit -m "feat: migrate auto_reload inject script to TypeScript"
```

---

### Task 8: tab_selector.ts を作成する

**Files:**
- Create: `src-tauri/src/inject/_src/tab_selector.ts`

- [ ] **Step 1: tab_selector.ts を作成する**

```typescript
// src-tauri/src/inject/_src/tab_selector.ts
(function () {
  function isHomeURL(): boolean {
    const href = location.href;
    return (
      href === "https://x.com" ||
      href === "https://x.com/" ||
      href.indexOf("https://x.com/home") === 0
    );
  }

  function getTabNameFromURL(): string | null {
    if (!isHomeURL()) return null;
    const search = location.search;
    if (!search || search.length <= 1) return null;
    const params = new URLSearchParams(search);
    const firstKey = Array.from(params.keys())[0];
    if (firstKey && !params.get(firstKey)) {
      return decodeURIComponent(firstKey);
    }
    return null;
  }

  function selectTab(tabName: string): boolean {
    const tabs = document.querySelectorAll<HTMLElement>(
      'div[role="tablist"] div[role="tab"]'
    );
    for (const tab of tabs) {
      const span = tab.querySelector("span");
      if (span && span.textContent === tabName) {
        tab.click();
        return true;
      }
    }
    return false;
  }

  function trySelectWithObserver(tabName: string): void {
    if (document.querySelector('div[role="tablist"]')) {
      if (!selectTab(tabName)) {
        setTimeout(function () {
          selectTab(tabName);
        }, 1000);
      }
      return;
    }
    const observer = new MutationObserver(function () {
      if (document.querySelector('div[role="tablist"]')) {
        observer.disconnect();
        if (!selectTab(tabName)) {
          setTimeout(function () {
            selectTab(tabName);
          }, 1000);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(function () {
      observer.disconnect();
    }, 5000);
  }

  function initializeTab(): void {
    const tabName = getTabNameFromURL();
    if (!tabName) return;
    trySelectWithObserver(tabName);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeTab);
  } else {
    initializeTab();
  }

  let lastUrl = location.href;
  new MutationObserver(function () {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      initializeTab();
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  window.__twitterViewer = window.__twitterViewer || ({} as Window["__twitterViewer"]);
  window.__twitterViewer.selectHomeTab = function () {};
})();
```

- [ ] **Step 2: ビルドして確認する**

```bash
npm run build:inject
```

期待される結果: `src-tauri/src/inject/tab_selector.js` が生成される（エラーなし）

- [ ] **Step 3: コミットする**

```bash
git add src-tauri/src/inject/_src/tab_selector.ts
git commit -m "feat: migrate tab_selector inject script to TypeScript"
```

---

### Task 9: image_popup.ts を作成する

**Files:**
- Create: `src-tauri/src/inject/_src/image_popup.ts`

- [ ] **Step 1: image_popup.ts を作成する**

```typescript
// src-tauri/src/inject/_src/image_popup.ts
(function () {
  function isMediaLink(href: string): boolean {
    return (
      /\/status\/\d+\/(photo|video)\//.test(href) ||
      /\/i\/status\/\d+/.test(href)
    );
  }

  function resolveAbsolute(href: string): string {
    return href.startsWith("http") ? href : "https://x.com" + href;
  }

  function tauriInvoke(cmd: string, args: Record<string, unknown>): void {
    const invoke =
      window.__TAURI__?.core?.invoke ?? window.__TAURI__?.invoke;
    if (invoke) {
      invoke(cmd, args);
    }
  }

  document.addEventListener(
    "click",
    function (e: MouseEvent) {
      const target = e.target as Element | null;
      if (!target) return;
      const link = target.closest("a");
      if (!link) return;

      if (link.hasAttribute("data-tv-navlink")) return;

      const href = link.getAttribute("href") ?? "";
      if (!href || href.startsWith("#") || href.startsWith("javascript:"))
        return;

      if (isMediaLink(href)) {
        e.preventDefault();
        e.stopPropagation();
        const label =
          window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label ??
          "unknown";
        tauriInvoke("open_popup_window", {
          webviewLabelCaller: label,
          url: resolveAbsolute(href),
        });
      }
    },
    true
  );
})();
```

- [ ] **Step 2: ビルドして確認する**

```bash
npm run build:inject
```

期待される結果: `src-tauri/src/inject/image_popup.js` が生成される（エラーなし）

- [ ] **Step 3: コミットする**

```bash
git add src-tauri/src/inject/_src/image_popup.ts
git commit -m "feat: migrate image_popup inject script to TypeScript"
```

---

### Task 10: header_customizer.ts を作成する（最も複雑）

**Files:**
- Create: `src-tauri/src/inject/_src/header_customizer.ts`

- [ ] **Step 1: header_customizer.ts を作成する**

```typescript
// src-tauri/src/inject/_src/header_customizer.ts
(function () {
  const HEADER_HIDE_STYLE_ID = "twitter-viewer-header-hide";
  const INPUT_HIDE_STYLE_ID = "twitter-viewer-input-hide";
  const NAV_CONTAINER_ID = "twitter-viewer-nav-container";
  const NAV_VISIBLE_KEY = "twitter-viewer-nav-visible";

  const COMPOSE_ICON_PATH =
    "M23 3c-6.62-.1-10.38 2.421-13.05 6.03C7.29 12.61 6 17.331 6 22h2c0-1.007.07-2.012.19-3H12c4.1 0 7.48-3.082 7.94-7.054C22.79 10.147 23.17 6.359 23 3zm-7 8h-1.5v2H16c.63-.016 1.2-.08 1.72-.188C16.95 15.24 14.68 17 12 17H8.55c.57-2.512 1.57-4.851 3-6.78 2.16-2.912 5.29-4.911 9.45-5.187C20.95 8.079 19.9 11 16 11zM4 9V6H1V4h3V1h2v3h3v2H6v3H4z";
  const CLOSE_ICON_PATH =
    "M10.59 12L4.54 5.96l1.42-1.42L12 10.59l6.04-6.05 1.42 1.42L13.41 12l6.05 6.04-1.42 1.42L12 13.41l-6.04 6.05-1.42-1.42L10.59 12z";

  interface NavLink {
    href: string;
    ariaLabel: string;
    svgContent: string;
  }

  const DEFAULT_NAV_LINKS: NavLink[] = [
    {
      href: "/home",
      ariaLabel: "ホーム",
      svgContent:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><g><path d="M21.591 7.146L12.52 1.157c-.316-.21-.724-.21-1.04 0l-9.071 5.99c-.26.173-.409.456-.409.757v13.183c0 .502.418.913.929.913h6.638c.511 0 .929-.41.929-.913v-7.075h3.008v7.075c0 .502.418.913.929.913h6.639c.51 0 .928-.41.928-.913V7.904c0-.301-.158-.584-.408-.758zM20 20l-4.5.01.011-7.097c0-.502-.418-.913-.928-.913H9.44c-.511 0-.929.41-.929.913L8.5 20H4V8.773l8.011-5.342L20 8.764z"></path></g></svg>',
    },
    {
      href: "/notifications",
      ariaLabel: "通知",
      svgContent:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><g><path d="M19.993 9.042C19.48 5.017 16.054 2 11.996 2s-7.49 3.021-7.999 7.051L2.866 18H7.1c.463 2.282 2.481 4 4.9 4s4.437-1.718 4.9-4h4.236l-1.143-8.958zM12 20c-1.306 0-2.417-.835-2.829-2h5.658c-.412 1.165-1.523 2-2.829 2zm-6.866-4l.847-6.698C6.364 6.272 8.941 4 11.996 4s5.627 2.268 6.013 5.295L18.864 16H5.134z"></path></g></svg>",
    },
    {
      href: "/messages",
      ariaLabel: "ダイレクトメッセージ",
      svgContent:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><g><path d="M1.998 5.5c0-1.381 1.119-2.5 2.5-2.5h15c1.381 0 2.5 1.119 2.5 2.5v13c0 1.381-1.119 2.5-2.5 2.5h-15c-1.381 0-2.5-1.119-2.5-2.5v-13zm2.5-.5c-.276 0-.5.224-.5.5v2.764l8 3.638 8-3.636V5.5c0-.276-.224-.5-.5-.5h-15zm15.5 5.463l-8 3.636-8-3.638V18.5c0 .276.224.5.5.5h15c.276 0 .5-.224.5-.5v-8.037z"></path></g></svg>',
    },
    {
      href: "/i/bookmarks",
      ariaLabel: "ブックマーク",
      svgContent:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><g><path d="M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5zM6.5 4c-.276 0-.5.22-.5.5v14.56l6-4.29 6 4.29V4.5c0-.28-.224-.5-.5-.5h-11z"></path></g></svg>",
    },
    {
      href: "/compose/post",
      ariaLabel: "ポストする",
      svgContent: `<svg viewBox="0 0 24 24" aria-hidden="true"><g><path d="${COMPOSE_ICON_PATH}"></path></g></svg>`,
    },
  ];

  let currentEnabled = !(
    window.__twitterViewerConfig &&
    window.__twitterViewerConfig.areaRemoveEnabled === false
  );

  function setStyle(id: string, css: string, enabled: boolean): void {
    const el = document.getElementById(id);
    if (enabled) {
      if (!el) {
        const s = document.createElement("style");
        s.id = id;
        s.textContent = css;
        (document.head || document.documentElement).appendChild(s);
      }
    } else {
      if (el) el.remove();
    }
  }

  function applyHideStyles(enabled: boolean): void {
    setStyle(
      HEADER_HIDE_STYLE_ID,
      "header[role='banner'] { display: none !important; }",
      enabled
    );
    setStyle(
      INPUT_HIDE_STYLE_ID,
      "div:has(> [role='progressbar'] + * div[data-testid*='tweetTextarea']) { display: none !important; }",
      enabled
    );
  }

  function ensureHideStylesApplied(): void {
    if (!currentEnabled) return;
    if (document.getElementById(HEADER_HIDE_STYLE_ID)) return;

    if (document.head) {
      applyHideStyles(true);
      return;
    }

    applyHideStyles(true);
    const headObserver = new MutationObserver(function () {
      if (document.head) {
        headObserver.disconnect();
        const el1 = document.getElementById(HEADER_HIDE_STYLE_ID);
        const el2 = document.getElementById(INPUT_HIDE_STYLE_ID);
        if (el1) document.head.appendChild(el1);
        if (el2) document.head.appendChild(el2);
      }
    });
    headObserver.observe(document.documentElement, { childList: true });
  }

  function applyContainerStyles(el: HTMLElement): void {
    el.style.cssText = [
      "position:fixed",
      "bottom:0",
      "left:0",
      "width:100%",
      "z-index:2147483647",
      "pointer-events:none",
      "display:flex",
      "align-items:flex-end",
      "padding:10px",
      "gap:10px",
      "box-sizing:border-box",
    ].join(";");
  }

  function applyToggleStyles(el: HTMLElement): void {
    el.style.cssText = [
      "pointer-events:auto",
      "width:50px",
      "height:50px",
      "border-radius:50%",
      "background:rgba(29,155,240,0.9)",
      "color:#fff",
      "border:none",
      "cursor:pointer",
      "font-size:24px",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "box-shadow:0 4px 12px rgba(0,0,0,0.3)",
      "transition:background 0.2s",
      "flex-shrink:0",
    ].join(";");
  }

  function applyNavBarStyles(el: HTMLElement, visible: boolean): void {
    el.style.cssText = [
      "pointer-events:" + (visible ? "auto" : "none"),
      "background:rgba(0,0,0,0.85)",
      "backdrop-filter:blur(10px)",
      "border-radius:50px",
      "padding:10px 20px",
      "box-shadow:0 4px 20px rgba(0,0,0,0.3)",
      "display:flex",
      "flex-direction:row",
      "align-items:center",
      "gap:10px",
      "max-width:calc(100vw - 120px)",
      "overflow-x:auto",
      "overflow-y:hidden",
      "opacity:" + (visible ? "1" : "0"),
      "transform:" + (visible ? "scale(1)" : "scale(0.8)"),
      "transition:opacity 0.3s,transform 0.3s",
    ].join(";");
    el.setAttribute("data-visible", visible ? "1" : "0");
  }

  function applyNavLinkStyles(el: HTMLElement, isCompose: boolean): void {
    el.style.cssText = [
      "pointer-events:auto",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "width:40px",
      "height:40px",
      "border-radius:50%",
      "text-decoration:none",
      "color:#fff",
      "flex-shrink:0",
      "background:" + (isCompose ? "rgb(239,243,244)" : "transparent"),
      "transition:background 0.2s",
    ].join(";");
  }

  function buildNavContainer(
    links: NavLink[],
    isVisible: boolean
  ): HTMLElement {
    const container = document.createElement("div");
    container.id = NAV_CONTAINER_ID;
    container.setAttribute("data-twitter-viewer", "1");
    applyContainerStyles(container);

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.setAttribute("data-tv-toggle", "1");
    toggleBtn.title = isVisible ? "ナビゲーションを非表示" : "ナビゲーションを表示";
    applyToggleStyles(toggleBtn);
    toggleBtn.innerHTML = isVisible ? "&times;" : "&#9776;";

    const navBar = document.createElement("div");
    navBar.setAttribute("data-tv-navbar", "1");
    applyNavBarStyles(navBar, isVisible);

    links.forEach(function (link) {
      const a = document.createElement("a");
      a.href = link.href;
      a.setAttribute("aria-label", link.ariaLabel);
      a.setAttribute("data-tv-navlink", "1");
      applyNavLinkStyles(a, link.href === "/compose/post");
      a.innerHTML = link.svgContent;
      navBar.appendChild(a);
    });

    toggleBtn.addEventListener("click", function (e: MouseEvent) {
      e.preventDefault();
      e.stopPropagation();
      const visible = navBar.getAttribute("data-visible") === "1";
      setNavVisible(!visible);
    });

    container.appendChild(toggleBtn);
    container.appendChild(navBar);
    return container;
  }

  function setNavVisible(visible: boolean): void {
    const container = document.getElementById(NAV_CONTAINER_ID);
    if (!container) return;
    const toggleBtn = container.querySelector<HTMLElement>("[data-tv-toggle]");
    const navBar = container.querySelector<HTMLElement>("[data-tv-navbar]");
    if (!navBar || !toggleBtn) return;
    applyNavBarStyles(navBar, visible);
    toggleBtn.innerHTML = visible ? "&times;" : "&#9776;";
    toggleBtn.title = visible ? "ナビゲーションを非表示" : "ナビゲーションを表示";
    try {
      localStorage.setItem(NAV_VISIBLE_KEY, String(visible));
    } catch (_e) {}
  }

  function toggleTweetInput(): void {
    const el = document.getElementById(INPUT_HIDE_STYLE_ID);
    const container = document.getElementById(NAV_CONTAINER_ID);
    const composeLink = container?.querySelector<HTMLElement>(
      'a[href="/compose/post"]'
    );
    if (el) {
      el.remove();
      if (composeLink) {
        composeLink.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><g><path d="${CLOSE_ICON_PATH}"></path></g></svg>`;
        composeLink.setAttribute("aria-label", "閉じる");
      }
    } else {
      setStyle(
        INPUT_HIDE_STYLE_ID,
        "div:has(> [role='progressbar'] + * div[data-testid*='tweetTextarea']) { display: none !important; }",
        true
      );
      if (composeLink) {
        composeLink.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><g><path d="${COMPOSE_ICON_PATH}"></path></g></svg>`;
        composeLink.setAttribute("aria-label", "ポストする");
      }
    }
  }

  document.addEventListener(
    "click",
    function (e: MouseEvent) {
      const target = e.target as Element | null;
      const link = target?.closest("[data-tv-navlink]") ?? null;
      if (!link) return;
      const href = link.getAttribute("href") ?? "";
      if (href === "/compose/post") {
        e.preventDefault();
        e.stopPropagation();
        toggleTweetInput();
      }
    },
    true
  );

  function extractLinksFromHeader(): NavLink[] | false {
    const header = document.querySelector("header[role='banner']");
    if (!header) return false;
    const anchors = header.querySelectorAll<HTMLAnchorElement>('a[role="link"]');
    if (!anchors.length) return false;

    const links: NavLink[] = [];
    anchors.forEach(function (a) {
      const href = a.getAttribute("href");
      const ariaLabel = a.getAttribute("aria-label");
      const svg = a.querySelector("svg");
      if (!href || !ariaLabel || ariaLabel === "X" || !svg) return;
      links.push({ href, ariaLabel, svgContent: svg.outerHTML });
    });
    const hasCompose = links.some((l) => l.href === "/compose/post");
    if (!hasCompose) {
      links.push(DEFAULT_NAV_LINKS[DEFAULT_NAV_LINKS.length - 1]);
    }
    return links.length ? links : false;
  }

  function mountNavBar(links: NavLink[]): void {
    if (document.getElementById(NAV_CONTAINER_ID)) return;
    let isVisible: boolean;
    try {
      const stored = localStorage.getItem(NAV_VISIBLE_KEY);
      isVisible = stored === null ? false : stored === "true";
    } catch (_e) {
      isVisible = false;
    }
    const container = buildNavContainer(links, isVisible);
    document.body.appendChild(container);
  }

  function waitAndMount(): void {
    let retryCount = 0;
    const maxRetries = 10;
    let retryTimer: ReturnType<typeof setInterval> | null = null;
    let observer: MutationObserver | null = null;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;

    function tryMount(): boolean {
      const links = extractLinksFromHeader();
      if (links) {
        if (retryTimer) clearInterval(retryTimer);
        if (observer) observer.disconnect();
        if (timeoutTimer) clearTimeout(timeoutTimer);
        mountNavBar(links);
        return true;
      }
      return false;
    }

    setTimeout(function () {
      if (tryMount()) return;

      retryTimer = setInterval(function () {
        retryCount++;
        if (tryMount()) return;
        if (retryCount >= maxRetries) {
          if (retryTimer) clearInterval(retryTimer);
          observer = new MutationObserver(function () {
            if (tryMount()) observer?.disconnect();
          });
          observer.observe(document.body || document.documentElement, {
            childList: true,
            subtree: true,
          });
        }
      }, 200);

      timeoutTimer = setTimeout(function () {
        if (retryTimer) clearInterval(retryTimer);
        if (observer) observer.disconnect();
        if (!document.getElementById(NAV_CONTAINER_ID)) {
          mountNavBar(DEFAULT_NAV_LINKS);
        }
      }, 5000);
    }, 100);
  }

  function applyAreaRemove(enabled: boolean): void {
    currentEnabled = enabled;
    if (enabled) {
      ensureHideStylesApplied();
      const container = document.getElementById(NAV_CONTAINER_ID);
      if (!container) waitAndMount();
    } else {
      applyHideStyles(false);
      const container = document.getElementById(NAV_CONTAINER_ID);
      if (container) container.remove();
    }
  }

  if (currentEnabled) {
    ensureHideStylesApplied();
  }

  function initNavBar(): void {
    if (currentEnabled) waitAndMount();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initNavBar);
  } else {
    initNavBar();
  }

  window.__twitterViewer = window.__twitterViewer || ({} as Window["__twitterViewer"]);
  window.__twitterViewer.applyAreaRemove = applyAreaRemove;
})();
```

- [ ] **Step 2: ビルドして確認する**

```bash
npm run build:inject
```

期待される結果: `src-tauri/src/inject/header_customizer.js` が生成される（エラーなし）

- [ ] **Step 3: コミットする**

```bash
git add src-tauri/src/inject/_src/header_customizer.ts
git commit -m "feat: migrate header_customizer inject script to TypeScript"
```

---

### Task 11: .gitignore を更新して旧JSファイルを除外する

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: .gitignore に追記する**

`.gitignore` の末尾に以下を追記する:

```
# inject scripts build artifacts
src-tauri/src/inject/*.js
```

- [ ] **Step 2: 既存のJSファイルをgit管理から除外する**

```bash
git rm --cached src-tauri/src/inject/auto_reload.js src-tauri/src/inject/custom_css.js src-tauri/src/inject/header_customizer.js src-tauri/src/inject/image_popup.js src-tauri/src/inject/scroll_event.js src-tauri/src/inject/tab_selector.js
```

- [ ] **Step 3: コミットする**

```bash
git add .gitignore
git commit -m "build: exclude inject build artifacts from git tracking"
```

---

### Task 12: 全体ビルドの動作確認

- [ ] **Step 1: inject スクリプトを全件ビルドして確認する**

```bash
npm run build:inject
```

期待される結果: 6つのJSファイルが `src-tauri/src/inject/` に生成される（エラーなし）

- [ ] **Step 2: `tauri build` 全体をドライランして確認する（フロントエンドビルドまで）**

```bash
npm run build:inject && vite build
```

期待される結果: フロントエンドビルドが完了する（エラーなし）

- [ ] **Step 3: 最終コミット**

```bash
git add -A
git commit -m "feat: complete inject scripts TypeScript migration"
```
