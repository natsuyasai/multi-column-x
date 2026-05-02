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
      svgContent: `<svg viewBox="0 0 24 24" aria-hidden="true"><g><path d="M21.591 7.146L12.52 1.157c-.316-.21-.724-.21-1.04 0l-9.071 5.99c-.26.173-.409.456-.409.757v13.183c0 .502.418.913.929.913h6.638c.511 0 .929-.41.929-.913v-7.075h3.008v7.075c0 .502.418.913.929.913h6.639c.51 0 .928-.41.928-.913V7.904c0-.301-.158-.584-.408-.758zM20 20l-4.5.01.011-7.097c0-.502-.418-.913-.928-.913H9.44c-.511 0-.929.41-.929.913L8.5 20H4V8.773l8.011-5.342L20 8.764z"></path></g></svg>`,
    },
    {
      href: "/notifications",
      ariaLabel: "通知",
      svgContent: `<svg viewBox="0 0 24 24" aria-hidden="true"><g><path d="M19.993 9.042C19.48 5.017 16.054 2 11.996 2s-7.49 3.021-7.999 7.051L2.866 18H7.1c.463 2.282 2.481 4 4.9 4s4.437-1.718 4.9-4h4.236l-1.143-8.958zM12 20c-1.306 0-2.417-.835-2.829-2h5.658c-.412 1.165-1.523 2-2.829 2zm-6.866-4l.847-6.698C6.364 6.272 8.941 4 11.996 4s5.627 2.268 6.013 5.295L18.864 16H5.134z"></path></g></svg>`,
    },
    {
      href: "/messages",
      ariaLabel: "ダイレクトメッセージ",
      svgContent: `<svg viewBox="0 0 24 24" aria-hidden="true"><g><path d="M1.998 5.5c0-1.381 1.119-2.5 2.5-2.5h15c1.381 0 2.5 1.119 2.5 2.5v13c0 1.381-1.119 2.5-2.5 2.5h-15c-1.381 0-2.5-1.119-2.5-2.5v-13zm2.5-.5c-.276 0-.5.224-.5.5v2.764l8 3.638 8-3.636V5.5c0-.276-.224-.5-.5-.5h-15zm15.5 5.463l-8 3.636-8-3.638V18.5c0 .276.224.5.5.5h15c.276 0 .5-.224.5-.5v-8.037z"></path></g></svg>`,
    },
    {
      href: "/i/bookmarks",
      ariaLabel: "ブックマーク",
      svgContent: `<svg viewBox="0 0 24 24" aria-hidden="true"><g><path d="M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5zM6.5 4c-.276 0-.5.22-.5.5v14.56l6-4.29 6 4.29V4.5c0-.28-.224-.5-.5-.5h-11z"></path></g></svg>`,
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
