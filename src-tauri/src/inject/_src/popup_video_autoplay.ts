// src-tauri/src/inject/_src/popup_video_autoplay.ts
// mcx-video-autoplay: 動画ポップアップ (href に /video/ を含む) でのみ動画を自動再生する。

/**
 * 対象 href が動画ポップアップ (パスに /video/ を含む) かどうかを判定する純粋関数。
 */
export function shouldAutoplay(targetHref: string | undefined): boolean {
  return typeof targetHref === "string" && targetHref.includes("/video/");
}

(function () {
  if (!shouldAutoplay(window.__mcxTargetHref)) return;

  // mcx-video-autoplay: 多重起動防止ガード (一意マーカーも兼ねる)
  const initMarker = "data-mcx-video-autoplay";
  if (document.documentElement.hasAttribute(initMarker)) return;
  document.documentElement.setAttribute(initMarker, "1");

  let done = false;

  const playButtonSelector = 'button[data-testid="playButton"]';

  const tryPlayVideo = (video: HTMLVideoElement): void => {
    const result = video.play();
    if (result && typeof result.then === "function") {
      result.catch(() => {
        // autoplay ポリシーで音あり再生が拒否されたらミュートして再試行する
        video.muted = true;
        video.play().catch(() => {
          // ミュート再生も失敗した場合は諦める
        });
      });
    }
  };

  const tryPlay = (): boolean => {
    const video = document.querySelector<HTMLVideoElement>("video");
    const playButton =
      document.querySelector<HTMLButtonElement>(playButtonSelector);

    if (!video && !playButton) return false;

    if (video) {
      tryPlayVideo(video);
    }
    if (playButton) {
      playButton.click();
    }
    return true;
  };

  const start = (): void => {
    if (tryPlay()) {
      done = true;
      return;
    }

    const observer = new MutationObserver(() => {
      if (done) {
        observer.disconnect();
        return;
      }
      if (tryPlay()) {
        done = true;
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // X のメディアモーダルが描画されない場合に備えてタイムアウトで打ち切る
    setTimeout(() => observer.disconnect(), 10000);
  };

  if (document.body) {
    start();
  } else {
    document.addEventListener("DOMContentLoaded", start);
  }
})();
