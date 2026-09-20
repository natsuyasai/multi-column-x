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

/**
 * 数値文字列 2 つの大小を比べる（BigInt は使わない）。a > b: 1, a < b: -1, 等しい: 0。
 * 桁数が長い方が大きく、同じ桁数なら文字列（辞書順）で比較する。
 */
export function compareStatusIds(a: string, b: string): number {
  if (a.length !== b.length) return a.length > b.length ? 1 : -1;
  if (a === b) return 0;
  return a > b ? 1 : -1;
}

/** 大きい方の status ID を返す。null は無いものとして扱い、両方 null なら null。 */
export function maxStatusId(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return compareStatusIds(a, b) >= 0 ? a : b;
}

/** section 配下の全 article の status ID の最大値。無ければ null。 */
export function collectMaxStatusId(section: Element): string | null {
  let max: string | null = null;
  for (const article of Array.from(section.querySelectorAll("article"))) {
    max = maxStatusId(max, extractStatusId(article));
  }
  return max;
}

/**
 * article 内の全 time[datetime] を Date.parse した ms の最大値。
 * Date.parse が NaN になる要素は無視し、読み取れなければ null。
 */
export function extractNotificationTimeMs(article: Element): number | null {
  let max: number | null = null;
  for (const time of Array.from(article.querySelectorAll("time[datetime]"))) {
    const ms = Date.parse(time.getAttribute("datetime") ?? "");
    if (Number.isNaN(ms)) continue;
    if (max === null || ms > max) max = ms;
  }
  return max;
}

/** section 配下の全 article の通知時刻（ms）の最大値。無ければ null。 */
export function collectMaxNotificationTimeMs(section: Element): number | null {
  let max: number | null = null;
  for (const article of Array.from(section.querySelectorAll("article"))) {
    const ms = extractNotificationTimeMs(article);
    if (ms !== null && (max === null || ms > max)) max = ms;
  }
  return max;
}

// --- 副作用（import 時に実行される IIFE） ---

(function () {
  // tweetText 差分監視用の observer。waitAndClickNewPostsButton のボタン出現待ち
  // observer とは別物であり、互いに干渉しないよう独立した変数で管理する。
  let currentTweetObserver: MutationObserver | null = null;

  // 検索ページの自動更新: DOM の変化がこの時間止まったら「描画が落ち着いた」とみなす（ms）。
  const SEARCH_RENDER_QUIET_MS = 800;
  // 別タブへ切り替えてから、描画の落ち着きを待つ上限時間（ms）。上限で必ず元のタブへ戻す。
  const SEARCH_TAB_SWITCH_MAX_WAIT_MS = 5000;
  // 元のタブへ戻してから、描画の落ち着きを待つ上限時間（ms）。上限で必ず判定へ進む。
  const SEARCH_TAB_RETURN_MAX_WAIT_MS = 5000;

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
   * 描画（DOM の子要素の増減）が SEARCH_RENDER_QUIET_MS 止まるまで待つ。
   * - 最初の変化があるまでは「落ち着いた」とはみなさない（変化前に待ち終わらない）。
   * - maxWaitMs 経過で必ず打ち切る（変化が無い／変化が続く場合の上限）。
   * - 待機中・終了時に検索ページでなくなっていたら onDone(false)、それ以外は onDone(true)。
   * 監視は呼び出した時点から始まるので、変化を起こす操作（タブのクリック）より前に呼ぶこと。
   */
  function waitForRenderQuiet(
    maxWaitMs: number,
    onDone: (stillOnSearchPage: boolean) => void,
  ): void {
    let finished = false;
    let quietTimer: ReturnType<typeof setTimeout> | null = null;
    let maxTimer: ReturnType<typeof setTimeout> | null = null;

    const finish = (): void => {
      if (finished) return;
      finished = true;
      observer.disconnect();
      if (quietTimer !== null) clearTimeout(quietTimer);
      if (maxTimer !== null) clearTimeout(maxTimer);
      onDone(isSearchPage());
    };

    // attributes は監視しない（タブの選択状態の変化を描画と数えないため）。
    const observer = new MutationObserver(function () {
      if (finished) return;
      if (!isSearchPage()) {
        finish();
        return;
      }
      if (quietTimer !== null) clearTimeout(quietTimer);
      quietTimer = setTimeout(finish, SEARCH_RENDER_QUIET_MS);
    });

    observer.observe(document.querySelector("main") ?? document.body, {
      childList: true,
      subtree: true,
    });
    maxTimer = setTimeout(finish, maxWaitMs);
  }

  /**
   * 検索ページの更新。選択中のタブへの再クリックや新着ボタンは効かないため、
   * 別タブへ切り替えてから元のタブへ戻すことでタイムラインを取得し直す。
   * 各段階は描画（DOM の変化）が落ち着くのを待ち、固定時間は上限としてのみ使う。
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

    // 1) 別タブへ切り替え。クリックが起こす最初の変化を取りこぼさないよう、
    //    監視を先に始めてからクリックする。
    waitForRenderQuiet(SEARCH_TAB_SWITCH_MAX_WAIT_MS, function (onSearchPage) {
      const original = onSearchPage ? findSearchTabByHref(originalHref) : null;
      if (!original) {
        searchTabSwitching = false;
        return;
      }
      // 2) 元のタブへ戻す。こちらも監視を先に始めてからクリックする。
      waitForRenderQuiet(
        SEARCH_TAB_RETURN_MAX_WAIT_MS,
        function (stillOnSearchPage) {
          searchTabSwitching = false;
          if (!stillOnSearchPage) return;
          waitForNewTweet(knownIds, true);
        },
      );
      original.click();
    });
    other.click();
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
