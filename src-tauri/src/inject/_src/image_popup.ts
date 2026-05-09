// src-tauri/src/inject/_src/image_popup.ts
// コマンド名定数の一覧は constants.ts を参照
const OPEN_POPUP_WINDOW = "open_popup_window";

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
    const invoke = window.__TAURI__?.core?.invoke ?? window.__TAURI__?.invoke;
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
          window.__TAURI_INTERNALS__?.metadata?.currentWebview?.label ??
          "unknown";
        tauriInvoke(OPEN_POPUP_WINDOW, {
          webviewLabelCaller: label,
          url: resolveAbsolute(href),
        });
      }
    },
    true,
  );
})();
