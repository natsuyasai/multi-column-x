(function () {
  function blockFirstAutoplay(video: HTMLVideoElement): void {
    video.pause();
    let blocked = true;
    setTimeout(() => {
      blocked = false;
    }, 2000);
    video.addEventListener(
      "play",
      (e) => {
        if (blocked) {
          (e.target as HTMLVideoElement).pause();
        }
      },
      { capture: true },
    );
  }

  function stopVideosIn(node: Node): void {
    if ((node as HTMLElement).tagName === "VIDEO") {
      blockFirstAutoplay(node as HTMLVideoElement);
    }
    if (node instanceof Element) {
      node.querySelectorAll("video").forEach(blockFirstAutoplay);
    }
  }

  function setup(): void {
    document.querySelectorAll("video").forEach(blockFirstAutoplay);

    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            stopVideosIn(node);
          }
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.body) {
    setup();
  } else {
    document.addEventListener("DOMContentLoaded", setup);
  }
})();
