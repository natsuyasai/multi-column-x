// src-tauri/src/inject/scroll_event.js
// 横ホイールスクロールを Shell 側に通知する
(function() {
  var accumulatedDelta = 0;
  var ticking = false;

  window.addEventListener('wheel', function(e) {
    var deltaX = e.deltaX;
    var deltaY = e.deltaY;
    // トラックパッドの横スクロール、または Shift+ホイールの縦→横変換
    var delta = Math.abs(deltaX) >= Math.abs(deltaY) ? deltaX : 0;
    if (delta === 0) return;

    accumulatedDelta += delta;

    if (!ticking) {
      ticking = true;
      requestAnimationFrame(function() {
        var d = accumulatedDelta;
        accumulatedDelta = 0;
        ticking = false;
        // Tauri v2: withGlobalTauri が有効な場合 window.__TAURI__.core.invoke が使える
        var invoke = window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke;
        if (invoke) {
          invoke('report_webview_scroll', { delta: d }).catch(function() {});
        }
      });
    }
  }, { passive: true });
})();
