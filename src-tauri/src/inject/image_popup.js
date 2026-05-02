// src-tauri/src/inject/image_popup.js
(function() {
  function isMediaLink(el) {
    if (!el) return false;
    var href = el.getAttribute('href') || '';
    return /\/status\/\d+\/(photo|video)\//.test(href) ||
           /\/i\/status\/\d+/.test(href);
  }

  document.addEventListener('click', function(e) {
    var target = e.target;
    if (!target) return;
    var link = target.closest('a');
    if (link && isMediaLink(link)) {
      e.preventDefault();
      e.stopPropagation();
      var href = link.getAttribute('href');
      var url = href.startsWith('http') ? href : 'https://x.com' + href;
      if (window.__TAURI__ && window.__TAURI__.invoke) {
        window.__TAURI__.invoke('open_popup_window', {
          webviewLabelCaller: window.__TAURI_INTERNALS__
            ? (window.__TAURI_INTERNALS__.metadata && window.__TAURI_INTERNALS__.metadata.currentWindow
                ? window.__TAURI_INTERNALS__.metadata.currentWindow.label
                : 'unknown')
            : 'unknown',
          url: url
        });
      }
    }
  }, true);
})();
