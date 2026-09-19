// src-tauri/src/inject/_src/auto_reload.ts

// --- 純粋関数（vitest で単体テストする） ---

/**
 * article 内の timestamp リンク（time 子要素を持つ status リンク）の href から
 * status ID（数字文字列）を抽出する。time 子要素を持たない status リンク
 * （いいね等のカウント表示リンク）は対象外とする。
 */
export function extractStatusId(article: Element): string | null {
  const links = article.querySelectorAll<HTMLAnchorElement>(
    'a[href*="/status/"]',
  );
  for (const link of Array.from(links)) {
    if (!link.querySelector("time")) continue;
    const href = link.getAttribute("href");
    const match = href?.match(/\/status\/(\d+)/);
    if (match) return match[1];
  }
  return null;
}

/**
 * section 配下の全 article から status ID を収集する。
 */
export function collectKnownStatusIds(section: Element): Set<string> {
  const ids = new Set<string>();
  const articles = section.querySelectorAll("article");
  for (const article of Array.from(articles)) {
    const id = extractStatusId(article);
    if (id !== null) ids.add(id);
  }
  return ids;
}

// --- 副作用（import 時に実行される IIFE） ---

(function () {
  // tweetText 差分監視用の observer。waitAndClickNewPostsButton のボタン出現待ち
  // observer とは別物であり、互いに干渉しないよう独立した変数で管理する。
  let currentTweetObserver: MutationObserver | null = null;

  // 検索ページの自動更新: 別タブを表示してから元のタブへ戻すまでの待機時間（ms）。
  // 実 X で 2.5 秒待つと別タブの結果が描画され、戻したときに最新の検索結果が再取得されることを確認済み。
  const SEARCH_TAB_SWITCH_DELAY_MS = 2500;
  // 検索ページの自動更新: 元のタブへ戻してから、描画が落ち着くのを待つ時間（ms）。
  const SEARCH_TAB_RETURN_SETTLE_MS = 3000;

  // 検索ページのタブ切り替え（別タブ→元のタブ）の実行中フラグ。二重実行を防ぐ。
  let searchTabSwitching = false;

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
      if (btn) {
        if (btn.attributes.getNamedItem("data-testid")?.value === "UserCell") {
          continue;
        }
        return btn;
      }
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

  /** ids に knownIds に含まれない status ID が 1 つでもあれば true。 */
  function hasUnknownId(ids: Set<string>, knownIds: Set<string>): boolean {
    for (const id of ids) {
      if (!knownIds.has(id)) return true;
    }
    return false;
  }

  /**
   * 未知の status ID の出現を最大 30 秒監視し、出現したら新着として報告する。
   * @param initialKnownIds 既知 ID 集合。省略時は呼び出し時点の section からスナップショットする。
   * @param checkImmediately true のとき、監視を始める前に現在の DOM を既知 ID と比較し、
   *   未知の ID があれば即報告して監視を張らない。
   */
  function waitForNewTweet(
    initialKnownIds?: Set<string>,
    checkImmediately = false,
  ): void {
    const section = document.querySelector("section[aria-labelledby]");
    if (!section) return;

    // 前回の tweetText 差分監視 observer が残っていれば disconnect
    if (currentTweetObserver) {
      currentTweetObserver.disconnect();
    }

    // 監視開始時点の status ID 群をスナップショットする。DOM順先頭要素の
    // innerHTML比較では仮想化リストのDOM recycle（スクロール中の要素入れ替え）を
    // 新着と誤検出してしまうため、ツイート固有IDの集合比較に切り替える。
    const knownIds = initialKnownIds ?? collectKnownStatusIds(section);

    if (checkImmediately) {
      // observer 側と同様、スクロール中は仮想リストの入れ替えによる誤検出を
      // 避けるため、報告も監視もせずこの回の判定を打ち切る。
      if (isScrolling()) return;
      if (hasUnknownId(collectKnownStatusIds(section), knownIds)) {
        reportNewPostsCount(1);
        return;
      }
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const cleanUp = (): void => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      currentTweetObserver = null;
    };

    const observer = new MutationObserver(function () {
      // 監視期間中（最大30秒）にユーザーがスクロールしていたら、DOM recycle による
      // 誤検出を避けるためその回の判定を打ち切る（新着報告しない）。
      if (isScrolling()) {
        observer.disconnect();
        cleanUp();
        return;
      }

      if (hasUnknownId(collectKnownStatusIds(section), knownIds)) {
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

  function isSearchPage(): boolean {
    return location.pathname === "/search";
  }

  function getSearchTabs(): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>("a[role='tab']"));
  }

  function findSearchTabByHref(href: string): HTMLElement | null {
    return (
      getSearchTabs().find((tab) => tab.getAttribute("href") === href) ?? null
    );
  }

  /**
   * 検索ページの更新。選択中のタブへの再クリックや新着ボタンは効かないため、
   * 別タブへ切り替えてから元のタブへ戻すことでタイムラインを取得し直す。
   */
  function triggerSearchRefresh(): void {
    if (searchTabSwitching) return;
    const section = document.querySelector("section[aria-labelledby]");
    const tabs = getSearchTabs();
    const selected = tabs.find(
      (tab) => tab.getAttribute("aria-selected") === "true",
    );
    const other = tabs.find(
      (tab) => tab.getAttribute("aria-selected") !== "true",
    );
    const originalHref = selected?.getAttribute("href");
    if (!section || !selected || !other || !originalHref) return;

    // 別タブ表示中の投稿は元タブと ID が異なる。切替前の ID 集合を基準にし、
    // 元のタブへ戻して描画が落ち着いた後に比較する。
    const knownIds = collectKnownStatusIds(section);
    searchTabSwitching = true;
    other.click();

    setTimeout(function () {
      const original = isSearchPage()
        ? findSearchTabByHref(originalHref)
        : null;
      if (!original) {
        searchTabSwitching = false;
        return;
      }
      original.click();
      setTimeout(function () {
        searchTabSwitching = false;
        waitForNewTweet(knownIds, true);
      }, SEARCH_TAB_RETURN_SETTLE_MS);
    }, SEARCH_TAB_SWITCH_DELAY_MS);
  }

  function triggerReload(scrollToTop?: boolean): void {
    if (scrollToTop && document.scrollingElement) {
      document.scrollingElement.scrollTop = 0;
    }
    if (isScrolling()) return;

    if (isSearchPage()) {
      triggerSearchRefresh();
      // 検索ページでは切替直後に waitForNewTweet() を呼ばない
      // （別タブ表示中の別 ID を新着と誤検出するため）。
      return;
    }

    if (isFollowingTabActive()) {
      triggerFollowingRefresh();
    } else {
      reselectTab();
      // 「おすすめ」タブの場合はフォロー中と同様に最新取得用のボタンが表示される場合があるためここに対応を入れておく
      waitAndClickNewPostsButton();
    }

    // トリガー実行後、status ID 集合のスナップショットを取り、未知IDの出現を監視する
    waitForNewTweet();
  }

  window.__multiColumnX =
    window.__multiColumnX || ({} as Window["__multiColumnX"]);
  window.__multiColumnX.triggerReload = triggerReload;
})();
