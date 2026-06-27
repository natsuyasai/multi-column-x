// mediaviewer（X の全画面メディアビューア）ではユーザーが明示的に再生を望んでいるため、
// オートプレイ抑制を行わない。Android で動画再生時にこの URL へ遷移する。
// 例: /ANIMA_info/status/2070703676067635303/mediaviewer
export function isMediaViewerPath(pathname: string): boolean {
  return /\/mediaviewer\/?$/.test(pathname);
}

(function () {
  function blockFirstAutoplay(video: HTMLVideoElement): void {
    // mediaviewer ではブロックしない（処理時点の URL でその都度判定する）
    if (isMediaViewerPath(window.location.pathname)) {
      return;
    }
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
