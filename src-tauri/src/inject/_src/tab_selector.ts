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
    // 既に選択できれば即終了
    if (selectTab(tabName)) return;

    let done = false;

    function attempt(): void {
      if (done) return;
      if (selectTab(tabName)) {
        done = true;
        observer.disconnect();
        clearInterval(polling);
      }
    }

    // DOM 変化のたびに試行（タブリスト出現・内容更新を検知）
    const observeTarget = document.body || document.documentElement;
    const observer = new MutationObserver(attempt);
    if (observeTarget) {
      observer.observe(observeTarget, { childList: true, subtree: true });
    }

    // MutationObserver が拾えないケースへの 300ms ポーリングフォールバック
    const polling = setInterval(attempt, 300);

    // 10 秒経過で諦める
    setTimeout(function () {
      if (!done) {
        done = true;
        observer.disconnect();
        clearInterval(polling);
      }
    }, 10000);
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
