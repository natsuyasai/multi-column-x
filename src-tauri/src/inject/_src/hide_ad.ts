(function () {
  const config = window.__multiColumnXConfig;
  if (!config?.hideAdEnabled) return;

  const TWEET_CONTAINER_SELECTOR = 'article[role="article"]';
  const AD_DATA_TESTID_SELECTOR = '[data-testid="placementTracking"]';
  const AD_TEXTS = ["Ad", "Promoted", "広告"];
  const TIMELINE_SELECTOR = 'main[role="main"]';

  function removeAdCell(el: HTMLElement): void {
    let current: HTMLElement | null = el.parentElement;
    while (current) {
      if (
        current.tagName === "SECTION" &&
        current.getAttribute("role") === "region"
      ) {
        break;
      }
      if (
        current.tagName === "DIV" &&
        current.dataset.testid === "cellInnerDiv" &&
        current.style.transform !== "" &&
        current.style.position === "absolute"
      ) {
        current.remove();
        return;
      }
      current = current.parentElement;
    }
    el.style.setProperty("display", "none", "important");
  }

  function checkAndHideAd(tweetElement: Element): void {
    const el = tweetElement as HTMLElement;
    if (el.style.display === "none") return;

    if (el.querySelector(AD_DATA_TESTID_SELECTOR)) {
      removeAdCell(el);
      return;
    }

    const spans = el.querySelectorAll("span");
    for (const span of spans) {
      const text = span.textContent?.trim() ?? "";
      if (
        text &&
        AD_TEXTS.some((t) => t.toLowerCase() === text.toLowerCase()) &&
        span.offsetParent !== null
      ) {
        removeAdCell(el);
        return;
      }
    }
  }

  function handleMutations(mutations: MutationRecord[]): void {
    for (const mutation of mutations) {
      if (mutation.type !== "childList" || mutation.addedNodes.length === 0)
        continue;
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const el = node as Element;
        if (el.matches?.(TWEET_CONTAINER_SELECTOR)) {
          checkAndHideAd(el);
        } else {
          el.querySelectorAll(TWEET_CONTAINER_SELECTOR).forEach(checkAndHideAd);
        }
      });
    }
  }

  function startObserver(): void {
    const target = document.querySelector(TIMELINE_SELECTOR);
    if (!target) {
      setTimeout(startObserver, 500);
      return;
    }
    document.querySelectorAll(TWEET_CONTAINER_SELECTOR).forEach(checkAndHideAd);
    new MutationObserver(handleMutations).observe(target, {
      childList: true,
      subtree: true,
    });
  }

  if (document.body) {
    setTimeout(startObserver, 1000);
  } else {
    document.addEventListener("DOMContentLoaded", () =>
      setTimeout(startObserver, 1000),
    );
  }
})();
