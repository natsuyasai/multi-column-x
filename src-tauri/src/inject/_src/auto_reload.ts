// src-tauri/src/inject/_src/auto_reload.ts
(function () {
  function isScrolling(): boolean {
    return document.scrollingElement
      ? document.scrollingElement.scrollTop > 0
      : false;
  }

  function isFollowingTabActive(): boolean {
    const tabs = document.querySelectorAll<HTMLElement>("div[role='tab']");
    for (const elem of tabs) {
      if (
        elem.getAttribute("aria-selected") === "true" &&
        elem.hasAttribute("aria-expanded")
      ) {
        return true;
      }
    }
    return false;
  }

  function findNewPostsButton(): HTMLButtonElement | null {
    const section = document.querySelector("section[aria-labelledby]");
    if (!section) return null;
    const cells = section.querySelectorAll('[data-testid="cellInnerDiv"]');
    for (const cell of cells) {
      if (cell.querySelector("article")) continue;
      const btn = cell.querySelector<HTMLButtonElement>(
        'button[type="button"]',
      );
      if (btn) return btn;
    }
    return null;
  }

  function extractNewPostsCount(btn: HTMLButtonElement): number {
    const text = btn.textContent ?? "";
    const match = text.match(/\d+/);
    return match ? parseInt(match[0], 10) : 1;
  }

  function getWebviewLabel(): string {
    return (
      window.__TAURI_INTERNALS__?.metadata?.currentWebview?.label ??
      window.__TAURI__?.core?.invoke?.name ??
      ""
    );
  }

  function reportNewPostsCount(count: number): void {
    const label = getWebviewLabel();
    if (!label) return;
    const invoke =
      window.__TAURI_INTERNALS__?.invoke ??
      window.__TAURI__?.core?.invoke ??
      window.__TAURI__?.invoke;
    if (!invoke) return;
    invoke("report_new_posts_count", { label, count }).catch(() => {});
  }

  function waitAndClickNewPostsButton(): void {
    const btn = findNewPostsButton();
    if (btn) {
      const count = extractNewPostsCount(btn);
      reportNewPostsCount(count);
      btn.click();
      return;
    }
    const section = document.querySelector("section[aria-labelledby]");
    if (!section) return;
    const observer = new MutationObserver(function () {
      const found = findNewPostsButton();
      if (found) {
        observer.disconnect();
        const count = extractNewPostsCount(found);
        reportNewPostsCount(count);
        found.click();
      }
    });
    observer.observe(section, { childList: true, subtree: true });
    setTimeout(function () {
      observer.disconnect();
    }, 30000);
  }

  function triggerFollowingRefresh(): void {
    window.dispatchEvent(new Event("focus"));
    waitAndClickNewPostsButton();
  }

  function reselectTab(): void {
    const tabs = document.querySelectorAll<HTMLElement>("div[role='tab']");
    for (const elem of tabs) {
      if (elem.getAttribute("aria-selected") === "true") {
        if (!elem.hasAttribute("aria-expanded")) {
          elem.click();
        }
        break;
      }
    }
  }

  function triggerReload(scrollToTop?: boolean): void {
    if (scrollToTop && document.scrollingElement) {
      document.scrollingElement.scrollTop = 0;
    }
    if (isScrolling()) return;
    if (isFollowingTabActive()) {
      triggerFollowingRefresh();
    } else {
      reselectTab();
    }
  }

  window.__multiColumnX =
    window.__multiColumnX || ({} as Window["__multiColumnX"]);
  window.__multiColumnX.triggerReload = triggerReload;
})();
