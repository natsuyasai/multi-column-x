// src-tauri/src/inject/_src/auto_reload.ts
//
// 新着ポスト検知の設計（2026-07-04 実DOM調査に基づく）:
// - 「新しいポストを表示」ピルは合成イベントを一切受け付けず、選択中タブの再クリックも
//   リフレッシュ効果が無いため、ピル方式・タブ再選択方式は使えない。
// - 確実に最新タイムラインを取得できるのは location.reload() のみ（選択タブは
//   tab_selector.ts が URL クエリから復元するため維持される）。
// - そこでリロード前に「現在の視覚的先頭ポスト」を sessionStorage に保存しておき、
//   リロード後（init 時）に保存済みマーカーと現在の先頭ポスト列を突き合わせて
//   新着件数を算出し report_new_posts_count で報告する。
// - X のタイムラインは仮想リストで DOM 順序 ≠ 視覚順序のため、比較対象は
//   getBoundingClientRect().top でソートした視覚順のポスト列を用いる。
(function () {
  const MARKER_STORAGE_KEY = "mcx_prevTopMarker";
  const TIMELINE_READY_TIMEOUT_MS = 15000;
  const FINGERPRINT_LENGTH = 100;
  const ID_MARKER_PREFIX = "id:";
  const TEXT_MARKER_PREFIX = "text:";

  function isScrolling(): boolean {
    return document.scrollingElement
      ? document.scrollingElement.scrollTop > 0
      : false;
  }

  function getSection(): Element | null {
    return document.querySelector("section[aria-labelledby]");
  }

  function sortByVisualTop<T extends Element>(elements: T[]): T[] {
    return [...elements].sort(
      (a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top,
    );
  }

  // 視覚順（DOM順ではなく画面上の位置順）にソートしたポスト記事一覧
  function getVisibleArticles(): HTMLElement[] {
    const section = getSection();
    if (!section) return [];
    return sortByVisualTop(
      Array.from(section.querySelectorAll<HTMLElement>("article")),
    );
  }

  // article を持たないタイムライン（通知ページ等）向けの視覚順セル一覧
  function getVisibleCells(): HTMLElement[] {
    const section = getSection();
    if (!section) return [];
    return sortByVisualTop(
      Array.from(
        section.querySelectorAll<HTMLElement>('[data-testid="cellInnerDiv"]'),
      ),
    );
  }

  function getStatusIdFromArticle(article: HTMLElement): string | null {
    const link = article.querySelector<HTMLAnchorElement>(
      "a[href*='/status/']",
    );
    const href = link?.getAttribute("href") ?? "";
    const match = href.match(/\/status\/(\d+)/);
    return match ? match[1] : null;
  }

  function getCellFingerprint(cell: HTMLElement): string {
    return (cell.textContent ?? "").slice(0, FINGERPRINT_LENGTH);
  }

  // リロード前の「現在の視覚的先頭ポスト」を表すマーカー文字列を作る。
  // article があれば status ID、無ければ先頭セルのテキストフィンガープリント。
  function buildTopMarker(): string | null {
    const articles = getVisibleArticles();
    if (articles.length > 0) {
      const id = getStatusIdFromArticle(articles[0]);
      if (id) return `${ID_MARKER_PREFIX}${id}`;
    }
    const cells = getVisibleCells();
    if (cells.length > 0) {
      return `${TEXT_MARKER_PREFIX}${getCellFingerprint(cells[0])}`;
    }
    return null;
  }

  function saveTopMarker(): void {
    const marker = buildTopMarker();
    if (marker) {
      sessionStorage.setItem(MARKER_STORAGE_KEY, marker);
    } else {
      sessionStorage.removeItem(MARKER_STORAGE_KEY);
    }
  }

  function extractNotificationBadgeCount(): number | null {
    const link = document.querySelector(
      'a[data-testid="AppTabBar_Notifications_Link"]',
    );
    if (!link) return null;
    const badge = link.querySelector("[aria-label]");
    const label = badge?.getAttribute("aria-label") ?? "";
    const match = label.match(/\d+/);
    // 未読ゼロ環境では未検証のためベストエフォート。取得できなければ呼び出し側で
    // count=1（変化を検知した事実のみ）にフォールバックする。
    return match ? parseInt(match[0], 10) : null;
  }

  function getWebviewLabel(): string {
    return (
      window.__TAURI_INTERNALS__?.metadata?.currentWebview?.label ??
      window.__TAURI__?.core?.invoke?.name ??
      ""
    );
  }

  function reportNewPostsCount(count: number): void {
    if (count <= 0) return;
    const label = getWebviewLabel();
    if (!label) return;
    const invoke =
      window.__TAURI_INTERNALS__?.invoke ??
      window.__TAURI__?.core?.invoke ??
      window.__TAURI__?.invoke;
    if (!invoke) return;
    invoke("report_new_posts_count", { label, count }).catch(() => {});
  }

  function reportForArticleMarker(
    marker: string,
    articles: HTMLElement[],
  ): void {
    const markerId = marker.slice(ID_MARKER_PREFIX.length);
    const index = articles.findIndex(
      (article) => getStatusIdFromArticle(article) === markerId,
    );
    if (index === -1) {
      // 描画ウィンドウ外に流れて見つからない場合は、読み込まれているポスト数を
      // 「それ以上」の意味の下限値として報告する。
      reportNewPostsCount(articles.length);
      return;
    }
    // index === 0 なら先頭は変わっていないので報告しない。
    reportNewPostsCount(index);
  }

  function reportForNotificationLikeTimeline(marker: string): void {
    const cells = getVisibleCells();
    if (cells.length === 0) return;
    const currentFingerprint = `${TEXT_MARKER_PREFIX}${getCellFingerprint(cells[0])}`;
    if (marker === currentFingerprint) return;
    const badgeCount = extractNotificationBadgeCount();
    reportNewPostsCount(badgeCount ?? 1);
  }

  // リロード後、保存済みマーカーと現在の視覚順ポスト列を突き合わせて新着数を算出・報告する。
  function computeAndReportNewPosts(): void {
    const marker = sessionStorage.getItem(MARKER_STORAGE_KEY);
    if (marker === null) return; // 初回起動時などマーカーが無ければ報告しない
    sessionStorage.removeItem(MARKER_STORAGE_KEY);

    const articles = getVisibleArticles();
    if (articles.length > 0) {
      if (marker.startsWith(ID_MARKER_PREFIX)) {
        reportForArticleMarker(marker, articles);
      } else {
        // 前回は article が無いページだったが今回は存在する等の想定外ケース。
        // 比較不能なため読み込まれている件数を報告する。
        reportNewPostsCount(articles.length);
      }
      return;
    }

    reportForNotificationLikeTimeline(marker);
  }

  function isTimelineReady(): boolean {
    return (
      document.querySelector("section[aria-labelledby]") !== null ||
      document.querySelector('[data-testid="cellInnerDiv"]') !== null
    );
  }

  // DOM 安定（section/cellInnerDiv の出現）を待ってから新着数を算出する。
  function waitForTimelineReady(callback: () => void): void {
    if (isTimelineReady()) {
      callback();
      return;
    }
    const root = document.body || document.documentElement;
    if (!root) {
      setTimeout(() => waitForTimelineReady(callback), 100);
      return;
    }
    let done = false;
    const observer = new MutationObserver(() => {
      if (done || !isTimelineReady()) return;
      done = true;
      observer.disconnect();
      callback();
    });
    observer.observe(root, { childList: true, subtree: true });
    setTimeout(() => {
      if (done) return;
      done = true;
      observer.disconnect();
      callback();
    }, TIMELINE_READY_TIMEOUT_MS);
  }

  function initNewPostsDetection(): void {
    waitForTimelineReady(computeAndReportNewPosts);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initNewPostsDetection);
  } else {
    initNewPostsDetection();
  }

  function triggerReload(scrollToTop?: boolean): void {
    if (scrollToTop && document.scrollingElement) {
      document.scrollingElement.scrollTop = 0;
    }
    if (isScrolling()) return;
    saveTopMarker();
    location.reload();
  }

  window.__multiColumnX =
    window.__multiColumnX || ({} as Window["__multiColumnX"]);
  window.__multiColumnX.triggerReload = triggerReload;
})();
