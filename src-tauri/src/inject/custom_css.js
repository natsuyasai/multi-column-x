// src-tauri/src/inject/custom_css.js
(function() {
  var CUSTOM_CSS_ID = 'twitter-viewer-custom-css';

  function applyCustomCSS(css) {
    var existing = document.getElementById(CUSTOM_CSS_ID);
    if (existing) existing.remove();
    if (!css || css.trim() === '') return;
    var style = document.createElement('style');
    style.id = CUSTOM_CSS_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  window.__twitterViewer = window.__twitterViewer || {};
  window.__twitterViewer.applyCustomCSS = applyCustomCSS;
})();
