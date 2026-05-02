// src-tauri/src/inject/image_popup.js
(function() {
  function isMediaLink(href) {
    return /\/status\/\d+\/(photo|video)\//.test(href) ||
           /\/i\/status\/\d+/.test(href);
  }

  function resolveAbsolute(href) {
    return href.startsWith('http') ? href : 'https://x.com' + href;
  }

  function tauriInvoke(cmd, args) {
    if (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke) {
      window.__TAURI__.core.invoke(cmd, args);
    } else if (window.__TAURI__ && window.__TAURI__.invoke) {
      window.__TAURI__.invoke(cmd, args);
    }
  }

  document.addEventListener('click', function(e) {
    var target = e.target;
    if (!target) return;
    var link = target.closest('a');
    if (!link) return;

    // ナビバー内リンクは header_customizer.js が処理するため除外
    if (link.hasAttribute('data-tv-navlink')) return;

    var href = link.getAttribute('href') || '';
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;

    if (isMediaLink(href)) {
      e.preventDefault();
      e.stopPropagation();
      tauriInvoke('open_popup_window', {
        webviewLabelCaller: window.__TAURI_INTERNALS__
          ? (window.__TAURI_INTERNALS__.metadata && window.__TAURI_INTERNALS__.metadata.currentWindow
              ? window.__TAURI_INTERNALS__.metadata.currentWindow.label
              : 'unknown')
          : 'unknown',
        url: resolveAbsolute(href),
      });
    }
    // 外部リンクは Rust 側の on_navigation でデフォルトブラウザに渡す
    // x.com 内リンクはデフォルト動作（SPA ナビゲーション）に任せる
  }, true);
})();
