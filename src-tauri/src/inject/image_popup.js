(function() {
  function isMediaLink(href) {
    return /\/status\/\d+\/(photo|video)\//.test(href) || /\/i\/status\/\d+/.test(href);
  }
  function resolveAbsolute(href) {
    return href.startsWith("http") ? href : "https://x.com" + href;
  }
  function tauriInvoke(cmd, args) {
    const invoke = window.__TAURI__?.core?.invoke ?? window.__TAURI__?.invoke;
    if (invoke) {
      invoke(cmd, args);
    }
  }
  document.addEventListener(
    "click",
    function(e) {
      const target = e.target;
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
        const label = window.__TAURI_INTERNALS__?.metadata?.currentWebview?.label ?? "unknown";
        const accounts = window.__tvAccountList ?? [];
        tauriInvoke("open_popup_window", {
          webviewLabelCaller: label,
          url: resolveAbsolute(href),
          accounts
        });
      }
    },
    true
  );
})();
