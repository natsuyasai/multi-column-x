(function () {
  const TWEET_SELECTOR = 'article[role="article"]';
  const TIMELINE_SELECTOR = 'main[role="main"]';

  // WebView 起動後に設定が変わった場合も反映されるよう毎回動的に参照する
  function getWords(): string[] {
    const config = window.__multiColumnXConfig;
    return [...(config?.ngWords ?? []), ...(config?.globalNgWords ?? [])].map(
      (w) => w.toLowerCase(),
    );
  }

  function containsNgWord(el: HTMLElement): boolean {
    const words = getWords();
    if (words.length === 0) return false;
    const text = el.textContent?.toLowerCase() ?? "";
    return words.some((w) => text.includes(w));
  }

  function hideTweet(el: HTMLElement): void {
    let current: HTMLElement | null = el.parentElement;
    while (current) {
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

  function checkTweet(tweetEl: Element): void {
    const el = tweetEl as HTMLElement;
    if (containsNgWord(el)) hideTweet(el);
  }

  function handleMutations(mutations: MutationRecord[]): void {
    for (const mutation of mutations) {
      if (mutation.type !== "childList" || mutation.addedNodes.length === 0)
        continue;
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const el = node as Element;
        if (el.matches?.(TWEET_SELECTOR)) {
          checkTweet(el);
        } else {
          el.querySelectorAll(TWEET_SELECTOR).forEach(checkTweet);
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
    document.querySelectorAll(TWEET_SELECTOR).forEach(checkTweet);
    new MutationObserver(handleMutations).observe(target, {
      childList: true,
      subtree: true,
    });
  }

  // eval 経由で既存ツイートを再チェックできるよう公開する
  window.__multiColumnX = window.__multiColumnX || ({} as MultiColumnXAPI);
  window.__multiColumnX.recheckNgWords = function () {
    document.querySelectorAll(TWEET_SELECTOR).forEach(checkTweet);
  };

  if (document.body) {
    setTimeout(startObserver, 1000);
  } else {
    document.addEventListener("DOMContentLoaded", () =>
      setTimeout(startObserver, 1000),
    );
  }
})();
