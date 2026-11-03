// popup_video_autoplay.ts は IIFE のため、import 時に自動再生処理が走る。
// 純粋関数 shouldAutoplay の判定と、IIFE の video.play 呼び出し挙動を検証する。
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { shouldAutoplay } from "./popup_video_autoplay";

// 共有DOM監視ハブ(dom_observer.ts)は自身の内部MutationObserverを明示的に
// disconnectしない常駐前提の設計のため、共有ハブ経由のテストではハブが作る
// MutationObserverを追跡し、テスト後に確実にdisconnectする
// （dom_observer.test.ts / mobile_area_hide.test.ts と同じ対策）。
const createdObservers = new Set<MutationObserver>();
const OriginalMutationObserver = globalThis.MutationObserver;

class TrackingMutationObserver extends OriginalMutationObserver {
  constructor(callback: MutationCallback) {
    super(callback);
    createdObservers.add(this);
  }
}
vi.stubGlobal("MutationObserver", TrackingMutationObserver);

const VIDEO_HREF = "https://x.com/user/status/123/video/1";

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

describe("inject/popup_video_autoplay の shouldAutoplay", () => {
  it("動画の表示先を開いたときは自動再生の対象になる", () => {
    expect(shouldAutoplay("https://x.com/user/status/123/video/1")).toBe(true);
  });

  it("パスのみの video URL でも自動再生の対象になる", () => {
    expect(shouldAutoplay("/user/status/123/video/1")).toBe(true);
  });

  it("画像など動画以外の表示先を開いたときは自動再生の対象にならない", () => {
    expect(shouldAutoplay("https://x.com/user/status/123/photo/1")).toBe(false);
  });

  it("通常の status URL は自動再生の対象にならない", () => {
    expect(shouldAutoplay("https://x.com/user/status/123")).toBe(false);
  });

  it("undefined の場合は自動再生の対象にならない", () => {
    expect(shouldAutoplay(undefined)).toBe(false);
  });

  it("空文字の場合は自動再生の対象にならない", () => {
    expect(shouldAutoplay("")).toBe(false);
  });
});

// jsdom の MutationObserver は microtask で動くため、10秒の打ち切りタイマーだけ
// を偽装する。dom_observer(共有ハブ)はimportしないため、popup_video_autoplay.ts
// 側のsubscribeDomChangesはフォールバック（ローカルのMutationObserver）経路を使う。
describe("inject/popup_video_autoplay の自動再生挙動(共有ハブ非存在時のフォールバック)", () => {
  let playMock: ReturnType<typeof vi.fn>;

  async function importAutoplay(): Promise<void> {
    vi.resetModules();
    await import("./popup_video_autoplay");
  }

  beforeEach(() => {
    delete window.__mcxVideoAutoplayStarted;
    document.body.innerHTML = "";
    playMock = vi.fn(() => Promise.resolve());
    // jsdom は play を実装しないため必須
    HTMLMediaElement.prototype.play =
      playMock as unknown as () => Promise<void>;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete window.__mcxTargetHref;
    delete window.__mcxVideoAutoplayStarted;
    createdObservers.forEach((observer) => observer.disconnect());
    createdObservers.clear();
  });

  it("動画の再生準備ができたら自動で再生が始まる", async () => {
    window.__mcxTargetHref = VIDEO_HREF;
    document.body.appendChild(document.createElement("video"));

    await importAutoplay();
    await flushMicrotasks();

    expect(playMock).toHaveBeenCalledTimes(1);
  });

  it("起動済みマーカー属性が documentElement に付与される", async () => {
    window.__mcxTargetHref = VIDEO_HREF;
    document.documentElement.removeAttribute("data-mcx-video-autoplay");

    await importAutoplay();

    expect(
      document.documentElement.getAttribute("data-mcx-video-autoplay"),
    ).toBe("1");
  });

  it("動画の読み込みが遅れても準備でき次第再生が始まる", async () => {
    window.__mcxTargetHref = VIDEO_HREF;

    await importAutoplay();
    expect(playMock).not.toHaveBeenCalled();

    document.body.appendChild(document.createElement("video"));
    await flushMicrotasks();

    expect(playMock).toHaveBeenCalledTimes(1);
  });

  it("画像ポップアップでは動画の自動再生は動作しない", async () => {
    window.__mcxTargetHref = "https://x.com/user/status/123/photo/1";
    document.body.appendChild(document.createElement("video"));
    const { button, clickSpy } = createPlayButton();
    document.body.appendChild(button);

    await importAutoplay();
    await flushMicrotasks();

    expect(playMock).not.toHaveBeenCalled();
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it("音ありの自動再生が拒否されたときはミュートして再生する", async () => {
    window.__mcxTargetHref = VIDEO_HREF;
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
    await flushMicrotasks();

    expect(playMock).toHaveBeenCalledTimes(2);
    expect(video.muted).toBe(true);
  });

  it("音ありの自動再生が許可されたときはミュートしない", async () => {
    window.__mcxTargetHref = VIDEO_HREF;
    const video = document.createElement("video");
    document.body.appendChild(video);

    await importAutoplay();
    await flushMicrotasks();

    expect(playMock).toHaveBeenCalledTimes(1);
    expect(video.muted).toBe(false);
  });

  it("再生ボタンだけがあるときはクリックし、後から動画が現れたら再生する", async () => {
    window.__mcxTargetHref = VIDEO_HREF;
    const { button, clickSpy } = createPlayButton();
    document.body.appendChild(button);

    await importAutoplay();
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(playMock).not.toHaveBeenCalled();

    document.body.appendChild(document.createElement("video"));
    await flushMicrotasks();

    expect(playMock).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("再生開始の操作が重なっても play もクリックも1回ずつしか行わない", async () => {
    window.__mcxTargetHref = VIDEO_HREF;
    // 再生確定前（pending）の状態を保つ
    playMock.mockImplementation(() => new Promise<void>(() => {}));
    const { button, clickSpy } = createPlayButton();
    document.body.appendChild(button);
    document.body.appendChild(document.createElement("video"));

    await importAutoplay();
    document.body.appendChild(document.createElement("div"));
    await flushMicrotasks();
    document.body.appendChild(document.createElement("div"));
    await flushMicrotasks();

    expect(playMock).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("動画がすでに再生中のときは再生操作を重ねない", async () => {
    window.__mcxTargetHref = VIDEO_HREF;
    const video = document.createElement("video");
    setPaused(video, false);
    document.body.appendChild(video);
    const { button, clickSpy } = createPlayButton();
    document.body.appendChild(button);

    await importAutoplay();
    await flushMicrotasks();

    expect(playMock).not.toHaveBeenCalled();
    expect(clickSpy).not.toHaveBeenCalled();

    // 再生中を確認した後は、動画が差し替わっても操作しない
    video.remove();
    document.body.appendChild(document.createElement("video"));
    await flushMicrotasks();
    expect(playMock).not.toHaveBeenCalled();
  });

  it("動画が深い階層に後から表示されても自動再生される", async () => {
    window.__mcxTargetHref = VIDEO_HREF;
    const container = document.createElement("div");
    document.body.appendChild(container);

    await importAutoplay();
    container.appendChild(document.createElement("video"));
    await flushMicrotasks();

    expect(playMock).toHaveBeenCalledTimes(1);
  });

  it("play が Promise を返さない環境でも例外を投げない", async () => {
    window.__mcxTargetHref = VIDEO_HREF;
    playMock.mockImplementation(() => undefined);
    document.body.appendChild(document.createElement("video"));

    await expect(importAutoplay()).resolves.toBeUndefined();
    expect(playMock).toHaveBeenCalledTimes(1);
  });

  it("play の戻り値が then を持たない場合も例外を投げない", async () => {
    window.__mcxTargetHref = VIDEO_HREF;
    playMock.mockImplementation(() => ({}));
    document.body.appendChild(document.createElement("video"));

    await expect(importAutoplay()).resolves.toBeUndefined();
    expect(playMock).toHaveBeenCalledTimes(1);
  });

  it("動画が後から再生中になったのを検知したら以降は操作しない", async () => {
    window.__mcxTargetHref = VIDEO_HREF;
    playMock.mockImplementation(() => new Promise<void>(() => {}));
    const video = document.createElement("video");
    document.body.appendChild(video);

    await importAutoplay();
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

  it("動画の拡大表示が現れないまま10秒経ったら自動再生の待機をやめる", async () => {
    window.__mcxTargetHref = VIDEO_HREF;

    await importAutoplay();
    vi.advanceTimersByTime(9999);
    document.body.appendChild(document.createElement("div"));
    await flushMicrotasks();
    expect(playMock).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    document.body.appendChild(document.createElement("video"));
    await flushMicrotasks();

    expect(playMock).not.toHaveBeenCalled();
  });

  it("自動再生は同じ画面で二重に起動しない", async () => {
    window.__mcxTargetHref = VIDEO_HREF;
    playMock.mockImplementation(() => new Promise<void>(() => {}));
    document.body.appendChild(document.createElement("video"));

    await importAutoplay();
    await importAutoplay();
    await flushMicrotasks();

    expect(playMock).toHaveBeenCalledTimes(1);
  });

  it("自動再生後にユーザーが一時停止した動画は再び自動再生されない", async () => {
    window.__mcxTargetHref = VIDEO_HREF;
    const video = document.createElement("video");
    document.body.appendChild(video);

    await importAutoplay();
    await flushMicrotasks();
    expect(playMock).toHaveBeenCalledTimes(1);

    // ユーザーが一時停止した後、動画が差し替わっても自動再生しない
    setPaused(video, true);
    video.dispatchEvent(new Event("pause"));
    video.remove();
    document.body.appendChild(document.createElement("video"));
    await flushMicrotasks();

    expect(playMock).toHaveBeenCalledTimes(1);
  });

  it("再生開始イベントを受けたら再生確認済みとして以降は反応しない", async () => {
    window.__mcxTargetHref = VIDEO_HREF;
    playMock.mockImplementation(() => new Promise<void>(() => {}));
    const video = document.createElement("video");
    document.body.appendChild(video);

    await importAutoplay();
    video.dispatchEvent(new Event("playing"));
    video.remove();
    document.body.appendChild(document.createElement("video"));
    await flushMicrotasks();

    expect(playMock).toHaveBeenCalledTimes(1);
  });
});

describe("inject/popup_video_autoplay の document 生成時の実行", () => {
  let playMock: ReturnType<typeof vi.fn>;

  async function importAutoplay(): Promise<void> {
    vi.resetModules();
    await import("./popup_video_autoplay");
  }

  beforeEach(() => {
    delete window.__mcxVideoAutoplayStarted;
    document.body.innerHTML = "";
    playMock = vi.fn(() => Promise.resolve());
    HTMLMediaElement.prototype.play =
      playMock as unknown as () => Promise<void>;
  });

  afterEach(() => {
    // インスタンスに上書きした getter を除去し、prototype 本来の getter に戻す
    removeOwnProperty("documentElement");
    removeOwnProperty("body");
    delete window.__mcxTargetHref;
    delete window.__mcxVideoAutoplayStarted;
    createdObservers.forEach((observer) => observer.disconnect());
    createdObservers.clear();
  });

  it("document.documentElement が null の状態で実行しても例外を投げない", async () => {
    window.__mcxTargetHref = VIDEO_HREF;
    Object.defineProperty(document, "documentElement", {
      get: () => null,
      configurable: true,
    });

    await expect(importAutoplay()).resolves.toBeUndefined();
  });

  it("document.body が null で読み込まれても body が現れてから自動再生が始まる", async () => {
    window.__mcxTargetHref = VIDEO_HREF;
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

describe("inject/popup_video_autoplay の自動再生挙動(共有ハブ経由)", () => {
  let playMock: ReturnType<typeof vi.fn>;

  async function importDomObserverAndAutoplay(): Promise<void> {
    vi.resetModules();
    delete (window as unknown as { __mcxDomObserver?: unknown })
      .__mcxDomObserver;
    await import("./dom_observer");
    await import("./popup_video_autoplay");
  }

  beforeEach(() => {
    delete window.__mcxVideoAutoplayStarted;
    document.body.innerHTML = "";
    playMock = vi.fn(() => Promise.resolve());
    // jsdom は play を実装しないため必須
    HTMLMediaElement.prototype.play =
      playMock as unknown as () => Promise<void>;
  });

  afterEach(() => {
    delete window.__mcxTargetHref;
    delete window.__mcxVideoAutoplayStarted;
    createdObservers.forEach((observer) => observer.disconnect());
    createdObservers.clear();
  });

  /** requestAnimationFrame の発火を待つ（共有ハブはrAFで1フレームにまとめて通知する）。 */
  function waitForAnimationFrame(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  it("共有ハブがあるときはハブで購読し、再生確認後に購読を解除する", async () => {
    window.__mcxTargetHref = VIDEO_HREF;
    const unsubscribe = vi.fn();
    let notify: () => void = () => {};
    const subscribe = vi.fn((callback: () => void) => {
      notify = callback;
      return unsubscribe;
    });
    window.__mcxDomObserver = { subscribe };
    vi.resetModules();
    await import("./popup_video_autoplay");

    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(createdObservers.size).toBe(0);
    expect(unsubscribe).not.toHaveBeenCalled();

    document.body.appendChild(document.createElement("video"));
    notify();
    await flushMicrotasks();

    expect(playMock).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalled();
    delete (window as unknown as { __mcxDomObserver?: unknown })
      .__mcxDomObserver;
  });

  it("共有ハブ経由でも、動画要素が後からDOMに追加されると自動再生される", async () => {
    window.__mcxTargetHref = VIDEO_HREF;

    await importDomObserverAndAutoplay();
    expect(playMock).not.toHaveBeenCalled();

    document.body.appendChild(document.createElement("video"));

    await waitForAnimationFrame();

    expect(playMock).toHaveBeenCalled();
  });
});
