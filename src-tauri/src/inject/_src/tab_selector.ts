// src-tauri/src/inject/_src/tab_selector.ts
(function () {
  function isHomeURL(): boolean {
    const href = location.href;
    return (
      href === "https://x.com" ||
      href === "https://x.com/" ||
      href.indexOf("https://x.com/home") === 0
    );
  }

  function getTabNameFromURL(): string | null {
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

  function selectTab(tabName: string): boolean {
    const tabs = document.querySelectorAll<HTMLElement>(
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

  function trySelectWithObserver(tabName: string): void {
    if (document.querySelector('div[role="tablist"]')) {
      if (!selectTab(tabName)) {
        setTimeout(function () {
          selectTab(tabName);
        }, 1000);
      }
      return;
    }
    const observer = new MutationObserver(function () {
      if (document.querySelector('div[role="tablist"]')) {
        observer.disconnect();
        if (!selectTab(tabName)) {
          setTimeout(function () {
            selectTab(tabName);
          }, 1000);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(function () {
      observer.disconnect();
    }, 5000);
  }

  function initializeTab(): void {
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
  new MutationObserver(function () {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      initializeTab();
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  window.__twitterViewer = window.__twitterViewer || ({} as Window["__twitterViewer"]);
  window.__twitterViewer.selectHomeTab = function () {};
})();
