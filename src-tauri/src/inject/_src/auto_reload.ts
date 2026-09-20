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

  // 検索・通知ページの更新（スクロール往復）: 下へスクロールする距離の決め方。
  // 必要な距離はビューポート高さの約 21〜24%（実測: 実カラム高さ 1424px で 300px は
  // 取得なし・350px は取得あり、Chrome 594px で 120px は取得なし・140px は取得あり）。
  // 固定値では背の高いカラムで届かないため、余裕を持たせてビューポート高さの 50% とし、
  // 低いビューポート向けの下限を 250px とする。
  const SCROLL_ROUNDTRIP_MIN_DISTANCE_PX = 250;
  const SCROLL_ROUNDTRIP_VIEWPORT_RATIO = 0.5;
  // 下へスクロールしてから先頭へ戻すまでの待ち時間（ms）。
  // 実測: 同一タスク内・rAF での即戻しは取得されないため setTimeout で待つ。
  const SCROLL_ROUNDTRIP_WAIT_MS = 60;

  // スクロール往復の実行中フラグ。二重実行を防ぐ。
  let scrollRoundtripRunning = false;

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

  /**
   * 「見たことのある最新」の基準を保持し、新着かどうかを判定する。
   * 基準はページ読み込み（IIFE 再実行）でリセットされ、更新をまたいで引き継がれる。
   * 仮想リストの表示入れ替えで古いポストが出入りしても、基準より新しいものが
   * 現れない限り新着とは扱わない。
   */
  interface NewnessTracker {
    /**
     * section の最大値を基準へ取り込む（基準 = max(基準, 現在の最大値)）。
     * 取り込み前の基準より新しいものが section にあったときだけ true を返す。
     * section に読み取れる値が無ければ何もせず false。
     */
    absorb(section: Element): boolean;
  }

  function createNewnessTracker<T>(
    readMax: (section: Element) => T | null,
    compare: (a: T, b: T) => number,
  ): NewnessTracker {
    let session: T | null = null;
    return {
      absorb(section: Element): boolean {
        const current = readMax(section);
        if (current === null) return false;
        if (session !== null && compare(current, session) <= 0) return false;
        session = current;
        return true;
      },
    };
  }

  // 通常ページ: status ID の最大値（Snowflake ID は時系列で単調増加）
  const statusIdTracker = createNewnessTracker<string>(
    collectMaxStatusId,
    compareStatusIds,
  );
  // 通知ページ: 通知の時刻（いいね通知等は status リンクを持たないため ID は使えない）
  const notificationTimeTracker = createNewnessTracker<number>(
    collectMaxNotificationTimeMs,
    (a, b) => (a === b ? 0 : a > b ? 1 : -1),
  );

  function isNotificationsPage(): boolean {
    return /^\/notifications(\/mentions)?\/?$/.test(location.pathname);
  }

  function getNewnessTracker(): NewnessTracker {
    return isNotificationsPage() ? notificationTimeTracker : statusIdTracker;
  }

  /** 現在表示中のポストを「見たことがある」ものとして基準へ取り込む。 */
  function primeNewnessBaseline(): void {
    const section = document.querySelector("section[aria-labelledby]");
    if (!section) return;
    getNewnessTracker().absorb(section);
  }

  /**
   * 見たことのある最新より新しいポスト（通知ページでは通知）の出現を最大 30 秒監視し、
   * 出現したら新着として 1 回だけ報告する。
   */
  function waitForNewTweet(): void {
    const section = document.querySelector("section[aria-labelledby]");
    if (!section) return;

    // 前回の tweetText 差分監視 observer が残っていれば disconnect
    if (currentTweetObserver) {
      currentTweetObserver.disconnect();
    }

    const tracker = getNewnessTracker();
    tracker.absorb(section);

    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const cleanUp = (): void => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      currentTweetObserver = null;
    };

    const observer = new MutationObserver(function () {
      // 新しく見えたものは、報告するかどうかに関わらず「見たことがある」ものとして取り込む。
      const foundNewer = tracker.absorb(section);

      // 監視期間中（最大30秒）にユーザーがスクロールしていたら、DOM recycle による
      // 誤検出を避けるためその回の判定を打ち切る（新着報告しない）。
      if (isScrolling()) {
        observer.disconnect();
        cleanUp();
        return;
      }

      if (foundNewer) {
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

  function isScrollRoundtripPage(): boolean {
    return isSearchPage() || isNotificationsPage();
  }

  function getScrollRoundtripDistance(): number {
    return Math.max(
      SCROLL_ROUNDTRIP_MIN_DISTANCE_PX,
      Math.ceil(window.innerHeight * SCROLL_ROUNDTRIP_VIEWPORT_RATIO),
    );
  }

  /**
   * 検索・通知ページの更新。選択中のタブへの再クリックや新着ボタンは効かないため、
   * 下へスクロールしてから先頭へ戻すことで X にタイムラインを取得し直させる。
   */
  function triggerScrollRoundtrip(): void {
    if (scrollRoundtripRunning) return;
    const scrollingElement = document.scrollingElement;
    if (!scrollingElement) return;

    scrollRoundtripRunning = true;
    // 往復で取得された結果が基準に混ざらないよう、先に基準を確定する。
    primeNewnessBaseline();
    scrollingElement.scrollTop = Math.max(
      scrollingElement.scrollTop,
      getScrollRoundtripDistance(),
    );
    setTimeout(function () {
      // 先頭へ戻す直前に解除する（往復完了後は次の更新を実行できる）。
      scrollRoundtripRunning = false;
      if (!isScrollRoundtripPage()) return;
      scrollingElement.scrollTop = 0;
      // 先頭へ戻した後に監視を始める（往復中は isScrolling() で打ち切られてしまうため）。
      waitForNewTweet();
    }, SCROLL_ROUNDTRIP_WAIT_MS);
  }

  function triggerReload(scrollToTop?: boolean): void {
    if (scrollToTop && document.scrollingElement) {
      document.scrollingElement.scrollTop = 0;
    }
    if (isScrolling()) return;

    if (isScrollRoundtripPage()) {
      // 監視の開始は先頭へ戻した後（triggerScrollRoundtrip 内）。
      triggerScrollRoundtrip();
      return;
    }

    if (isFollowingTabActive()) {
      triggerFollowingRefresh();
    } else {
      reselectTab();
      // 「おすすめ」タブの場合はフォロー中と同様に最新取得用のボタンが表示される場合があるためここに対応を入れておく
      waitAndClickNewPostsButton();
    }

    // トリガー実行後、見たことのある最新を基準にして、それより新しいポストの出現を監視する
    waitForNewTweet();
  }

  window.__multiColumnX =
    window.__multiColumnX || ({} as Window["__multiColumnX"]);
  window.__multiColumnX.triggerReload = triggerReload;
})();
