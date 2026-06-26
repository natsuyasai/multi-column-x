// src-tauri/src/inject/_src/image_popup.ts
// コマンド名定数の一覧は constants.ts を参照
const OPEN_POPUP_WINDOW = "open_popup_window";

// --- 純粋関数（vitest で単体テストする） ---

/**
 * href をメディア種別へ分類する。動画判定を画像より優先し排他的に分類する。
 * - video: /status/<id>/video/
 * - image: /status/<id>/photo/ または /i/status/<id>
 * - それ以外: null
 */
export function classifyMediaHref(href: string): "image" | "video" | null {
  if (/\/status\/\d+\/video\//.test(href)) return "video";
  if (/\/status\/\d+\/photo\//.test(href) || /\/i\/status\/\d+/.test(href)) {
    return "image";
  }
  return null;
}

export function isMediaLink(href: string): boolean {
  return classifyMediaHref(href) !== null;
}

function resolveAbsolute(href: string): string {
  return href.startsWith("http") ? href : "https://x.com" + href;
}

/**
 * status パーマリンク（/<user>/status/<id>、末尾に余分なセグメントが付く場合あり）から
 * /<user>/status/<id>/video/<index> の絶対 URL を組み立てる。
 */
export function buildVideoUrl(
  statusPermalinkHref: string,
  index: number,
): string {
  const match = statusPermalinkHref.match(/^(.*\/status\/\d+)/);
  const base = match ? match[1] : statusPermalinkHref;
  return resolveAbsolute(`${base}/video/${index}`);
}

/**
 * status id から /i/status/<id>/video/<index> の絶対 URL を組み立てる。
 * /i/ 形式は X 側が著者ハンドルへ解決するため、ユーザー名が不明でもメディアモーダルを開ける。
 * 引用RT のように DOM 上に引用ツイートの status リンクが存在しないケースで使う。
 */
export function buildIStatusVideoUrl(statusId: string, index: number): string {
  return resolveAbsolute(`/i/status/${statusId}/video/${index}`);
}

// --- DOM 依存ヘルパー（jsdom で単体テストする） ---

/**
 * article 内の timestamp リンク（time 子要素を持つ status リンク）の href を返す。
 */
export function findStatusPermalink(article: Element): string | null {
  const links = article.querySelectorAll<HTMLAnchorElement>(
    'a[href*="/status/"]',
  );
  for (const link of Array.from(links)) {
    if (link.querySelector("time")) {
      return link.getAttribute("href");
    }
  }
  return null;
}

/**
 * playButton を内包する tweetPhoto の、root（既定は article）配下 tweetPhoto 群における
 * 1-based インデックスを返す。取得不可時は 1。引用ツイートではコンテナを root に渡す。
 */
export function findMediaIndex(
  playButton: Element,
  root?: Element | null,
): number {
  const photo = playButton.closest('div[data-testid="tweetPhoto"]');
  const container = root ?? playButton.closest("article");
  if (!photo || !container) return 1;
  const photos = Array.from(
    container.querySelectorAll('div[data-testid="tweetPhoto"]'),
  );
  const index = photos.indexOf(photo);
  return index >= 0 ? index + 1 : 1;
}

/**
 * playButton が引用ツイートコンテナ（div[role="link"][tabindex="0"]）の内側にあれば
 * そのコンテナを返す。通常ツイートの動画では null。
 */
export function findQuotedTweetContainer(playButton: Element): Element | null {
  return playButton.closest('div[role="link"][tabindex="0"]');
}

interface ReactFiberNode {
  memoizedProps?: { tweet?: { id_str?: unknown } } | null;
  return?: ReactFiberNode | null;
}

function getReactFiber(el: Element): ReactFiberNode | null {
  const key = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
  return key
    ? ((el as unknown as Record<string, unknown>)[key] as ReactFiberNode)
    : null;
}

/**
 * 引用ツイートコンテナから React fiber を遡り、最寄りの tweet.id_str を返す。
 * コンテナ起点だと引用ツイートのデータが浅い位置（実測 depth 12 程度）にあり、
 * 外側ツイートより手前でヒットするため first-hit で引用ツイートの id を得られる。
 * （playButton 起点だと動画プレイヤー UI の fiber が大量に挟まり実測 depth 70 超）
 * 引用RT は DOM 上に引用ツイートの status リンクが無いため、これが唯一の取得手段。
 * 取得できなければ null（呼び出し側はインライン再生にフォールバックする）。
 */
export function extractQuotedTweetId(container: Element): string | null {
  let fiber = getReactFiber(container);
  let depth = 0;
  while (fiber && depth < 50) {
    const id = fiber.memoizedProps?.tweet?.id_str;
    if (typeof id === "string" && /^\d+$/.test(id)) return id;
    fiber = fiber.return ?? null;
    depth++;
  }
  return null;
}

// --- 副作用（import 時に実行される IIFE） ---

(function () {
  function isImagePopupEnabled(): boolean {
    // 既定（undefined）は後方互換のため有効扱い。
    return window.__multiColumnXConfig?.imagePopupEnabled !== false;
  }

  function isVideoPopupEnabled(): boolean {
    return window.__multiColumnXConfig?.videoPopupEnabled !== false;
  }

  function tauriInvoke(cmd: string, args: Record<string, unknown>): void {
    const invoke = window.__TAURI__?.core?.invoke ?? window.__TAURI__?.invoke;
    if (invoke) {
      invoke(cmd, args);
    }
  }

  function openPopup(url: string): void {
    const label =
      window.__TAURI_INTERNALS__?.metadata?.currentWebview?.label ?? "unknown";
    tauriInvoke(OPEN_POPUP_WINDOW, {
      webviewLabelCaller: label,
      url,
    });
  }

  function handlePlayButton(playButton: Element, e: MouseEvent): boolean {
    // videoPopupEnabled が false のときは傍受せずインライン再生へフォールバックする。
    if (!isVideoPopupEnabled()) return false;

    // 引用RT: 動画は引用された内側ツイートに属し、article の timestamp リンク（外側ツイート）
    // とは status が異なる。DOM 上に引用ツイートの status リンクが無いため React fiber から
    // 引用ツイートの id を取得し /i/status/<id>/video/<idx> を組み立てる。取得できなければ
    // 傍受せずインライン再生へフォールバックする（壊れたポップアップを出さない）。
    const quoted = findQuotedTweetContainer(playButton);
    if (quoted) {
      const quotedId = extractQuotedTweetId(quoted);
      if (!quotedId) return false;
      e.preventDefault();
      e.stopPropagation();
      openPopup(
        buildIStatusVideoUrl(quotedId, findMediaIndex(playButton, quoted)),
      );
      return true;
    }

    // 通常ツイート: article の timestamp リンクから status を導出する（安定した DOM ベース）。
    const article = playButton.closest("article");
    if (!article) return false;
    const permalink = findStatusPermalink(article);
    if (!permalink) return false;
    e.preventDefault();
    e.stopPropagation();
    openPopup(buildVideoUrl(permalink, findMediaIndex(playButton)));
    return true;
  }

  document.addEventListener(
    "click",
    function (e: MouseEvent) {
      const target = e.target as Element | null;
      if (!target) return;

      // <a> に包まれていない playButton（インライン再生ボタン）を傍受する。
      const playButton = target.closest('button[data-testid="playButton"]');
      if (playButton && !playButton.closest("a")) {
        handlePlayButton(playButton, e);
        return;
      }

      const link = target.closest("a");
      if (!link) return;

      if (link.hasAttribute("data-tv-navlink")) return;

      const href = link.getAttribute("href") ?? "";
      if (!href || href.startsWith("#") || href.startsWith("javascript:"))
        return;

      const kind = classifyMediaHref(href);
      if (!kind) return;
      if (kind === "image" && !isImagePopupEnabled()) return;
      if (kind === "video" && !isVideoPopupEnabled()) return;

      e.preventDefault();
      e.stopPropagation();
      openPopup(resolveAbsolute(href));
    },
    true,
  );
})();
