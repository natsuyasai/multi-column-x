import { useEffect, useState, useCallback, useRef } from "react";
import type { NavLink } from "./headerCustomizerTypes";
import {
  NAV_VISIBLE_KEY,
  TWEET_INPUT_HIDE_STYLE_ID,
  HEADER_HIDE_STYLE_ID,
  CLOSE_ICON_PATH,
  COMPOSE_ICON_PATH,
  DEFAULT_NAV_LINKS,
} from "./headerCustomizerTypes";

export function useHeaderCustomizer() {
  // visibleLinks は window.__twitterViewerConfig から取得（空配列 = 全リンク表示）
  const visibleLinks: string[] = window.__twitterViewerConfig?.visibleLinks ?? [];

  const [navLinks, setNavLinks] = useState<NavLink[]>([]);
  const [isNavVisible, setIsNavVisible] = useState<boolean>(() => {
    const stored = localStorage.getItem(NAV_VISIBLE_KEY);
    return stored === null ? false : stored === "true";
  });
  const [isTweetInputVisible, setIsTweetInputVisible] = useState<boolean>(false);
  const composeButtonRef = useRef<HTMLAnchorElement | null>(null);

  // ヘッダーを非表示にする
  useEffect(() => {
    const existingStyle = document.getElementById(HEADER_HIDE_STYLE_ID);
    if (!existingStyle) {
      const style = document.createElement("style");
      style.id = HEADER_HIDE_STYLE_ID;
      style.textContent = `header[role="banner"] { display: none !important; }`;
      document.head.appendChild(style);
    }
    return () => {
      document.getElementById(HEADER_HIDE_STYLE_ID)?.remove();
    };
  }, []);

  // ツイート入力エリアを非表示にする
  useEffect(() => {
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
      const header = document.querySelector<HTMLElement>("header[role='banner']");
      if (!header) return false;
      const anchorElements = header.querySelectorAll<HTMLAnchorElement>('a[role="link"]');
      const links: NavLink[] = [];
      anchorElements.forEach((anchor) => {
        const href = anchor.getAttribute("href");
        const ariaLabel = anchor.getAttribute("aria-label");
        const svg = anchor.querySelector("svg");
        if (ariaLabel === "X") return;
        if (href && svg && ariaLabel) {
          if (visibleLinks.length === 0 || visibleLinks.includes(ariaLabel)) {
            links.push({ href, ariaLabel, svgContent: svg.outerHTML, label: ariaLabel });
          }
        }
      });
      if (links.length > 0) { setNavLinks(links); return true; }
      return false;
    };

    const applyFallbackLinks = () => {
      const links: NavLink[] = visibleLinks.length === 0
        ? Object.values(DEFAULT_NAV_LINKS)
        : visibleLinks.map((label) => DEFAULT_NAV_LINKS[label]).filter(Boolean);
      if (links.length > 0) setNavLinks(links);
    };

    let retryCount = 0;
    const maxRetries = 10;
    let retryTimer: ReturnType<typeof setInterval> | null = null;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    let observer: MutationObserver | null = null;

    const tryExtractLinks = () => {
      if (extractLinks()) {
        if (retryTimer) clearInterval(retryTimer);
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (observer) observer.disconnect();
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
          observer = new MutationObserver(() => {
            if (extractLinks()) {
              observer?.disconnect();
              if (timeoutTimer) clearTimeout(timeoutTimer);
            }
          });
          observer.observe(document.body, { childList: true, subtree: true });
        }
      }, 200);
      timeoutTimer = setTimeout(() => {
        if (retryTimer) clearInterval(retryTimer);
        if (observer) observer.disconnect();
        if (navLinks.length === 0) applyFallbackLinks();
      }, 5000);
    }, 100);

    return () => {
      clearTimeout(startInitialDelay);
      if (retryTimer) clearInterval(retryTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (observer) observer.disconnect();
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
        if (svg) { svg.innerHTML = `<path d="${COMPOSE_ICON_PATH}"></path>`; composeButtonRef.current.setAttribute("aria-label", "ポストする"); }
      }
    } else {
      existingStyle?.remove();
      setIsTweetInputVisible(true);
      if (composeButtonRef.current) {
        const svg = composeButtonRef.current.querySelector("svg");
        if (svg) { svg.innerHTML = `<path d="${CLOSE_ICON_PATH}"></path>`; composeButtonRef.current.setAttribute("aria-label", "閉じる"); }
      }
    }
  }, [isTweetInputVisible]);

  return { navLinks, isNavVisible, isTweetInputVisible, toggleNavVisibility, toggleTweetInputArea, composeButtonRef };
}
