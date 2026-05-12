(function () {
  const config = window.__multiColumnXConfig;
  if (!config?.blurImageEnabled) return;
  const BLUR_AMOUNT = config.blurImageAmount || "10px";

  const unblurred = new WeakSet<Element>();
  const processed = new WeakSet<Element>();

  function applyBlur(root: HTMLElement): void {
    root.style.filter = `blur(${BLUR_AMOUNT})`;
  }

  function removeBlur(root: HTMLElement): void {
    root.style.filter = "";
    unblurred.add(root);
  }

  function attachInteraction(root: HTMLElement): void {
    root.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      removeBlur(root);
    });
    let longPressTimer: ReturnType<typeof setTimeout> | null = null;
    root.addEventListener(
      "touchstart",
      () => {
        longPressTimer = setTimeout(() => {
          removeBlur(root);
          longPressTimer = null;
        }, 500);
      },
      { passive: true },
    );
    const cancelLongPress = () => {
      if (longPressTimer !== null) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    };
    root.addEventListener("touchend", cancelLongPress, { passive: true });
    root.addEventListener("touchmove", cancelLongPress, { passive: true });
  }

  function setBlurImage(): void {
    const images = document.body.querySelectorAll(
      "div[data-testid='tweetPhoto']",
    );
    images.forEach((image) => {
      if (unblurred.has(image)) return;
      if (!processed.has(image)) {
        processed.add(image);
        attachInteraction(image as HTMLElement);
      }
      applyBlur(image as HTMLElement);
    });
  }

  function observeDOMChanges(): void {
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
          setBlurImage();
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  function setup(): void {
    setBlurImage();
    observeDOMChanges();
  }

  if (document.body) {
    setup();
  } else {
    document.addEventListener("DOMContentLoaded", setup);
  }
})();
