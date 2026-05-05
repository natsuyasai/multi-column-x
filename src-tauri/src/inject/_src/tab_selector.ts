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
      'div[role="tablist"] div[role="tab"]',
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
    const observeTarget = document.body || document.documentElement;
    if (!observeTarget) return;
    observer.observe(observeTarget, { childList: true, subtree: true });
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
  function startUrlObserver(): void {
    const root = document.documentElement || document.body;
    if (!root) {
      setTimeout(startUrlObserver, 100);
      return;
    }
    new MutationObserver(function () {
      const currentUrl = location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        initializeTab();
      }
    }).observe(root, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      startUrlObserver();
    });
  } else {
    startUrlObserver();
  }

  window.__multiColumnX =
    window.__multiColumnX || ({} as Window["__multiColumnX"]);
  window.__multiColumnX.selectHomeTab = function () {};
})();
