// src-tauri/src/inject/_src/mediaviewer_autoplay.ts
// mcx-mediaviewer-autoplay: モバイルのカラム内で X 標準の動画拡大表示
// (パス末尾が /mediaviewer) が開かれたとき、動画を自動再生する。
// タイムライン上のインライン動画 (mediaviewer 以外のパス) には触れない。

const AUTOPLAY_TIMEOUT_MS = 10000;
const PLAY_BUTTON_SELECTOR = 'button[data-testid="playButton"]';

/**
 * パスが動画の拡大表示 (末尾セグメントが mediaviewer) かどうかを判定する純粋関数。
 * 他の inject ファイルとは import で共有できないため video_control.ts と同等の判定を持つ。
 */
export function isMediaViewerPath(pathname: string): boolean {
  return /\/mediaviewer\/?$/.test(pathname);
}

// 拡大表示を開くたびに作る「訪問」の状態。
interface Visit {
  readonly path: string;
  // 再生確認済み、または打ち切り済みなら true (以降は何もしない)
  done: boolean;
  readonly timer: ReturnType<typeof setTimeout>;
  // 同じ要素に対して再生操作を重ねない (トグルで一時停止になるのを防ぐ)
  readonly attemptedVideos: WeakSet<HTMLVideoElement>;
  readonly clickedButtons: WeakSet<HTMLButtonElement>;
}

(function () {
  // 多重起動防止。この inject は document 生成時に走り documentElement / body が
  // null のため、DOM 属性ではなく window 上のフラグで判定する。
  if (window.__mcxMediaviewerAutoplayStarted) return;
  window.__mcxMediaviewerAutoplayStarted = true;

  let visit: Visit | null = null;

  const finish = (target: Visit): void => {
    target.done = true;
    clearTimeout(target.timer);
  };

  const enterVisit = (path: string): Visit => {
    const created: Visit = {
      path,
      done: false,
      timer: setTimeout(() => {
        created.done = true;
      }, AUTOPLAY_TIMEOUT_MS),
      attemptedVideos: new WeakSet(),
      clickedButtons: new WeakSet(),
    };
    return created;
  };

  const leaveVisit = (): void => {
    if (visit) finish(visit);
    visit = null;
  };

  const tryPlayVideo = (target: Visit, video: HTMLVideoElement): void => {
    target.attemptedVideos.add(video);
    video.addEventListener("playing", () => finish(target));
    const result = video.play();
    if (result && typeof result.then === "function") {
      result.then(
        () => finish(target),
        () => {
          // autoplay ポリシーで音あり再生が拒否されたらミュートして再試行する
          video.muted = true;
          video.play().then(
            () => finish(target),
            () => {
              // ミュート再生も失敗した場合は諦める
            },
          );
        },
      );
    }
  };

  const tryPlay = (target: Visit): void => {
    const video = document.querySelector<HTMLVideoElement>("video");
    if (video && !video.paused) {
      finish(target);
      return;
    }
    if (video && !target.attemptedVideos.has(video)) {
      tryPlayVideo(target, video);
    }
    const playButton =
      document.querySelector<HTMLButtonElement>(PLAY_BUTTON_SELECTOR);
    if (playButton && !target.clickedButtons.has(playButton)) {
      target.clickedButtons.add(playButton);
      playButton.click();
    }
  };

  // DOM 変化・履歴操作のたびに呼ばれる。mediaviewer 以外のパスではパス比較だけで戻る。
  const onChange = (): void => {
    const path = window.location.pathname;
    if (!isMediaViewerPath(path)) {
      leaveVisit();
      return;
    }
    if (!visit || visit.path !== path) {
      leaveVisit();
      visit = enterVisit(path);
    }
    if (!visit.done) tryPlay(visit);
  };

  // 共有DOM監視ハブ(dom_observer.ts, window.__mcxDomObserver)経由でDOM変化を購読する。
  // ハブが無い環境（単体テスト等）では document.body を単独で監視する。
  function subscribeDomChanges(callback: () => void): void {
    if (window.__mcxDomObserver) {
      window.__mcxDomObserver.subscribe(callback);
      return;
    }
    new MutationObserver(callback).observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  // document.body が存在してから呼ぶこと。
  const start = (): void => {
    // 起動済みマーカー (documentElement が無い環境でも例外を出さない)
    (document.documentElement as HTMLElement | null)?.setAttribute(
      "data-mcx-mediaviewer-autoplay",
      "1",
    );
    subscribeDomChanges(onChange);
    // X は SPA のため、戻る/進むでもパスが変わる
    window.addEventListener("popstate", onChange);
    onChange();
  };

  if (document.body) {
    start();
  } else {
    document.addEventListener("DOMContentLoaded", start);
  }
})();
