(function () {
  function stopVideosIn(node: Node): void {
    if ((node as HTMLElement).tagName === "VIDEO") {
      (node as HTMLVideoElement).pause();
    }
    if (node instanceof Element) {
      node.querySelectorAll("video").forEach((v) => v.pause());
    }
  }

  document.querySelectorAll("video").forEach((v) => v.pause());

  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          stopVideosIn(node);
        }
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
})();
