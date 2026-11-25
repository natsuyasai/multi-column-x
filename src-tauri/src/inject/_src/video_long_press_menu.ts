// src-tauri/src/inject/_src/video_long_press_menu.ts
// column WebView上で動画要素を長押し、またはPCでは右クリック（いずれも contextmenu イベント）
// した際に独自メニューを表示する。desktop/mobile 共通で注入される。
// 「動画をダウンロード」は Android ではブリッジ window.__mcxVideoDownloadBridge へ委譲し、
// desktop（ブリッジ無し）では Rust コマンド download_video を invoke する。
// desktop の進捗は自 WebView 宛てのイベント video-download-progress で受け取り、
// カラム下端のトーストに表示する。
// 「動画をポップアップで表示」は desktop では videoPopupEnabled 設定だけで決まる。Android では
// 設定 ON かつ複数カラム表示中（window.__mcxMultiColumnActive）かつブリッジ有りのときだけ表示し、
// 要求はブリッジ window.__mcxMediaPopupBridge へ送る。
// メニュー描画パターンは context_menu.ts を踏襲する。

// 動画情報（variants）の抽出は popup_toolbar.ts と同じ React Fiber 解析パターン。
// inject スクリプトはビルドエントリ間で ES module の import ができない構造のため
// （docs/development/inject-ipc-shortcuts-notes.md 参照）、このファイル内に独立実装する。
// 名前衝突を避けるため、識別子には LongPress プレフィックスを一貫して付ける。

interface LongPressVideoVariant {
  contentType: string;
  bitrate?: number;
  url: string;
}

interface LongPressReactFiberNode {
  memoizedProps?: Record<string, unknown> | null;
  return?: LongPressReactFiberNode | null;
}

function getLongPressReactFiber(el: Element): LongPressReactFiberNode | null {
  const key = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
  return key
    ? ((el as unknown as Record<string, unknown>)[
        key
      ] as LongPressReactFiberNode)
    : null;
}

function isLongPressRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// 画面文言は共有ハブ window.__mcxI18n（i18n.ts）経由で設定する。ハブ未ロード時はキー文字列を表示する。
// 表示済みの要素の文言は、言語切替時に再適用できるよう apply で設定する。
function applyText(el: Element, key: string): void {
  if (window.__mcxI18n) window.__mcxI18n.apply(el, key);
  else el.textContent = key;
}

function tr(key: string, params?: Record<string, string | number>): string {
  return window.__mcxI18n?.t(key, params) ?? key;
}

const VIDEO_PLAYER_SELECTOR = '[data-testid="videoComponent"]';

/**
 * 指定要素からReact Fiberの return チェーンを遡り、predicate を満たす最初の
 * memoizedProps を返す（最大50段）。
 */
function findLongPressAncestorProps(
  el: Element,
  predicate: (props: Record<string, unknown>) => boolean,
): Record<string, unknown> | null {
  let fiber = getLongPressReactFiber(el);
  let depth = 0;
  while (fiber && depth < 50) {
    const props = fiber.memoizedProps;
    if (isLongPressRecord(props) && predicate(props)) {
      return props;
    }
    fiber = fiber.return ?? null;
    depth++;
  }
  return null;
}

/** VideoPlayerコンポーネントの variants（`{ type, src, bitrate }` 形式）を変換する。 */
function toLongPressVideoVariants(
  rawVariants: unknown[],
): LongPressVideoVariant[] {
  const variants: LongPressVideoVariant[] = [];
  for (const raw of rawVariants) {
    if (!isLongPressRecord(raw)) continue;
    const { type, src, bitrate } = raw;
    if (typeof type !== "string" || typeof src !== "string") continue;
    const variant: LongPressVideoVariant = { contentType: type, url: src };
    if (typeof bitrate === "number") variant.bitrate = bitrate;
    variants.push(variant);
  }
  return variants;
}

/**
 * 動画詳細ページのVideoPlayerコンポーネントから、React Fiber経由でvariants一覧を抽出する。
 * 見つからなければ null（動画を一度も再生していない等でvideoComponentが未マウントの場合を含む）。
 */
function extractLongPressVideoVariantsFromPlayer(
  startEl?: Element | null,
): LongPressVideoVariant[] | null {
  const el = startEl ?? document.querySelector(VIDEO_PLAYER_SELECTOR);
  if (!el) return null;

  const props = findLongPressAncestorProps(el, (p) =>
    Array.isArray(p.variants),
  );
  if (!props) return null;

  const variants = toLongPressVideoVariants(props.variants as unknown[]);
  return variants.length > 0 ? variants : null;
}

/** VideoPlayerコンポーネントのprops（videoId: { id }）からツイートID相当の文字列を取得する。 */
function extractLongPressVideoIdFromPlayer(
  startEl?: Element | null,
): string | null {
  const el = startEl ?? document.querySelector(VIDEO_PLAYER_SELECTOR);
  if (!el) return null;

  const props = findLongPressAncestorProps(
    el,
    (p) => isLongPressRecord(p.videoId) && typeof p.videoId.id === "string",
  );
  if (!props) return null;

  return (props.videoId as Record<string, unknown>).id as string;
}

// --- 動画ポップアップ表示用の純粋関数（image_popup.ts のロジックを複製） ---

/** href をそのまま絶対URLとして使うか、x.com を補って絶対URL化する。 */
export function resolveLongPressAbsolute(href: string): string {
  return href.startsWith("http") ? href : "https://x.com" + href;
}

/**
 * status パーマリンク（/<user>/status/<id>、末尾に余分なセグメントが付く場合あり）から
 * /<user>/status/<id>/video/<index> の絶対 URL を組み立てる。
 */
export function buildLongPressVideoUrl(
  statusPermalinkHref: string,
  index: number,
): string {
  const match = statusPermalinkHref.match(/^(.*\/status\/\d+)/);
  const base = match ? match[1] : statusPermalinkHref;
  return resolveLongPressAbsolute(`${base}/video/${index}`);
}

/** status id から /i/status/<id>/video/<index> の絶対 URL を組み立てる。 */
export function buildLongPressIStatusVideoUrl(
  statusId: string,
  index: number,
): string {
  return resolveLongPressAbsolute(`/i/status/${statusId}/video/${index}`);
}

/** article 内の timestamp リンク（time 子要素を持つ status リンク）の href を返す。 */
export function findLongPressStatusPermalink(article: Element): string | null {
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
 * el を内包する tweetPhoto の、root（既定は article）配下 tweetPhoto 群における
 * 1-based インデックスを返す。取得不可時は 1。引用ツイートではコンテナを root に渡す。
 */
export function findLongPressMediaIndex(
  el: Element,
  root?: Element | null,
): number {
  const photo = el.closest('div[data-testid="tweetPhoto"]');
  const container = root ?? el.closest("article");
  if (!photo || !container) return 1;
  const photos = Array.from(
    container.querySelectorAll('div[data-testid="tweetPhoto"]'),
  );
  const index = photos.indexOf(photo);
  return index >= 0 ? index + 1 : 1;
}

/**
 * el が引用ツイートコンテナ（div[role="link"][tabindex="0"]）の内側にあれば
 * そのコンテナを返す。通常ツイートの動画では null。
 */
export function findLongPressQuotedTweetContainer(el: Element): Element | null {
  return el.closest('div[role="link"][tabindex="0"]');
}

/**
 * 引用ツイートコンテナから React Fiber を遡り、最寄りの tweet.id_str を返す。
 * 引用RT は DOM 上に引用ツイートの status リンクが無いため、これが唯一の取得手段。
 * 取得できなければ null（呼び出し側はポップアップを開かずフォールバックする）。
 */
export function extractLongPressQuotedTweetId(
  container: Element,
): string | null {
  const props = findLongPressAncestorProps(container, (p) => {
    const tweet = p.tweet;
    return (
      isLongPressRecord(tweet) &&
      typeof tweet.id_str === "string" &&
      /^\d+$/.test(tweet.id_str)
    );
  });
  if (!props) return null;
  return (props.tweet as Record<string, unknown>).id_str as string;
}

export interface LongPressMediaPopupGateConfig {
  imagePopupEnabled?: boolean;
  videoPopupEnabled?: boolean;
  /** Android（mobile）の init script でだけ true が埋め込まれる。デスクトップでは undefined。 */
  mediaPopupRequiresMultiColumn?: boolean;
}

/**
 * ポップアップ表示を有効にするかを返す。image_popup.ts の isMediaPopupEnabled と同じ仕様の独立実装
 * （inject 間は import できないため複製。食い違いは同期テストが検出する）。
 */
export function isLongPressMediaPopupEnabled(
  kind: "image" | "video",
  config: LongPressMediaPopupGateConfig | undefined,
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

export type LongPressPopupTransport = "bridge" | "invoke" | "none";

/** ポップアップ要求の送信経路を選ぶ。Android ブリッジがあれば優先し、無ければ invoke、どちらも無ければ none。 */
export function chooseLongPressPopupTransport(env: {
  hasBridge: boolean;
  hasInvoke: boolean;
}): LongPressPopupTransport {
  if (env.hasBridge) return "bridge";
  return env.hasInvoke ? "invoke" : "none";
}

// --- 動画ダウンロード（desktop）の純粋関数 ---

export type LongPressDownloadTransport = "bridge" | "invoke" | "none";

/** 送信経路を選ぶ。Android ブリッジがあれば常に優先し、無ければ invoke、どちらも無ければ none。 */
export function chooseLongPressDownloadTransport(env: {
  hasBridge: boolean;
  hasInvoke: boolean;
}): LongPressDownloadTransport {
  if (env.hasBridge) return "bridge";
  return env.hasInvoke ? "invoke" : "none";
}

export interface LongPressDownloadProgress {
  fileIndex: number;
  fileCount: number;
  current: number;
  total: number | null;
  phase: "downloading" | "completed" | "failed";
}

/**
 * 進捗イベントからトースト文言を組み立てる。
 * popup_toolbar.ts の formatVideoDownloadProgressText と同じ組み立て（同期すること）。
 */
export function formatLongPressDownloadText(
  payload: LongPressDownloadProgress,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const { fileIndex, fileCount, current, total, phase } = payload;
  const fileLabel = fileCount > 1 ? ` (${fileIndex}/${fileCount})` : "";
  if (phase === "completed") {
    return t("popupToolbar.download.completed", { file: fileLabel });
  }
  if (phase === "failed") {
    return t("popupToolbar.download.failed", { file: fileLabel });
  }
  if (total === null) {
    return t("popupToolbar.download.downloading", { file: fileLabel });
  }
  const percent = total === 0 ? 0 : Math.floor((current / total) * 100);
  return t("popupToolbar.download.downloadingPercent", {
    file: fileLabel,
    percent,
  });
}

/** 完了・失敗のトーストは自動で消す。ダウンロード中は消さない。 */
export function shouldAutoDismissLongPressToast(
  phase: LongPressDownloadProgress["phase"],
): boolean {
  return phase !== "downloading";
}

(function () {
  const OPEN_POPUP_WINDOW = "open_popup_window";
  const DOWNLOAD_VIDEO = "download_video";
  // イベント名定数の一覧は src/constants/ipc.ts の IPC_EVENTS を参照
  const VIDEO_DOWNLOAD_PROGRESS = "video-download-progress";
  const DOWNLOAD_TOAST_ID = "tv-video-download-toast";
  const DOWNLOAD_TOAST_DISMISS_DELAY_MS = 3000;

  let toastEl: HTMLDivElement | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let lastDownloadPhase: LongPressDownloadProgress["phase"] | null = null;

  function clearToastTimer(): void {
    if (toastTimer !== null) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
  }

  function hideDownloadToast(): void {
    clearToastTimer();
    toastEl?.remove();
    toastEl = null;
  }

  function createDownloadToastElement(): HTMLDivElement {
    const el = document.createElement("div");
    el.id = DOWNLOAD_TOAST_ID;
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.style.cssText = [
      "position: fixed",
      "bottom: 24px",
      "left: 50%",
      "transform: translateX(-50%)",
      "z-index: 2147483647",
      "pointer-events: none",
      "background: #15202b",
      "color: #e7e9ea",
      "border: 1px solid #38444d",
      "border-radius: 8px",
      "padding: 8px 16px",
      "font-family: sans-serif",
      "font-size: 14px",
      "line-height: 1.4",
      "max-width: calc(100% - 32px)",
      "box-shadow: 0 4px 16px rgba(0,0,0,0.5)",
      "text-align: center",
    ].join(";");
    return el;
  }

  function showDownloadToast(text: string, autoDismiss: boolean): void {
    clearToastTimer();
    if (!toastEl || !toastEl.isConnected) {
      toastEl =
        (document.getElementById(DOWNLOAD_TOAST_ID) as HTMLDivElement | null) ??
        createDownloadToastElement();
      document.documentElement.appendChild(toastEl);
    }
    // 言語切替の再適用で補間が失われるため apply() は使わず、textContent に直接設定する。
    toastEl.textContent = text;
    if (autoDismiss) {
      toastTimer = setTimeout(
        hideDownloadToast,
        DOWNLOAD_TOAST_DISMISS_DELAY_MS,
      );
    }
  }

  function onDownloadInvokeRejected(err: unknown): void {
    console.error("[video_long_press_menu]", err);
    // 失敗イベント（ファイル番号付き）を優先する
    if (lastDownloadPhase === "failed") return;
    lastDownloadPhase = "failed";
    showDownloadToast(tr("popupToolbar.download.failed", { file: "" }), true);
  }

  // 進捗は自 WebView 宛てのイベントだけを購読する。既定 target は他 WebView 宛ての emit も
  // 受け取ってしまうため、ラベルが取れないときは購読しない。
  function startDownloadProgressListener(): void {
    const listen = window.__TAURI__?.event?.listen;
    const ownLabel =
      window.__TAURI_INTERNALS__?.metadata?.currentWebview?.label;
    if (!listen || !ownLabel) return;
    listen<LongPressDownloadProgress>(
      VIDEO_DOWNLOAD_PROGRESS,
      function (e) {
        lastDownloadPhase = e.payload.phase;
        showDownloadToast(
          formatLongPressDownloadText(e.payload, tr),
          shouldAutoDismissLongPressToast(e.payload.phase),
        );
      },
      { target: ownLabel },
    ).catch(function (err: unknown) {
      console.error("[video_long_press_menu]", err);
    });
  }
  startDownloadProgressListener();

  let menu: HTMLDivElement | null = null;

  function removeMenu(): void {
    if (menu) {
      menu.remove();
      menu = null;
    }
  }

  // Android ネイティブブリッジ（addWebMessageListener で公開される postMessage）へ、
  // 種類（type）と内容を含む JSON 文字列としてメッセージを送る。
  // inject スクリプトはビルドエントリ間で import を共有できないため、このファイル内に置く。
  function postBridgeMessage(
    bridge: { postMessage: (message: string) => void } | undefined,
    message: Record<string, unknown>,
  ): void {
    bridge?.postMessage(JSON.stringify(message));
  }

  function requestVideoDownload(videoEl: Element): void {
    const variants = extractLongPressVideoVariantsFromPlayer(videoEl);
    if (!variants) return;
    const suggestedFileName = extractLongPressVideoIdFromPlayer(videoEl) ?? "";
    const invoke = window.__TAURI__?.core?.invoke ?? window.__TAURI__?.invoke;
    const transport = chooseLongPressDownloadTransport({
      hasBridge: window.__mcxVideoDownloadBridge !== undefined,
      hasInvoke: invoke !== undefined,
    });
    if (transport === "bridge") {
      // Android: 従来どおりネイティブへ委譲する（進捗と結果は Android の通知）
      postBridgeMessage(window.__mcxVideoDownloadBridge, {
        type: "downloadVideo",
        payload: JSON.stringify({ variants, suggestedFileName }),
      });
      return;
    }
    if (transport === "invoke" && invoke) {
      lastDownloadPhase = null;
      try {
        invoke(DOWNLOAD_VIDEO, { variants, suggestedFileName }).catch(
          onDownloadInvokeRejected,
        );
      } catch (err) {
        onDownloadInvokeRejected(err); // 同期 throw も漏らさない
      }
    }
  }

  // メニュー表示時（createMenu 実行時）に評価する。回転などで変わる複数カラム表示フラグへ追従する。
  function isLongPressVideoPopupEnabled(): boolean {
    return isLongPressMediaPopupEnabled("video", window.__multiColumnXConfig, {
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

  function openLongPressPopup(url: string): void {
    const invoke = window.__TAURI__?.core?.invoke ?? window.__TAURI__?.invoke;
    const transport = chooseLongPressPopupTransport({
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

  function requestVideoPopup(videoEl: Element): void {
    videoEl.querySelector("video")?.pause();
    const quoted = findLongPressQuotedTweetContainer(videoEl);
    if (quoted) {
      const quotedId = extractLongPressQuotedTweetId(quoted);
      if (!quotedId) return;
      openLongPressPopup(
        buildLongPressIStatusVideoUrl(
          quotedId,
          findLongPressMediaIndex(videoEl, quoted),
        ),
      );
      return;
    }
    const article = videoEl.closest("article");
    if (!article) return;
    const permalink = findLongPressStatusPermalink(article);
    if (!permalink) return;
    openLongPressPopup(
      buildLongPressVideoUrl(permalink, findLongPressMediaIndex(videoEl)),
    );
  }

  function createMenu(x: number, y: number, videoEl: Element): void {
    removeMenu();

    const el = document.createElement("div");
    el.id = "tv-video-long-press-menu";
    el.style.cssText = [
      "position: fixed",
      `left: ${x}px`,
      `top: ${y}px`,
      "z-index: 2147483647",
      "background: #15202b",
      "border: 1px solid #38444d",
      "border-radius: 6px",
      "padding: 4px 0",
      "min-width: 200px",
      "box-shadow: 0 4px 16px rgba(0,0,0,0.5)",
      "font-family: sans-serif",
      "font-size: 14px",
      "color: #e7e9ea",
    ].join(";");

    const item = document.createElement("div");
    applyText(item, "videoMenu.download");
    item.style.cssText = [
      "padding: 8px 16px",
      "cursor: pointer",
      "white-space: nowrap",
    ].join(";");
    item.addEventListener("mouseenter", () => {
      item.style.background = "#1d9bf0";
    });
    item.addEventListener("mouseleave", () => {
      item.style.background = "";
    });
    item.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      removeMenu();
      requestVideoDownload(videoEl);
    });

    el.appendChild(item);

    if (isLongPressVideoPopupEnabled()) {
      const popupItem = document.createElement("div");
      applyText(popupItem, "videoMenu.popup");
      popupItem.style.cssText = [
        "padding: 8px 16px",
        "cursor: pointer",
        "white-space: nowrap",
      ].join(";");
      popupItem.addEventListener("mouseenter", () => {
        popupItem.style.background = "#1d9bf0";
      });
      popupItem.addEventListener("mouseleave", () => {
        popupItem.style.background = "";
      });
      popupItem.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        removeMenu();
        requestVideoPopup(videoEl);
      });
      el.appendChild(popupItem);
    }

    document.documentElement.appendChild(el);
    menu = el;

    const rect = el.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      el.style.left = `${x - rect.width}px`;
    }
    if (rect.bottom > window.innerHeight) {
      el.style.top = `${y - rect.height}px`;
    }
  }

  document.addEventListener(
    "contextmenu",
    function (e: MouseEvent) {
      const target = e.target as Element | null;
      if (!target) return;
      const videoEl = target.closest(VIDEO_PLAYER_SELECTOR);
      if (!videoEl) return;

      e.preventDefault();
      e.stopPropagation();
      createMenu(e.clientX, e.clientY, videoEl);
    },
    true,
  );

  document.addEventListener(
    "click",
    function () {
      removeMenu();
    },
    true,
  );

  document.addEventListener(
    "contextmenu",
    function () {
      removeMenu();
    },
    false,
  );
})();
