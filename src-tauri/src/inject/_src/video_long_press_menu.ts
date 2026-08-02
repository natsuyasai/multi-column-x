// src-tauri/src/inject/_src/video_long_press_menu.ts
// Android専用: column WebView上で動画要素を長押し（contextmenuイベント）した際に
// 独自メニューを表示し、動画ダウンロード要求を Android ブリッジ（window.__mcxVideoDownloadBridge）
// へ委譲する。メニュー描画パターンは context_menu.ts を踏襲する。

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

(function () {
  let menu: HTMLDivElement | null = null;

  function removeMenu(): void {
    if (menu) {
      menu.remove();
      menu = null;
    }
  }

  function requestVideoDownload(videoEl: Element): void {
    const variants = extractLongPressVideoVariantsFromPlayer(videoEl);
    if (!variants) return;
    const suggestedFileName = extractLongPressVideoIdFromPlayer(videoEl) ?? "";
    window.__mcxVideoDownloadBridge?.downloadVideo(
      JSON.stringify({ variants, suggestedFileName }),
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
    item.textContent = "動画をダウンロード";
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
