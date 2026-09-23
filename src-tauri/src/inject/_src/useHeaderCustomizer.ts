import { useEffect, useState, useCallback, useRef } from "react";
import type { NavLink } from "./headerCustomizerTypes";
import {
  NAV_VISIBLE_KEY,
  TWEET_INPUT_HIDE_STYLE_ID,
  HEADER_HIDE_STYLE_ID,
  BOTTOM_BAR_NAVIGATION_SELECTOR,
  CLOSE_ICON_PATH,
  COMPOSE_ICON_PATH,
  DEFAULT_NAV_LINKS,
} from "./headerCustomizerTypes";

// 共有DOM監視ハブ(dom_observer.ts, window.__mcxDomObserver)経由でDOM変化を購読する。
// ハブは document.body を childList+subtree で監視し、MutationRecordの詳細に依存
// しないコールバック（毎回applyHeaderVisibility/extractLinksを再実行・再試行するだけ）を
// requestAnimationFrameで1フレームにまとめて配る。ハブが無い環境（単体テストや、
// 注入順序が変わった場合等）では、フォールバックとして従来と同じdocument.bodyの
// childList+subtree監視をこのファイル単独で行う。
function subscribeDomChanges(
  callback: (mutations: MutationRecord[]) => void,
): () => void {
  if (window.__mcxDomObserver) {
    return window.__mcxDomObserver.subscribe(callback);
  }
  const observer = new MutationObserver(callback);
  observer.observe(document.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}

export function useHeaderCustomizer() {
  // visibleLinks は window.__multiColumnXConfig から取得（空配列 = 全リンク表示）
  const visibleLinks: string[] =
    window.__multiColumnXConfig?.visibleLinks ?? [];

  const [navLinks, setNavLinks] = useState<NavLink[]>([]);
  const [isNavVisible, setIsNavVisible] = useState<boolean>(() => {
    const stored = localStorage.getItem(NAV_VISIBLE_KEY);
    return stored === null ? false : stored === "true";
  });
  const [isTweetInputVisible, setIsTweetInputVisible] =
    useState<boolean>(false);
  const composeButtonRef = useRef<HTMLAnchorElement | null>(null);

  // ヘッダーを非表示にする（下部固定ヘッダー表示のレイアウトでは header[role="banner"] が
  // タイムライン全体を内包するランドマーク要素になっており、非表示にすると表示が重なるため
  // 対象外とする。data-testid="BottomBar" 要素はレイアウトに関わらず常に1つ存在するため、
  // 下部固定ヘッダー表示時のみ追加される「role="navigation" の nav を含む BottomBar 要素」の
  // 有無で判定する）
  useEffect(() => {
    const hideHeaderEnabled =
      window.__multiColumnXConfig?.hideHeaderEnabled ?? true;
    if (!hideHeaderEnabled) return;

    const applyHeaderVisibility = () => {
      const hasBottomBarNavigation =
        document.querySelector(BOTTOM_BAR_NAVIGATION_SELECTOR) !== null;
      const existingStyle = document.getElementById(HEADER_HIDE_STYLE_ID);
      if (hasBottomBarNavigation) {
        existingStyle?.remove();
        return;
      }
      if (!existingStyle) {
        const style = document.createElement("style");
        style.id = HEADER_HIDE_STYLE_ID;
        style.textContent = `header[role="banner"] { display: none !important; }`;
        document.head.appendChild(style);
      }
    };

    applyHeaderVisibility();

    const unsubscribe = subscribeDomChanges(applyHeaderVisibility);
    window.addEventListener("resize", applyHeaderVisibility);

    return () => {
      unsubscribe();
      window.removeEventListener("resize", applyHeaderVisibility);
      document.getElementById(HEADER_HIDE_STYLE_ID)?.remove();
    };
  }, []);

  // ツイート入力エリアを非表示にする
  useEffect(() => {
    const hideTweetInputEnabled =
      window.__multiColumnXConfig?.hideTweetInputEnabled ?? true;
    if (!hideTweetInputEnabled) return;
    const existingStyle = document.getElementById(TWEET_INPUT_HIDE_STYLE_ID);
    if (!existingStyle) {
      const style = document.createElement("style");
      style.id = TWEET_INPUT_HIDE_STYLE_ID;
      style.textContent = `div:has(> [role="progressbar"] + * div[data-testid*="tweetTextarea"]) { display: none !important; }`;
      document.head.appendChild(style);
      setIsTweetInputVisible(false);
    }
    return () => {
      document.getElementById(TWEET_INPUT_HIDE_STYLE_ID)?.remove();
    };
  }, []);

  // ヘッダーからリンクを抽出する
  useEffect(() => {
    const extractLinks = () => {
      const header = document.querySelector<HTMLElement>(
        "header[role='banner']",
      );
      if (!header) return false;
      const anchorElements =
        header.querySelectorAll<HTMLAnchorElement>('a[role="link"]');
      const links: NavLink[] = [];
      anchorElements.forEach((anchor) => {
        const href = anchor.getAttribute("href");
        const ariaLabel = anchor.getAttribute("aria-label");
        const svg = anchor.querySelector("svg");
        if (ariaLabel === "X") return;
        if (href && svg && ariaLabel) {
          if (visibleLinks.length === 0 || visibleLinks.includes(ariaLabel)) {
            links.push({
              href,
              ariaLabel,
              svgContent: svg.outerHTML,
              label: ariaLabel,
            });
          }
        }
      });
      if (links.length > 0) {
        setNavLinks(links);
        return true;
      }
      return false;
    };

    const applyFallbackLinks = () => {
      const links: NavLink[] =
        visibleLinks.length === 0
          ? Object.values(DEFAULT_NAV_LINKS)
          : visibleLinks
              .map((label) => DEFAULT_NAV_LINKS[label])
              .filter(Boolean);
      if (links.length > 0) setNavLinks(links);
    };

    let retryCount = 0;
    const maxRetries = 10;
    let retryTimer: ReturnType<typeof setInterval> | null = null;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    let unsubscribe: (() => void) | null = null;

    const tryExtractLinks = () => {
      if (extractLinks()) {
        if (retryTimer) clearInterval(retryTimer);
        if (timeoutTimer) clearTimeout(timeoutTimer);
        unsubscribe?.();
        return true;
      }
      return false;
    };

    const startInitialDelay = setTimeout(() => {
      if (tryExtractLinks()) return;
      retryTimer = setInterval(() => {
        retryCount++;
        if (tryExtractLinks()) return;
        if (retryCount >= maxRetries) {
          if (retryTimer) clearInterval(retryTimer);
          unsubscribe = subscribeDomChanges(() => {
            if (extractLinks()) {
              unsubscribe?.();
              if (timeoutTimer) clearTimeout(timeoutTimer);
            }
          });
        }
      }, 200);
      timeoutTimer = setTimeout(() => {
        if (retryTimer) clearInterval(retryTimer);
        unsubscribe?.();
        if (navLinks.length === 0) applyFallbackLinks();
      }, 5000);
    }, 100);

    return () => {
      clearTimeout(startInitialDelay);
      if (retryTimer) clearInterval(retryTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      unsubscribe?.();
    };
  }, []); // visibleLinks は初期化時に一度だけ読む

  const toggleNavVisibility = useCallback(() => {
    const newVisibility = !isNavVisible;
    setIsNavVisible(newVisibility);
    localStorage.setItem(NAV_VISIBLE_KEY, newVisibility.toString());
  }, [isNavVisible]);

  const toggleTweetInputArea = useCallback(() => {
    const existingStyle = document.getElementById(TWEET_INPUT_HIDE_STYLE_ID);
    if (isTweetInputVisible) {
      if (!existingStyle) {
        const style = document.createElement("style");
        style.id = TWEET_INPUT_HIDE_STYLE_ID;
        style.textContent = `div:has(> [role="progressbar"] + * div[data-testid*="tweetTextarea"]) { display: none !important; }`;
        document.head.appendChild(style);
      }
      setIsTweetInputVisible(false);
      if (composeButtonRef.current) {
        const svg = composeButtonRef.current.querySelector("svg");
        if (svg) {
          svg.innerHTML = `<path d="${COMPOSE_ICON_PATH}"></path>`;
          composeButtonRef.current.setAttribute("aria-label", "ポストする");
        }
      }
    } else {
      existingStyle?.remove();
      setIsTweetInputVisible(true);
      if (composeButtonRef.current) {
        const svg = composeButtonRef.current.querySelector("svg");
        if (svg) {
          svg.innerHTML = `<path d="${CLOSE_ICON_PATH}"></path>`;
          composeButtonRef.current.setAttribute("aria-label", "閉じる");
        }
      }
    }
  }, [isTweetInputVisible]);

  return {
    navLinks,
    isNavVisible,
    isTweetInputVisible,
    toggleNavVisibility,
    toggleTweetInputArea,
    composeButtonRef,
  };
}
