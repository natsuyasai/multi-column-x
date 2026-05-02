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
