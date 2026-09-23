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

  // 共有DOM監視ハブ(dom_observer.ts, window.__mcxDomObserver)経由でDOM変化を購読する。
  // ハブは document.body を childList+subtree で監視し、MutationRecordの詳細に依存
  // しないコールバックをrequestAnimationFrameで1フレームにまとめて配る。ハブが無い
  // 環境（単体テストや、注入順序が変わった場合等）では、フォールバックとして従来と
  // 同じdocument.bodyのchildList+subtree監視をこのファイル単独で行う。
  function subscribeDomChanges(
    callback: (mutations: MutationRecord[]) => void,
  ): () => void {
    if (window.__mcxDomObserver) {
      return window.__mcxDomObserver.subscribe(callback);
    }
    const observer = new MutationObserver(callback);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }

  const start = (): void => {
    if (tryPlay()) {
      done = true;
      return;
    }

    const unsubscribe = subscribeDomChanges(() => {
      if (done) {
        unsubscribe();
        return;
      }
      if (tryPlay()) {
        done = true;
        unsubscribe();
      }
    });

    // X のメディアモーダルが描画されない場合に備えてタイムアウトで打ち切る
    setTimeout(() => unsubscribe(), 10000);
  };

  if (document.body) {
    start();
  } else {
    document.addEventListener("DOMContentLoaded", start);
  }
})();
