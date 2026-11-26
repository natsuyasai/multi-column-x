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

export interface MediaPopupGateConfig {
  imagePopupEnabled?: boolean;
  videoPopupEnabled?: boolean;
  /** Android（mobile）の init script でだけ true が埋め込まれる。デスクトップでは undefined。 */
  mediaPopupRequiresMultiColumn?: boolean;
}

/** 種別ごとの設定 + 実効列数 + 送信経路から、ポップアップ傍受を有効にするかを返す。 */
export function isMediaPopupEnabled(
  kind: "image" | "video",
  config: MediaPopupGateConfig | undefined,
  env: { hasBridge: boolean; multiColumnActive: boolean | undefined },
): boolean {
  // 既定（undefined）は後方互換のため有効扱い。
  const kindEnabled =
    kind === "image"
      ? config?.imagePopupEnabled !== false
      : config?.videoPopupEnabled !== false;
  if (!kindEnabled) return false;
  // デスクトップ: 従来どおり設定だけで決まる（列数・ブリッジに依存しない）。
  if (config?.mediaPopupRequiresMultiColumn !== true) return true;
  // Android: 複数列表示中 かつ 届ける手段（ブリッジ）がある場合だけ。undefined は false 扱い。
  return env.hasBridge && env.multiColumnActive === true;
}

export type MediaPopupTransport = "bridge" | "invoke" | "none";

/** 送信経路を選ぶ。Android ブリッジがあれば優先し、無ければ Tauri invoke、どちらも無ければ none。 */
export function chooseMediaPopupTransport(env: {
  hasBridge: boolean;
  hasInvoke: boolean;
}): MediaPopupTransport {
  if (env.hasBridge) return "bridge";
  return env.hasInvoke ? "invoke" : "none";
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
 * 動画サムネイル（再生ボタン外）のタップから、同じプレビュー領域の playButton を返す。
 * target から祖先を辿り、previewInterstitial を最初に含む祖先をプレビュー領域とみなす。
 */
export function findPlayButtonForMediaTap(target: Element): Element | null {
  // <a> 内（画像リンクなど）は従来のリンク判定を優先する。
  if (target.closest("a")) return null;
  const interstitial = '[data-testid="previewInterstitial"]';
  let area: Element | null = target;
  while (area && !area.querySelector(interstitial)) {
    area = area.parentElement;
  }
  if (!area) return null;
  // ツイート全体（article・引用コンテナ）や、本文・ユーザー名・リンクを含む領域は
  // メディア専用のプレビュー領域ではないので対象外。
  if (area.matches('article, div[role="link"][tabindex="0"]')) return null;
  if (
    area.querySelector(
      '[data-testid="tweetText"], [data-testid="User-Name"], a',
    )
  ) {
    return null;
  }
  // 複数動画の領域で別の動画に誤マッチしないよう、ちょうど 1 つのときだけ採用する。
  const interstitials = area.querySelectorAll(interstitial);
  if (interstitials.length !== 1) return null;
  return interstitials[0].querySelector('button[data-testid="playButton"]');
}

/**
 * playButton が属するメディア項目の、root（既定は article）配下のメディア項目群における
 * 1-based インデックスを返す。取得不可時は 1。引用ツイートではコンテナを root に渡す。
 * メディア項目は div[tweetPhoto]、または tweetPhoto に包まれない div[previewInterstitial]
 * （Android のタイムライン動画）。tweetPhoto の内側にある previewInterstitial は二重に数えない。
 */
export function findMediaIndex(
  playButton: Element,
  root?: Element | null,
): number {
  const photoSelector = 'div[data-testid="tweetPhoto"]';
  const item =
    playButton.closest(photoSelector) ??
    playButton.closest('div[data-testid="previewInterstitial"]');
  const container = root ?? playButton.closest("article");
  if (!item || !container) return 1;
  const items = Array.from(
    container.querySelectorAll(
      `${photoSelector}, div[data-testid="previewInterstitial"]`,
    ),
  ).filter(
    (el) =>
      el.getAttribute("data-testid") !== "previewInterstitial" ||
      !el.closest(photoSelector),
  );
  const index = items.indexOf(item);
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
  // クリック時に毎回評価する（画面回転などで変わる複数カラム表示フラグへ追従するため）。
  function isPopupEnabled(kind: "image" | "video"): boolean {
    return isMediaPopupEnabled(kind, window.__multiColumnXConfig, {
      hasBridge: window.__mcxMediaPopupBridge !== undefined,
      multiColumnActive: window.__mcxMultiColumnActive,
    });
  }

  function tauriInvoke(cmd: string, args: Record<string, unknown>): void {
    const invoke = window.__TAURI__?.core?.invoke ?? window.__TAURI__?.invoke;
    if (invoke) {
      invoke(cmd, args);
    }
  }

  // Android ネイティブブリッジ（addWebMessageListener）へ JSON 文字列でメッセージを送る。
  // inject スクリプトはビルドエントリ間で import を共有できないため、このファイル内に置く。
  function postBridgeMessage(
    bridge: { postMessage: (message: string) => void } | undefined,
    message: Record<string, unknown>,
  ): void {
    bridge?.postMessage(JSON.stringify(message));
  }

  function openPopup(url: string): void {
    const invoke = window.__TAURI__?.core?.invoke ?? window.__TAURI__?.invoke;
    const transport = chooseMediaPopupTransport({
      hasBridge: window.__mcxMediaPopupBridge !== undefined,
      hasInvoke: invoke !== undefined,
    });
    if (transport === "bridge") {
      // Android: 送信元カラムの特定と URL 検証はネイティブ／Rust 側で行う。
      postBridgeMessage(window.__mcxMediaPopupBridge, {
        type: "openMediaPopup",
        url,
      });
      return;
    }
    // webviewLabelCaller は渡さない。実際の送信元 WebView（呼び出し元）は
    // Rust 側が caller.label() で判定するため、JS が自己申告する必要も権限も無い。
    if (transport === "invoke") tauriInvoke(OPEN_POPUP_WINDOW, { url });
  }

  function handlePlayButton(playButton: Element, e: MouseEvent): boolean {
    // 動画のポップアップが無効（設定 OFF・1 列表示・ブリッジ無し）のときは
    // 傍受せずインライン再生へフォールバックする。
    if (!isPopupEnabled("video")) return false;

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
      if (!link) {
        // Android のタイムライン動画: サムネイル（再生ボタン外）のタップも再生ボタン扱いにする。
        // デスクトップの DOM では未検証のため、Android（mediaPopupRequiresMultiColumn）だけで行う。
        if (
          window.__multiColumnXConfig?.mediaPopupRequiresMultiColumn === true
        ) {
          const thumbPlayButton = findPlayButtonForMediaTap(target);
          if (thumbPlayButton) handlePlayButton(thumbPlayButton, e);
        }
        return;
      }

      if (link.hasAttribute("data-tv-navlink")) return;

      const href = link.getAttribute("href") ?? "";
      if (!href || href.startsWith("#") || href.startsWith("javascript:"))
        return;

      const kind = classifyMediaHref(href);
      if (!kind) return;
      if (!isPopupEnabled(kind)) return;

      e.preventDefault();
      e.stopPropagation();
      openPopup(resolveAbsolute(href));
    },
    true,
  );
})();
