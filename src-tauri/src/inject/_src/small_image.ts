(function () {
  const config = window.__multiColumnXConfig;
  if (!config?.smallImageEnabled) return;
  const IMAGE_WIDTH = config.smallImageWidth || "50%";

  function getImageRoot(element: Element): Element | null {
    if (element.parentElement === null) return null;
    if (element.parentElement.getAttribute("aria-labelledby")) {
      return element.parentElement;
    }
    return getImageRoot(element.parentElement);
  }

  function setSmallImage(): void {
    const images = document.body.querySelectorAll(
      "div[data-testid='tweetPhoto']",
    );
    images.forEach((image) => {
      const root = getImageRoot(image);
      if (root === null) return;
      (root as HTMLElement).style.width = IMAGE_WIDTH;
    });
  }

  function observeDOMChanges(): void {
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
          setSmallImage();
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  function setup(): void {
    setSmallImage();
    observeDOMChanges();
  }

  if (document.body) {
    setup();
  } else {
    document.addEventListener("DOMContentLoaded", setup);
  }
})();
