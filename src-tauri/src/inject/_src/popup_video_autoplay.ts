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

  // mcx-video-autoplay: 多重起動防止ガード (一意マーカーも兼ねる)。
  // この inject は document 生成時に走り、その時点では documentElement / body が
  // null のため DOM 属性には依存せず window 上のフラグで判定する。
  if (window.__mcxVideoAutoplayStarted) return;
  window.__mcxVideoAutoplayStarted = true;

  let unsubscribe: () => void = () => {};
  // 同じ要素に対して再生操作を重ねない (トグルで一時停止になるのを防ぐ)
  const attemptedVideos = new WeakSet<HTMLVideoElement>();
  const clickedButtons = new WeakSet<HTMLButtonElement>();

  const playButtonSelector = 'button[data-testid="playButton"]';

  // 再生が実際に始まったら購読を解除する (何度呼んでも安全)。
  // 以降の変化には反応しないため、ユーザーが一時停止しても再生し直さない。
  const finish = (): void => {
    unsubscribe();
    unsubscribe = () => {};
  };

  const tryPlayVideo = (video: HTMLVideoElement): void => {
    attemptedVideos.add(video);
    video.addEventListener("playing", finish);
    const result = video.play();
    if (result && typeof result.then === "function") {
      result.then(finish, () => {
        // autoplay ポリシーで音あり再生が拒否されたらミュートして再試行する
        video.muted = true;
        video.play().then(finish, () => {
          // ミュート再生も失敗した場合は諦める
        });
      });
    }
  };

  // 再生済みなら true。再生操作が必要なものにだけ操作を行う。
  const tryPlay = (): boolean => {
    const video = document.querySelector<HTMLVideoElement>("video");
    if (video && !video.paused) return true;

    if (video && !attemptedVideos.has(video)) {
      tryPlayVideo(video);
    }
    const playButton =
      document.querySelector<HTMLButtonElement>(playButtonSelector);
    if (playButton && !clickedButtons.has(playButton)) {
      clickedButtons.add(playButton);
      playButton.click();
    }
    return false;
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

  // document.body が存在してから呼ぶこと。
  const start = (): void => {
    // 起動済みマーカー属性 (documentElement が無い環境でも例外を出さない)
    (document.documentElement as HTMLElement | null)?.setAttribute(
      "data-mcx-video-autoplay",
      "1",
    );
    // すでに再生中なら購読せずに終了する
    if (tryPlay()) return;

    unsubscribe = subscribeDomChanges(() => {
      if (tryPlay()) finish();
    });

    // X のメディアモーダルが描画されない場合に備えてタイムアウトで打ち切る
    setTimeout(() => finish(), 10000);
  };

  if (document.body) {
    start();
  } else {
    document.addEventListener("DOMContentLoaded", start);
  }
})();
