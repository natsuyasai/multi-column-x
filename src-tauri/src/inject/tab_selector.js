// src-tauri/src/inject/tab_selector.js
(function() {
  function selectHomeTab(tabName) {
    if (!tabName) return;
    var observer = new MutationObserver(function() {
      var tabs = document.querySelectorAll('[role="tab"]');
      for (var i = 0; i < tabs.length; i++) {
        if (tabs[i].textContent && tabs[i].textContent.includes(tabName)) {
          tabs[i].click();
          observer.disconnect();
          return;
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(function() { observer.disconnect(); }, 10000);
  }
  window.__twitterViewer = window.__twitterViewer || {};
  window.__twitterViewer.selectHomeTab = selectHomeTab;
})();
