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

describe("inject/popup_video_autoplay の shouldAutoplay", () => {
  it("video URL を含む場合は true を返す", () => {
    expect(shouldAutoplay("https://x.com/user/status/123/video/1")).toBe(true);
  });

  it("パスのみの video URL でも true を返す", () => {
    expect(shouldAutoplay("/user/status/123/video/1")).toBe(true);
  });

  it("photo URL の場合は false を返す", () => {
    expect(shouldAutoplay("https://x.com/user/status/123/photo/1")).toBe(false);
  });

  it("通常の status URL の場合は false を返す", () => {
    expect(shouldAutoplay("https://x.com/user/status/123")).toBe(false);
  });

  it("undefined の場合は false を返す", () => {
    expect(shouldAutoplay(undefined)).toBe(false);
  });

  it("空文字の場合は false を返す", () => {
    expect(shouldAutoplay("")).toBe(false);
  });
});

describe("inject/popup_video_autoplay の自動再生挙動", () => {
  let playMock: ReturnType<typeof vi.fn>;

  async function importAutoplay(): Promise<void> {
    vi.resetModules();
    await import("./popup_video_autoplay");
  }

  beforeEach(() => {
    document.documentElement.removeAttribute("data-mcx-video-autoplay");
    document.body.innerHTML = "";
    playMock = vi.fn(() => Promise.resolve());
    // jsdom は play を実装しないため必須
    HTMLMediaElement.prototype.play =
      playMock as unknown as () => Promise<void>;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete window.__mcxTargetHref;
  });

  it("video URL のとき DOM 内の video.play が呼ばれる", async () => {
    window.__mcxTargetHref = "https://x.com/user/status/123/video/1";
    const video = document.createElement("video");
    document.body.appendChild(video);

    await importAutoplay();
    await vi.runOnlyPendingTimersAsync();

    expect(playMock).toHaveBeenCalled();
  });

  it("video URL でないときは play が呼ばれない", async () => {
    window.__mcxTargetHref = "https://x.com/user/status/123/photo/1";
    const video = document.createElement("video");
    document.body.appendChild(video);

    await importAutoplay();
    await vi.runOnlyPendingTimersAsync();

    expect(playMock).not.toHaveBeenCalled();
  });

  it("音あり再生が reject された場合は muted にして再試行する", async () => {
    window.__mcxTargetHref = "https://x.com/user/status/123/video/1";
    let call = 0;
    playMock.mockImplementation(() => {
      call += 1;
      if (call === 1) {
        return Promise.reject(new Error("NotAllowedError"));
      }
      return Promise.resolve();
    });
    const video = document.createElement("video");
    document.body.appendChild(video);

    await importAutoplay();
    await vi.runOnlyPendingTimersAsync();
    // reject の解決を待つ
    await Promise.resolve();
    await Promise.resolve();

    expect(playMock).toHaveBeenCalledTimes(2);
    expect(video.muted).toBe(true);
  });
});

// このdescribe内はvi.useFakeTimersを使わない（jsdomのMutationObserverが内部で
// 使うマイクロタスクのスケジューリングが、fake timers環境ではそのままawait
// Promise.resolve()だけでは進まないため）。また dom_observer(共有ハブ)もimport
// しないため、popup_video_autoplay.ts側のsubscribeDomChangesはフォールバック
// （ローカルのMutationObserver）経路を使う。
describe("inject/popup_video_autoplay の自動再生挙動(共有ハブ非存在時のフォールバック)", () => {
  let playMock: ReturnType<typeof vi.fn>;

  async function importAutoplay(): Promise<void> {
    vi.resetModules();
    await import("./popup_video_autoplay");
  }

  beforeEach(() => {
    document.documentElement.removeAttribute("data-mcx-video-autoplay");
    document.body.innerHTML = "";
    playMock = vi.fn(() => Promise.resolve());
    // jsdom は play を実装しないため必須
    HTMLMediaElement.prototype.play =
      playMock as unknown as () => Promise<void>;
  });

  afterEach(() => {
    delete window.__mcxTargetHref;
  });

  it("video URL のとき、動画要素が後からDOMに追加されても自動再生される", async () => {
    window.__mcxTargetHref = "https://x.com/user/status/123/video/1";

    await importAutoplay();
    expect(playMock).not.toHaveBeenCalled();

    const video = document.createElement("video");
    document.body.appendChild(video);
    // フォールバック経路(ローカルMutationObserver)のコールバックはマイクロタスクで呼ばれる
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(playMock).toHaveBeenCalled();
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
    document.documentElement.removeAttribute("data-mcx-video-autoplay");
    document.body.innerHTML = "";
    playMock = vi.fn(() => Promise.resolve());
    // jsdom は play を実装しないため必須
    HTMLMediaElement.prototype.play =
      playMock as unknown as () => Promise<void>;
  });

  afterEach(() => {
    delete window.__mcxTargetHref;
    createdObservers.forEach((observer) => observer.disconnect());
    createdObservers.clear();
  });

  /** requestAnimationFrame の発火を待つ（共有ハブはrAFで1フレームにまとめて通知する）。 */
  function waitForAnimationFrame(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  it("共有ハブ経由でも、動画要素が後からDOMに追加されると自動再生される", async () => {
    window.__mcxTargetHref = "https://x.com/user/status/123/video/1";

    await importDomObserverAndAutoplay();
    expect(playMock).not.toHaveBeenCalled();

    const video = document.createElement("video");
    document.body.appendChild(video);

    await waitForAnimationFrame();

    expect(playMock).toHaveBeenCalled();
  });
});
