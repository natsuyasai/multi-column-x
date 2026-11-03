// mediaviewer_autoplay.ts は IIFE のため、import 時に監視が始まる。
// 純粋関数 isMediaViewerPath の判定と、IIFE の video.play / click の挙動を検証する。
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isMediaViewerPath } from "./mediaviewer_autoplay";

// 静的 import による起動 (IIFE) を抑止する。各テストが importAutoplay で改めて
// 起動し、挙動を検証する (純粋関数 isMediaViewerPath のためだけに import している)。
vi.hoisted(() => {
  window.__mcxMediaviewerAutoplayStarted = true;
});

// 共有DOM監視ハブ(dom_observer.ts)は自身の内部MutationObserverを明示的に
// disconnectしない常駐前提の設計のため、MutationObserverを追跡し、
// テスト後に確実にdisconnectする（popup_video_autoplay.test.ts と同じ対策）。
const createdObservers = new Set<MutationObserver>();
const OriginalMutationObserver = globalThis.MutationObserver;

class TrackingMutationObserver extends OriginalMutationObserver {
  constructor(callback: MutationCallback) {
    super(callback);
    createdObservers.add(this);
  }
}
vi.stubGlobal("MutationObserver", TrackingMutationObserver);

// window に追加された popstate リスナーを追跡し、テスト後に確実に解除する
// （IIFE は常駐前提で解除しないため、テスト間で重複起動しないようにする）。
const popstateListeners: EventListener[] = [];
const originalAddEventListener = window.addEventListener.bind(window);
window.addEventListener = ((
  type: string,
  listener: EventListenerOrEventListenerObject,
  options?: boolean | AddEventListenerOptions,
) => {
  if (type === "popstate" && typeof listener === "function") {
    popstateListeners.push(listener as EventListener);
  }
  originalAddEventListener(type, listener, options);
}) as typeof window.addEventListener;

function clearTrackedListeners(): void {
  popstateListeners.forEach((listener) =>
    window.removeEventListener("popstate", listener),
  );
  popstateListeners.length = 0;
  createdObservers.forEach((observer) => observer.disconnect());
  createdObservers.clear();
}

const TIMELINE_PATH = "/home";
const VIEWER_PATH = "/user/status/123/mediaviewer";
const OTHER_VIEWER_PATH = "/user/status/456/mediaviewer";

/** microtask（jsdom の MutationObserver コールバックや Promise 解決）を流す。 */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
}

/** jsdom の video.paused を上書きして再生中／一時停止を模擬する。 */
function setPaused(video: HTMLVideoElement, paused: boolean): void {
  Object.defineProperty(video, "paused", { value: paused, configurable: true });
}

function createPlayButton(): {
  button: HTMLButtonElement;
  clickSpy: () => void;
} {
  const button = document.createElement("button");
  button.setAttribute("data-testid", "playButton");
  const clickSpy = vi.fn();
  button.addEventListener("click", clickSpy);
  return { button, clickSpy };
}

function removeOwnProperty(name: "documentElement" | "body"): void {
  delete (document as unknown as Record<string, unknown>)[name];
}

/** X の SPA 遷移を模擬する: パスを変え、その後に DOM が更新される。 */
async function navigate(path: string): Promise<void> {
  window.history.pushState({}, "", path);
  document.body.appendChild(document.createElement("div"));
  await flushMicrotasks();
}

async function importAutoplay(): Promise<void> {
  vi.resetModules();
  await import("./mediaviewer_autoplay");
}

describe("inject/mediaviewer_autoplay の isMediaViewerPath", () => {
  it("パス末尾が mediaviewer の動画拡大表示は対象になる", () => {
    expect(isMediaViewerPath("/user/status/123/mediaviewer")).toBe(true);
  });

  it("末尾にスラッシュがあっても対象になる", () => {
    expect(isMediaViewerPath("/user/status/123/mediaviewer/")).toBe(true);
  });

  it("タイムラインや status ページは対象にならない", () => {
    expect(isMediaViewerPath("/home")).toBe(false);
    expect(isMediaViewerPath("/user/status/123")).toBe(false);
  });

  it("mediaviewer の後ろにパスが続く場合は対象にならない", () => {
    expect(isMediaViewerPath("/user/status/123/mediaviewer/extra")).toBe(false);
  });

  it("mediaviewer を含むだけの別名セグメントは対象にならない", () => {
    expect(isMediaViewerPath("/user/status/123/xmediaviewer")).toBe(false);
  });

  it("空文字は対象にならない", () => {
    expect(isMediaViewerPath("")).toBe(false);
  });
});

describe("inject/mediaviewer_autoplay の自動再生挙動(共有ハブ非存在時のフォールバック)", () => {
  let playMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    delete window.__mcxMediaviewerAutoplayStarted;
    window.history.pushState({}, "", TIMELINE_PATH);
    document.body.innerHTML = "";
    playMock = vi.fn(() => Promise.resolve());
    // jsdom は play を実装しないため必須
    HTMLMediaElement.prototype.play =
      playMock as unknown as () => Promise<void>;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete window.__mcxMediaviewerAutoplayStarted;
    clearTrackedListeners();
  });

  it("モバイルでタップして開いた動画はその場表示で自動再生される", async () => {
    document.body.appendChild(document.createElement("video"));
    await importAutoplay();
    expect(playMock).not.toHaveBeenCalled();

    await navigate(VIEWER_PATH);

    expect(playMock).toHaveBeenCalledTimes(1);
  });

  it("モバイルのタイムライン上のインライン動画は自動再生されない", async () => {
    document.body.appendChild(document.createElement("video"));
    const { button, clickSpy } = createPlayButton();
    document.body.appendChild(button);

    await importAutoplay();
    document.body.appendChild(document.createElement("video"));
    await flushMicrotasks();
    await navigate("/user/status/123");

    expect(playMock).not.toHaveBeenCalled();
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it("読み込み時点で拡大表示のパスにいる場合も動画の再生準備ができ次第再生が始まる", async () => {
    window.history.pushState({}, "", VIEWER_PATH);
    document.body.appendChild(document.createElement("video"));

    await importAutoplay();
    await flushMicrotasks();

    expect(playMock).toHaveBeenCalledTimes(1);
  });

  it("動画の再生準備ができたら自動で再生が始まる", async () => {
    await importAutoplay();
    document.body.appendChild(document.createElement("video"));
    await navigate(VIEWER_PATH);

    expect(playMock).toHaveBeenCalledTimes(1);
  });

  it("起動済みマーカー属性が documentElement に付与される", async () => {
    document.documentElement.removeAttribute("data-mcx-mediaviewer-autoplay");

    await importAutoplay();

    expect(
      document.documentElement.getAttribute("data-mcx-mediaviewer-autoplay"),
    ).toBe("1");
  });

  it("動画の読み込みが遅れても準備でき次第再生が始まる", async () => {
    await importAutoplay();
    await navigate(VIEWER_PATH);
    expect(playMock).not.toHaveBeenCalled();

    document.body.appendChild(document.createElement("video"));
    await flushMicrotasks();

    expect(playMock).toHaveBeenCalledTimes(1);
  });

  it("再生ボタンだけがあるときはクリックし、後から動画が現れたら再生する", async () => {
    const { button, clickSpy } = createPlayButton();
    document.body.appendChild(button);
    await importAutoplay();
    await navigate(VIEWER_PATH);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(playMock).not.toHaveBeenCalled();

    document.body.appendChild(document.createElement("video"));
    await flushMicrotasks();

    expect(playMock).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("動画が深い階層に後から表示されても自動再生される", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    await importAutoplay();
    await navigate(VIEWER_PATH);

    container.appendChild(document.createElement("video"));
    await flushMicrotasks();

    expect(playMock).toHaveBeenCalledTimes(1);
  });

  it("音ありの自動再生が拒否されたときはミュートして再生する", async () => {
    let call = 0;
    playMock.mockImplementation(() => {
      call += 1;
      return call === 1
        ? Promise.reject(new Error("NotAllowedError"))
        : Promise.resolve();
    });
    const video = document.createElement("video");
    document.body.appendChild(video);

    await importAutoplay();
    await navigate(VIEWER_PATH);

    expect(playMock).toHaveBeenCalledTimes(2);
    expect(video.muted).toBe(true);
  });

  it("音ありの自動再生が許可されたときはミュートしない", async () => {
    const video = document.createElement("video");
    document.body.appendChild(video);

    await importAutoplay();
    await navigate(VIEWER_PATH);

    expect(playMock).toHaveBeenCalledTimes(1);
    expect(video.muted).toBe(false);
  });

  it("ミュート再生も拒否された場合は例外を投げずに諦める", async () => {
    playMock.mockImplementation(() => Promise.reject(new Error("denied")));
    document.body.appendChild(document.createElement("video"));

    await importAutoplay();
    await navigate(VIEWER_PATH);

    expect(playMock).toHaveBeenCalledTimes(2);
  });

  it("再生開始の操作が重なっても play もクリックも1回ずつしか行わない", async () => {
    // 再生確定前（pending）の状態を保つ
    playMock.mockImplementation(() => new Promise<void>(() => {}));
    const { button, clickSpy } = createPlayButton();
    document.body.appendChild(button);
    document.body.appendChild(document.createElement("video"));

    await importAutoplay();
    await navigate(VIEWER_PATH);
    document.body.appendChild(document.createElement("div"));
    await flushMicrotasks();
    document.body.appendChild(document.createElement("div"));
    await flushMicrotasks();

    expect(playMock).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("動画がすでに再生中のときは再生操作を重ねない", async () => {
    const video = document.createElement("video");
    setPaused(video, false);
    document.body.appendChild(video);
    const { button, clickSpy } = createPlayButton();
    document.body.appendChild(button);

    await importAutoplay();
    await navigate(VIEWER_PATH);

    expect(playMock).not.toHaveBeenCalled();
    expect(clickSpy).not.toHaveBeenCalled();

    // 再生中を確認した後は、動画が差し替わっても操作しない
    video.remove();
    document.body.appendChild(document.createElement("video"));
    await flushMicrotasks();
    expect(playMock).not.toHaveBeenCalled();
  });

  it("play が Promise を返さない環境でも例外を投げない", async () => {
    playMock.mockImplementation(() => undefined);
    document.body.appendChild(document.createElement("video"));

    await importAutoplay();
    await expect(navigate(VIEWER_PATH)).resolves.toBeUndefined();
    expect(playMock).toHaveBeenCalledTimes(1);
  });

  it("play の戻り値が then を持たない場合も例外を投げない", async () => {
    playMock.mockImplementation(() => ({}));
    document.body.appendChild(document.createElement("video"));

    await importAutoplay();
    await expect(navigate(VIEWER_PATH)).resolves.toBeUndefined();
    expect(playMock).toHaveBeenCalledTimes(1);
  });

  it("動画が後から再生中になったのを検知したら以降は操作しない", async () => {
    playMock.mockImplementation(() => new Promise<void>(() => {}));
    const video = document.createElement("video");
    document.body.appendChild(video);

    await importAutoplay();
    await navigate(VIEWER_PATH);
    expect(playMock).toHaveBeenCalledTimes(1);

    // X 側が自分で再生を始めた後、動画が差し替わっても再生し直さない
    setPaused(video, false);
    document.body.appendChild(document.createElement("div"));
    await flushMicrotasks();
    video.remove();
    document.body.appendChild(document.createElement("video"));
    await flushMicrotasks();

    expect(playMock).toHaveBeenCalledTimes(1);
  });

  it("再生開始イベントを受けたら再生確認済みとして以降は反応しない", async () => {
    playMock.mockImplementation(() => new Promise<void>(() => {}));
    const video = document.createElement("video");
    document.body.appendChild(video);

    await importAutoplay();
    await navigate(VIEWER_PATH);
    video.dispatchEvent(new Event("playing"));
    video.remove();
    document.body.appendChild(document.createElement("video"));
    await flushMicrotasks();

    expect(playMock).toHaveBeenCalledTimes(1);
  });

  it("動画の拡大表示が現れないまま10秒経ったら自動再生の待機をやめる", async () => {
    await importAutoplay();
    await navigate(VIEWER_PATH);
    vi.advanceTimersByTime(9999);
    document.body.appendChild(document.createElement("div"));
    await flushMicrotasks();
    expect(playMock).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    document.body.appendChild(document.createElement("video"));
    await flushMicrotasks();

    expect(playMock).not.toHaveBeenCalled();
  });

  it("10秒の待機は拡大表示に入った時点から数える", async () => {
    await importAutoplay();
    vi.advanceTimersByTime(60000);
    await navigate(VIEWER_PATH);
    vi.advanceTimersByTime(5000);

    document.body.appendChild(document.createElement("video"));
    await flushMicrotasks();

    expect(playMock).toHaveBeenCalledTimes(1);
  });

  it("再生確認後は打ち切りタイマーが残らない", async () => {
    document.body.appendChild(document.createElement("video"));
    await importAutoplay();
    await navigate(VIEWER_PATH);

    expect(vi.getTimerCount()).toBe(0);
  });

  it("拡大表示を離れたら打ち切りタイマーが残らない", async () => {
    playMock.mockImplementation(() => new Promise<void>(() => {}));
    document.body.appendChild(document.createElement("video"));
    await importAutoplay();
    await navigate(VIEWER_PATH);
    expect(vi.getTimerCount()).toBe(1);

    await navigate(TIMELINE_PATH);

    expect(vi.getTimerCount()).toBe(0);
  });

  it("別の動画の拡大表示へ遷移したら前の訪問の打ち切りタイマーは破棄される", async () => {
    playMock.mockImplementation(() => new Promise<void>(() => {}));
    document.body.appendChild(document.createElement("video"));
    await importAutoplay();
    await navigate(VIEWER_PATH);

    await navigate(OTHER_VIEWER_PATH);

    expect(vi.getTimerCount()).toBe(1);
  });

  it("ミュートして再生できたあとは動画が差し替わっても再生し直さない", async () => {
    let call = 0;
    playMock.mockImplementation(() => {
      call += 1;
      return call === 1
        ? Promise.reject(new Error("NotAllowedError"))
        : Promise.resolve();
    });
    document.body.appendChild(document.createElement("video"));
    await importAutoplay();
    await navigate(VIEWER_PATH);
    expect(playMock).toHaveBeenCalledTimes(2);

    document.querySelector("video")?.remove();
    document.body.appendChild(document.createElement("video"));
    await flushMicrotasks();

    expect(playMock).toHaveBeenCalledTimes(2);
  });

  it("自動再生は同じ画面で二重に起動しない", async () => {
    playMock.mockImplementation(() => new Promise<void>(() => {}));
    document.body.appendChild(document.createElement("video"));

    await importAutoplay();
    await importAutoplay();
    await navigate(VIEWER_PATH);

    expect(playMock).toHaveBeenCalledTimes(1);
  });

  it("自動再生後にユーザーが一時停止した動画は再び自動再生されない", async () => {
    const video = document.createElement("video");
    document.body.appendChild(video);

    await importAutoplay();
    await navigate(VIEWER_PATH);
    expect(playMock).toHaveBeenCalledTimes(1);

    // ユーザーが一時停止した後、動画が差し替わっても自動再生しない
    setPaused(video, true);
    video.dispatchEvent(new Event("pause"));
    video.remove();
    document.body.appendChild(document.createElement("video"));
    await flushMicrotasks();

    expect(playMock).toHaveBeenCalledTimes(1);
  });

  it("拡大表示を一度出て再度入ると新しい訪問として自動再生される", async () => {
    document.body.appendChild(document.createElement("video"));
    await importAutoplay();
    await navigate(VIEWER_PATH);
    expect(playMock).toHaveBeenCalledTimes(1);

    await navigate(TIMELINE_PATH);
    expect(playMock).toHaveBeenCalledTimes(1);

    await navigate(VIEWER_PATH);
    expect(playMock).toHaveBeenCalledTimes(2);
  });

  it("別の動画の拡大表示へ遷移すると新しい訪問として自動再生される", async () => {
    const { button, clickSpy } = createPlayButton();
    document.body.appendChild(button);
    await importAutoplay();
    await navigate(VIEWER_PATH);
    expect(clickSpy).toHaveBeenCalledTimes(1);

    await navigate(OTHER_VIEWER_PATH);

    expect(clickSpy).toHaveBeenCalledTimes(2);
  });

  it("前の訪問が打ち切られていても新しい訪問では再度自動再生を試みる", async () => {
    await importAutoplay();
    await navigate(VIEWER_PATH);
    vi.advanceTimersByTime(10000);
    await navigate(TIMELINE_PATH);

    document.body.appendChild(document.createElement("video"));
    await navigate(VIEWER_PATH);

    expect(playMock).toHaveBeenCalledTimes(1);
  });

  it("戻る操作で拡大表示から離れて再度入っても自動再生される", async () => {
    document.body.appendChild(document.createElement("video"));
    await importAutoplay();
    await navigate(VIEWER_PATH);
    expect(playMock).toHaveBeenCalledTimes(1);

    window.history.pushState({}, "", TIMELINE_PATH);
    window.dispatchEvent(new PopStateEvent("popstate"));
    window.history.pushState({}, "", VIEWER_PATH);
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(playMock).toHaveBeenCalledTimes(2);
  });
});

describe("inject/mediaviewer_autoplay の document 生成時の実行", () => {
  let playMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    delete window.__mcxMediaviewerAutoplayStarted;
    window.history.pushState({}, "", VIEWER_PATH);
    document.body.innerHTML = "";
    playMock = vi.fn(() => Promise.resolve());
    HTMLMediaElement.prototype.play =
      playMock as unknown as () => Promise<void>;
  });

  afterEach(() => {
    // インスタンスに上書きした getter を除去し、prototype 本来の getter に戻す
    removeOwnProperty("documentElement");
    removeOwnProperty("body");
    delete window.__mcxMediaviewerAutoplayStarted;
    clearTrackedListeners();
  });

  it("document.documentElement が null の状態で実行しても例外を投げない", async () => {
    Object.defineProperty(document, "documentElement", {
      get: () => null,
      configurable: true,
    });

    await expect(importAutoplay()).resolves.toBeUndefined();
  });

  it("document.body が null で読み込まれても body が現れてから自動再生が始まる", async () => {
    document.body.appendChild(document.createElement("video"));
    Object.defineProperty(document, "documentElement", {
      get: () => null,
      configurable: true,
    });
    Object.defineProperty(document, "body", {
      get: () => null,
      configurable: true,
    });

    await importAutoplay();
    expect(playMock).not.toHaveBeenCalled();

    removeOwnProperty("documentElement");
    removeOwnProperty("body");
    document.dispatchEvent(new Event("DOMContentLoaded"));
    await flushMicrotasks();

    expect(playMock).toHaveBeenCalledTimes(1);
  });
});

describe("inject/mediaviewer_autoplay の自動再生挙動(共有ハブ経由)", () => {
  let playMock: ReturnType<typeof vi.fn>;

  async function importDomObserverAndAutoplay(): Promise<void> {
    vi.resetModules();
    delete (window as unknown as { __mcxDomObserver?: unknown })
      .__mcxDomObserver;
    await import("./dom_observer");
    await import("./mediaviewer_autoplay");
  }

  beforeEach(() => {
    delete window.__mcxMediaviewerAutoplayStarted;
    window.history.pushState({}, "", TIMELINE_PATH);
    document.body.innerHTML = "";
    playMock = vi.fn(() => Promise.resolve());
    HTMLMediaElement.prototype.play =
      playMock as unknown as () => Promise<void>;
    // ハブは requestAnimationFrame で配信するため即時実行に差し替える
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal("MutationObserver", TrackingMutationObserver);
    delete (window as unknown as { __mcxDomObserver?: unknown })
      .__mcxDomObserver;
    delete window.__mcxMediaviewerAutoplayStarted;
    clearTrackedListeners();
  });

  it("共有ハブがあるときは独自の監視を作らずハブを購読する", async () => {
    const subscribe = vi.fn(() => () => {});
    (window as unknown as { __mcxDomObserver: unknown }).__mcxDomObserver = {
      subscribe,
    };
    const before = createdObservers.size;

    await importAutoplay();

    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(createdObservers.size).toBe(before);
  });

  it("共有ハブ経由でも拡大表示に入ると自動再生され、インライン動画には触れない", async () => {
    document.body.appendChild(document.createElement("video"));
    await importDomObserverAndAutoplay();
    document.body.appendChild(document.createElement("div"));
    await flushMicrotasks();
    expect(playMock).not.toHaveBeenCalled();

    await navigate(VIEWER_PATH);

    expect(playMock).toHaveBeenCalledTimes(1);
  });
});
