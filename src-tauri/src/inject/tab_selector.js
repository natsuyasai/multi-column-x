// src-tauri/src/inject/tab_selector.js
// URL パラメーターからタブ名を読み取り、対応するタブを選択する
// 例: https://x.com/home?フォロー中 → "フォロー中" タブを選択
(function() {
  function isHomeURL() {
    var href = location.href;
    return href === 'https://x.com' ||
           href === 'https://x.com/' ||
           href.indexOf('https://x.com/home') === 0;
  }

  function getTabNameFromURL() {
    if (!isHomeURL()) return null;
    var search = location.search;
    if (!search || search.length <= 1) return null;
    // "?タブ名" 形式: 値なしの最初のキーがタブ名
    var params = new URLSearchParams(search);
    var firstKey = Array.from(params.keys())[0];
    if (firstKey && !params.get(firstKey)) {
      return decodeURIComponent(firstKey);
    }
    return null;
  }

  function selectTab(tabName) {
    var tabs = document.querySelectorAll('div[role="tablist"] div[role="tab"]');
    for (var i = 0; i < tabs.length; i++) {
      var span = tabs[i].querySelector('span');
      if (span && span.textContent === tabName) {
        tabs[i].click();
        return true;
      }
    }
    return false;
  }

  function trySelectWithObserver(tabName) {
    if (document.querySelector('div[role="tablist"]')) {
      if (!selectTab(tabName)) {
        setTimeout(function() { selectTab(tabName); }, 1000);
      }
      return;
    }
    var observer = new MutationObserver(function() {
      if (document.querySelector('div[role="tablist"]')) {
        observer.disconnect();
        if (!selectTab(tabName)) {
          setTimeout(function() { selectTab(tabName); }, 1000);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(function() { observer.disconnect(); }, 5000);
  }

  function initializeTab() {
    var tabName = getTabNameFromURL();
    if (!tabName) return;
    trySelectWithObserver(tabName);
  }

  // DOMContentLoaded 後に実行（initialization_script はページ最初期に走るため）
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeTab);
  } else {
    initializeTab();
  }

  // SPA ナビゲーション対応: URL 変化を監視
  var lastUrl = location.href;
  new MutationObserver(function() {
    var currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      initializeTab();
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  // selectHomeTab は後方互換のため残すが実質不要
  window.__twitterViewer = window.__twitterViewer || {};
  window.__twitterViewer.selectHomeTab = function() {};
})();
