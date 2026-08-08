import { shouldHideTweetText } from "./ng_word_matcher";

(function () {
  const TWEET_SELECTOR = 'article[role="article"]';
  const TIMELINE_SELECTOR = 'main[role="main"]';

  // WebView 起動後に設定が変わった場合も反映されるよう毎回動的に参照する
  // 大小文字の無視は matchesNgWord 側で行うため、ここでは lowerCase 化しない
  // (正規表現パターンの大文字が失われてしまうため)
  function getNgWords(): string[] {
    const config = window.__multiColumnXConfig;
    return [...(config?.ngWords ?? []), ...(config?.globalNgWords ?? [])];
  }

  function containsNgWord(el: HTMLElement): boolean {
    const config = window.__multiColumnXConfig;
    const ngWords = getNgWords();
    const whitelistEnabled = config?.whitelistEnabled ?? false;
    const whitelistWords = config?.whitelistWords ?? [];
    const text = el.textContent ?? "";
    return shouldHideTweetText(text, ngWords, whitelistEnabled, whitelistWords);
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
