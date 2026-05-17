// src-tauri/src/inject/_src/context_menu.ts
// コマンド名定数の一覧は constants.ts を参照
const OPEN_LINK_POPUP_WINDOW = "open_link_popup_window";

(function () {
  function resolveAbsolute(href: string): string {
    return href.startsWith("http") ? href : "https://x.com" + href;
  }

  function tauriInvoke(cmd: string, args: Record<string, unknown>): void {
    const invoke = window.__TAURI__?.core?.invoke ?? window.__TAURI__?.invoke;
    if (invoke) {
      invoke(cmd, args);
    }
  }

  function getCallerLabel(): string {
    return (
      (
        window.__TAURI_INTERNALS__ as {
          metadata?: { currentWebview?: { label?: string } };
        }
      )?.metadata?.currentWebview?.label ?? "unknown"
    );
  }

  let contextMenu: HTMLDivElement | null = null;

  function removeContextMenu(): void {
    if (contextMenu) {
      contextMenu.remove();
      contextMenu = null;
    }
  }

  function createContextMenu(x: number, y: number, href: string): void {
    removeContextMenu();

    const menu = document.createElement("div");
    menu.id = "tv-context-menu";
    menu.style.cssText = [
      "position: fixed",
      `left: ${x}px`,
      `top: ${y}px`,
      "z-index: 2147483647",
      "background: #15202b",
      "border: 1px solid #38444d",
      "border-radius: 6px",
      "padding: 4px 0",
      "min-width: 200px",
      "box-shadow: 0 4px 16px rgba(0,0,0,0.5)",
      "font-family: sans-serif",
      "font-size: 14px",
      "color: #e7e9ea",
    ].join(";");

    const item = document.createElement("div");
    item.textContent = "ポップアップウィンドウで開く";
    item.style.cssText = [
      "padding: 8px 16px",
      "cursor: pointer",
      "white-space: nowrap",
    ].join(";");
    item.addEventListener("mouseenter", () => {
      item.style.background = "#1d9bf0";
    });
    item.addEventListener("mouseleave", () => {
      item.style.background = "";
    });
    item.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      removeContextMenu();
      tauriInvoke(OPEN_LINK_POPUP_WINDOW, {
        webviewLabelCaller: getCallerLabel(),
        accountId: null,
        dataDirectory: null,
        url: resolveAbsolute(href),
      });
    });

    menu.appendChild(item);
    document.documentElement.appendChild(menu);
    contextMenu = menu;

    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = `${x - rect.width}px`;
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${y - rect.height}px`;
    }
  }

  document.addEventListener(
    "contextmenu",
    function (e: MouseEvent) {
      const target = e.target as Element | null;
      if (!target) return;
      const link = target.closest("a");
      if (!link) return;
      if (link.hasAttribute("data-tv-navlink")) return;

      const href = link.getAttribute("href") ?? "";
      if (!href || href.startsWith("#") || href.startsWith("javascript:"))
        return;

      e.preventDefault();
      e.stopPropagation();
      createContextMenu(e.clientX, e.clientY, href);
    },
    true,
  );

  document.addEventListener(
    "click",
    function () {
      removeContextMenu();
    },
    true,
  );

  document.addEventListener(
    "contextmenu",
    function () {
      removeContextMenu();
    },
    false,
  );
})();
