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
  const TIME_MARKER_SEPARATOR = "|t:";

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

  // ポストの投稿時刻（ISO8601 文字列）。取得できなければ null。
  function getArticleTime(article: HTMLElement): string | null {
    const time = article.querySelector<HTMLTimeElement>("time[datetime]");
    return time?.getAttribute("datetime") ?? null;
  }

  // 視覚順ポスト列のうち、閾値 ISO 時刻より新しい投稿時刻を持つものの数を数える。
  // 時刻が取得できないポスト（広告など）は数えない。
  function countArticlesNewerThan(
    articles: HTMLElement[],
    thresholdIso: string,
  ): number {
    const threshold = Date.parse(thresholdIso);
    if (Number.isNaN(threshold)) return 0;
    let count = 0;
    for (const article of articles) {
      const iso = getArticleTime(article);
      if (!iso) continue;
      const time = Date.parse(iso);
      if (!Number.isNaN(time) && time > threshold) count += 1;
    }
    return count;
  }

  // `id:<statusId>|t:<datetime>` 形式のマーカーを id と time に分解する。
  // 旧形式（`id:<statusId>` のみ）の場合 time は null。
  function parseArticleMarker(marker: string): {
    id: string;
    time: string | null;
  } {
    const body = marker.slice(ID_MARKER_PREFIX.length);
    const sepIndex = body.indexOf(TIME_MARKER_SEPARATOR);
    if (sepIndex === -1) return { id: body, time: null };
    return {
      id: body.slice(0, sepIndex),
      time: body.slice(sepIndex + TIME_MARKER_SEPARATOR.length),
    };
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
      if (id) {
        const time = getArticleTime(articles[0]);
        // 投稿時刻を併記して、リロード後に「マーカーより新しいポストだけ」を数える。
        // 時刻が取れない場合は旧形式（id のみ）にフォールバックする。
        return time
          ? `${ID_MARKER_PREFIX}${id}${TIME_MARKER_SEPARATOR}${time}`
          : `${ID_MARKER_PREFIX}${id}`;
      }
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
    const { id, time } = parseArticleMarker(marker);
    const index = articles.findIndex(
      (article) => getStatusIdFromArticle(article) === id,
    );
    if (index === -1) {
      // 前回先頭が描画ウィンドウ外に流れて見つからない場合。X は読書位置を復元する
      // ため、単に読み込み済み件数を報告すると新着ゼロでも誤検知する。マーカーに
      // 時刻があるときのみ「その時刻より新しいポスト数」を数え、無い（旧形式）場合は
      // 保守的に報告しない。
      if (time) {
        reportNewPostsCount(countArticlesNewerThan(articles, time));
      }
      return;
    }
    if (time) {
      // index より視覚的に上（前）にあるポストのうち、マーカー時刻より新しいものだけを
      // 数える。広告・ピン留めなど古い挿入物を新着から除外する。
      reportNewPostsCount(
        countArticlesNewerThan(articles.slice(0, index), time),
      );
      return;
    }
    // 旧形式マーカー（時刻なし）は従来どおり index を新着数とする。
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
      // 前回が article 無しページで今回は article 有り等の想定外ケースでは
      // 比較不能なため報告しない（誤検知回避）。
      if (marker.startsWith(ID_MARKER_PREFIX)) {
        reportForArticleMarker(marker, articles);
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
