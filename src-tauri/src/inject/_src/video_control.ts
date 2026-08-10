// mediaviewer（X の全画面メディアビューア）ではユーザーが明示的に再生を望んでいるため、
// オートプレイ抑制を行わない。Android で動画再生時にこの URL へ遷移する。
// 例: /ANIMA_info/status/2070703676067635303/mediaviewer
export function isMediaViewerPath(pathname: string): boolean {
  return /\/mediaviewer\/?$/.test(pathname);
}

const VIDEO_PLAYER_SELECTOR = '[data-testid="videoComponent"]';

(function () {
  // ユーザーが動画コンテナを明示的にクリックして再生操作を行った動画は、以降
  // タイムライン仮想リストの再マウントでXが自動 play() を呼んでも止めない。
  const unlockedVideos = new WeakSet<HTMLVideoElement>();

  function blockFirstAutoplay(video: HTMLVideoElement): void {
    // mediaviewer ではブロックしない（処理時点の URL でその都度判定する）
    if (isMediaViewerPath(window.location.pathname)) {
      return;
    }
    video.pause();
    video.addEventListener(
      "play",
      (e) => {
        const target = e.target as HTMLVideoElement;
        if (!unlockedVideos.has(target)) {
          target.pause();
        }
      },
      { capture: true },
    );
  }

  function findVideoInPlayerContainer(
    target: EventTarget | null,
  ): HTMLVideoElement | null {
    if (!(target instanceof Element)) {
      return null;
    }
    const container = target.closest(VIDEO_PLAYER_SELECTOR);
    if (!container) {
      return null;
    }
    return container.querySelector("video");
  }

  function unlockOnContainerClick(e: MouseEvent): void {
    const video = findVideoInPlayerContainer(e.target);
    if (video) {
      unlockedVideos.add(video);
    }
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

    document.addEventListener("click", unlockOnContainerClick, {
      capture: true,
    });
  }

  if (document.body) {
    setup();
  } else {
    document.addEventListener("DOMContentLoaded", setup);
  }
})();
