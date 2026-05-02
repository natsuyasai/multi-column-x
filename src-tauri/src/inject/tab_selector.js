(function() {
  function isHomeURL() {
    const href = location.href;
    return href === "https://x.com" || href === "https://x.com/" || href.indexOf("https://x.com/home") === 0;
  }
  function getTabNameFromURL() {
    if (!isHomeURL()) return null;
    const search = location.search;
    if (!search || search.length <= 1) return null;
    const params = new URLSearchParams(search);
    const firstKey = Array.from(params.keys())[0];
    if (firstKey && !params.get(firstKey)) {
      return decodeURIComponent(firstKey);
    }
    return null;
  }
  function selectTab(tabName) {
    const tabs = document.querySelectorAll(
      'div[role="tablist"] div[role="tab"]'
    );
    for (const tab of tabs) {
      const span = tab.querySelector("span");
      if (span && span.textContent === tabName) {
        tab.click();
        return true;
      }
    }
    return false;
  }
  function trySelectWithObserver(tabName) {
    if (document.querySelector('div[role="tablist"]')) {
      if (!selectTab(tabName)) {
        setTimeout(function() {
          selectTab(tabName);
        }, 1e3);
      }
      return;
    }
    const observer = new MutationObserver(function() {
      if (document.querySelector('div[role="tablist"]')) {
        observer.disconnect();
        if (!selectTab(tabName)) {
          setTimeout(function() {
            selectTab(tabName);
          }, 1e3);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(function() {
      observer.disconnect();
    }, 5e3);
  }
  function initializeTab() {
    const tabName = getTabNameFromURL();
    if (!tabName) return;
    trySelectWithObserver(tabName);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeTab);
  } else {
    initializeTab();
  }
  let lastUrl = location.href;
  new MutationObserver(function() {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      initializeTab();
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
  window.__twitterViewer = window.__twitterViewer || {};
  window.__twitterViewer.selectHomeTab = function() {
  };
})();
