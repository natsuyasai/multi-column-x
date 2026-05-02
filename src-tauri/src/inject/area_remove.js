// src-tauri/src/inject/area_remove.js
(function() {
  var SIDEBAR_STYLE_ID = 'twitter-viewer-sidebar-hide';
  var INPUT_STYLE_ID = 'twitter-viewer-input-hide';

  function applyAreaRemove(enabled) {
    if (!enabled) {
      var s1 = document.getElementById(SIDEBAR_STYLE_ID);
      var s2 = document.getElementById(INPUT_STYLE_ID);
      if (s1) s1.remove();
      if (s2) s2.remove();
      return;
    }
    if (!document.getElementById(SIDEBAR_STYLE_ID)) {
      var sidebarStyle = document.createElement('style');
      sidebarStyle.id = SIDEBAR_STYLE_ID;
      sidebarStyle.textContent = "header[role='banner'] { display: none !important; }";
      document.head.appendChild(sidebarStyle);
    }
    if (!document.getElementById(INPUT_STYLE_ID)) {
      var inputStyle = document.createElement('style');
      inputStyle.id = INPUT_STYLE_ID;
      inputStyle.textContent = "div:has(> [role='progressbar'] + * div[data-testid*='tweetTextarea']) { display: none !important; }";
      document.head.appendChild(inputStyle);
    }
    removeHomeTitleElement();
  }

  function removeHomeTitleElement() {
    var h2s = document.querySelectorAll('h2');
    for (var i = 0; i < h2s.length; i++) {
      if (h2s[i].innerHTML.indexOf('ホーム') >= 0) {
        var el = getElementWithNavAsSibling(h2s[i]);
        if (el) el.style.display = 'none';
        break;
      }
    }
  }

  function getElementWithNavAsSibling(el) {
    if (!el) return null;
    if (el.nextElementSibling !== null) return el;
    return getElementWithNavAsSibling(el.parentElement);
  }

  function debounce(fn, wait) {
    var t;
    return function() { clearTimeout(t); t = setTimeout(fn, wait); };
  }

  var debouncedApply = debounce(function() { applyAreaRemove(true); }, 500);
  var observer = new MutationObserver(debouncedApply);
  var main = document.getElementsByTagName('main');
  if (main.length > 0) {
    observer.observe(main[0], { childList: true, subtree: true });
  }

  window.__twitterViewer = window.__twitterViewer || {};
  window.__twitterViewer.applyAreaRemove = applyAreaRemove;

  applyAreaRemove(true);
})();
