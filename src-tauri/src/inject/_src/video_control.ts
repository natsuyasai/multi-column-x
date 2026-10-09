// mediaviewer（X の全画面メディアビューア）ではユーザーが明示的に再生を望んでいるため、
// オートプレイ抑制を行わない。Android で動画再生時にこの URL へ遷移する。
// 例: /ANIMA_info/status/2070703676067635303/mediaviewer
export function isMediaViewerPath(pathname: string): boolean {
  return /\/mediaviewer\/?$/.test(pathname);
}

const VIDEO_CONTROL_PLAYER_SELECTOR = '[data-testid="videoComponent"]';

(function () {
  // ユーザーが動画コンテナを明示的にクリックして再生操作を行った動画は、以降
  // タイムライン仮想リストの再マウントでXが自動 play() を呼んでも止めない。
  const unlockedVideos = new WeakSet<HTMLVideoElement>();

  // X のプレイヤーは pause されると play() を再試行する。毎回 pause で応じると
  // play/pause が無限ループしてスピナーと CPU が張り付くため、未アンロックの動画は
  // 最初の play() だけ通し（playing を出してスピナーを消させ）、直後に 1 回だけ止める。
  // 以降の play() は何もせず解決済みの Promise を返す。
  const firstPlayDone = new WeakSet<HTMLVideoElement>();
  const firstPlayPassing = new WeakSet<HTMLVideoElement>();
  const originalPlay = HTMLMediaElement.prototype.play;

  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    if (
      this instanceof HTMLVideoElement &&
      !isMediaViewerPath(window.location.pathname) &&
      !unlockedVideos.has(this)
    ) {
      if (firstPlayDone.has(this)) {
        return Promise.resolve();
      }
      firstPlayDone.add(this);
      firstPlayPassing.add(this);
      const video = this;
      video.addEventListener(
        "playing",
        () => {
          firstPlayPassing.delete(video);
          if (!unlockedVideos.has(video)) {
            video.pause();
          }
        },
        { once: true },
      );
    }
    return originalPlay.call(this);
  };

  function blockFirstAutoplay(video: HTMLVideoElement): void {
    // mediaviewer ではブロックしない（処理時点の URL でその都度判定する）
    if (isMediaViewerPath(window.location.pathname)) {
      return;
    }
    if (!firstPlayPassing.has(video)) {
      video.pause();
    }
    video.addEventListener(
      "play",
      (e) => {
        const target = e.target as HTMLVideoElement;
        if (!unlockedVideos.has(target) && !firstPlayPassing.has(target)) {
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
    const container = target.closest(VIDEO_CONTROL_PLAYER_SELECTOR);
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
