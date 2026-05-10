(function () {
  const STORAGE_KEY = "x-home-previous-photo-url";
  const HOME_URL_PATTERN = /^https:\/\/x\.com\/home/;
  const PHOTO_URL_PATTERN =
    /^https:\/\/x\.com\/(.+)\/status\/(\d+)\/photo\/(\d+)/;
  const MAX_SCROLL_ATTEMPTS = 50;
  const SCROLL_STEP = 500;
  const SCROLL_INTERVAL = 400;

  function isHomePage(): boolean {
    return HOME_URL_PATTERN.test(window.location.href);
  }

  function isPhotoPage(): boolean {
    return PHOTO_URL_PATTERN.test(window.location.href);
  }

  function extractPhotoBasePath(url: string): string | null {
    const match = url.match(PHOTO_URL_PATTERN);
    if (!match) return null;
    const [, username, statusId, photoNum] = match;
    return `/${username}/status/${statusId}/photo/${photoNum}`;
  }

  function savePhotoUrl(url: string): void {
    try {
      localStorage.setItem(STORAGE_KEY, url);
    } catch {
      // ignore
    }
  }

  function getSavedPhotoUrl(): string | null {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }

  function findLinkElementByHref(targetPath: string): HTMLAnchorElement | null {
    const links = document.querySelectorAll<HTMLAnchorElement>('a[role="link"]');
    for (const link of links) {
      const href = link.getAttribute("href");
      if (href && href === targetPath) return link;
    }
    return null;
  }

  function scrollToFindElement(targetPath: string): void {
    let attempts = 0;
    const initialScrollY = window.scrollY;

    const scrollInterval = setInterval(() => {
      attempts++;

      const linkElement = findLinkElementByHref(targetPath);
      if (linkElement) {
        linkElement.scrollIntoView({ behavior: "smooth", block: "center" });
        clearInterval(scrollInterval);
        localStorage.removeItem(STORAGE_KEY);
        return;
      }

      if (attempts >= MAX_SCROLL_ATTEMPTS) {
        clearInterval(scrollInterval);
        window.scrollTo(0, initialScrollY);
        localStorage.removeItem(STORAGE_KEY);
        return;
      }

      window.scrollBy(0, SCROLL_STEP);
    }, SCROLL_INTERVAL);
  }

  function restoreScrollPosition(): void {
    if (!isHomePage()) return;

    const savedPhotoUrl = getSavedPhotoUrl();
    if (!savedPhotoUrl) return;

    const targetPath = extractPhotoBasePath(savedPhotoUrl);
    if (!targetPath) return;

    setTimeout(() => {
      scrollToFindElement(targetPath);
    }, 1000);
  }

  function handleLinkClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const link = target.closest("a");
    if (!link || !isHomePage()) return;

    if (PHOTO_URL_PATTERN.test(link.href)) {
      savePhotoUrl(link.href);
    }
  }

  function observeNavigation(): void {
    let previousUrl = window.location.href;

    setInterval(() => {
      const currentUrl = window.location.href;
      if (currentUrl !== previousUrl) {
        previousUrl = currentUrl;
      }
    }, 500);

    window.addEventListener("popstate", () => {
      const wasPhotoPage = PHOTO_URL_PATTERN.test(previousUrl);
      if (wasPhotoPage && isHomePage()) {
        restoreScrollPosition();
      }
      previousUrl = window.location.href;
    });

    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
      const wasPhotoPage = isPhotoPage();
      originalPushState.apply(history, args);

      if (isPhotoPage()) {
        savePhotoUrl(window.location.href);
      }
      if (wasPhotoPage && isHomePage()) {
        restoreScrollPosition();
      }

      previousUrl = window.location.href;
    };

    history.replaceState = function (...args) {
      originalReplaceState.apply(history, args);
      previousUrl = window.location.href;
    };
  }

  observeNavigation();
  document.addEventListener("click", handleLinkClick, true);
})();
