// src-tauri/src/inject/_src/auto_reload.ts
(function () {
  // tweetText 差分監視用の observer。waitAndClickNewPostsButton のボタン出現待ち
  // observer とは別物であり、互いに干渉しないよう独立した変数で管理する。
  let currentTweetObserver: MutationObserver | null = null;

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

  function getTweetTextElement(): HTMLElement | null {
    const elements = document.querySelectorAll('[data-testid="tweetText"]');
    if (elements.length === 0) return null;
    return elements[0] as HTMLElement;
  }

  function waitForTweetTextChange(before: string | null): void {
    const section = document.querySelector("section[aria-labelledby]");
    if (!section) return;

    // 前回の tweetText 差分監視 observer が残っていれば disconnect
    if (currentTweetObserver) {
      currentTweetObserver.disconnect();
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const cleanUp = (): void => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      currentTweetObserver = null;
    };

    const observer = new MutationObserver(function () {
      const after = getTweetTextElement()?.innerHTML ?? null;
      if (before !== after) {
        observer.disconnect();
        cleanUp();
        reportNewPostsCount(1);
      }
    });

    observer.observe(section, { childList: true, subtree: true });

    timeoutId = setTimeout(function () {
      observer.disconnect();
      cleanUp();
    }, 30000);

    currentTweetObserver = observer;
  }

  function waitAndClickNewPostsButton(): void {
    const btn = findNewPostsButton();
    if (btn) {
      btn.click();
      return;
    }
    const section = document.querySelector("section[aria-labelledby]");
    if (!section) return;
    const observer = new MutationObserver(function () {
      const found = findNewPostsButton();
      if (found) {
        observer.disconnect();
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

    // before を取得してから、トリガーを実行
    const before = getTweetTextElement()?.innerHTML ?? null;

    if (isFollowingTabActive()) {
      triggerFollowingRefresh();
    } else {
      reselectTab();
      // 「おすすめ」タブの場合はフォロー中と同様に最新取得用のボタンが表示される場合があるためここに対応を入れておく
      waitAndClickNewPostsButton();
    }

    // トリガー実行後、差分監視を開始
    waitForTweetTextChange(before);
  }

  window.__multiColumnX =
    window.__multiColumnX || ({} as Window["__multiColumnX"]);
  window.__multiColumnX.triggerReload = triggerReload;
})();
