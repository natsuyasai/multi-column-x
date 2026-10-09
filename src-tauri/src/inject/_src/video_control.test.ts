// video_control.ts は IIFE だが、mediaviewer 判定ロジックを純粋関数として
// named export しているため、それを直接検証する。
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isMediaViewerPath } from "./video_control";

// 上の静的 import でも IIFE が一度実行され、document.body を監視する MutationObserver が
// 残る。以降のテストで追加した動画に別インスタンスのリスナーが付かないよう、
// import 前に生成された observer を記録しておき、動的 import するテストの前に止める。
const staticImportObservers = vi.hoisted(() => {
  const observers: MutationObserver[] = [];
  const Original = globalThis.MutationObserver;
  globalThis.MutationObserver = class extends Original {
    constructor(callback: MutationCallback) {
      super(callback);
      observers.push(this);
    }
  };
  return { observers, Original };
});

describe("inject/video_control isMediaViewerPath", () => {
  it("mediaviewer で終わるパスは true", () => {
    expect(
      isMediaViewerPath("/ANIMA_info/status/2070703676067635303/mediaviewer"),
    ).toBe(true);
  });

  it("末尾スラッシュ付きの mediaviewer も true", () => {
    expect(
      isMediaViewerPath("/ANIMA_info/status/2070703676067635303/mediaviewer/"),
    ).toBe(true);
  });

  it("通常のタイムライン/ステータスのパスは false", () => {
    expect(isMediaViewerPath("/home")).toBe(false);
    expect(isMediaViewerPath("/ANIMA_info/status/2070703676067635303")).toBe(
      false,
    );
  });

  it("mediaviewer が末尾でない場合は false", () => {
    expect(isMediaViewerPath("/mediaviewer/something")).toBe(false);
  });

  it("mediaviewer を部分文字列として含むだけのパスは false", () => {
    expect(isMediaViewerPath("/foo/notmediaviewer")).toBe(false);
  });
});

// blockFirstAutoplay は IIFE 内のプライベート関数のため、import 時の副作用
// （document 内の video への挙動）を通じて検証する。popup_video_autoplay.test.ts と
// 同様、vi.resetModules() で毎回モジュールをリセットしてから動的 import する。
describe("inject/video_control 動画自動再生ブロック", () => {
  let playMock: ReturnType<typeof vi.fn>;
  let pauseMock: ReturnType<typeof vi.fn>;

  async function importVideoControl(): Promise<void> {
    vi.resetModules();
    await import("./video_control");
  }

  const methodNames = ["play", "pause"] as const;
  type SavedDescriptors = Record<
    (typeof methodNames)[number],
    PropertyDescriptor | undefined
  >;
  let savedMedia: SavedDescriptors;
  let savedVideo: SavedDescriptors;

  function saveDescriptors(proto: object): SavedDescriptors {
    return {
      play: Object.getOwnPropertyDescriptor(proto, "play"),
      pause: Object.getOwnPropertyDescriptor(proto, "pause"),
    };
  }

  function restoreDescriptors(proto: object, saved: SavedDescriptors): void {
    for (const name of methodNames) {
      const descriptor = saved[name];
      if (descriptor) {
        Object.defineProperty(proto, name, descriptor);
      } else {
        delete (proto as Record<string, unknown>)[name];
      }
    }
  }

  // import 毎に document.body を監視する MutationObserver が残り、以降のテストで追加した
  // 動画に古いモジュールのリスナーが付いてしまうため、生成した observer を記録して後始末する
  const createdObservers: MutationObserver[] = [];
  const OriginalMutationObserver = staticImportObservers.Original;

  beforeEach(() => {
    staticImportObservers.observers
      .splice(0)
      .forEach((observer) => observer.disconnect());
    globalThis.MutationObserver = class extends OriginalMutationObserver {
      constructor(callback: MutationCallback) {
        super(callback);
        createdObservers.push(this);
      }
    };
    document.body.innerHTML = "";
    playMock = vi.fn().mockResolvedValue(undefined);
    pauseMock = vi.fn();
    savedMedia = saveDescriptors(HTMLMediaElement.prototype);
    savedVideo = saveDescriptors(HTMLVideoElement.prototype);
    // 実装は HTMLMediaElement.prototype.play を差し替えるため、モックも同じ階層に置く。
    // HTMLVideoElement.prototype 側に own プロパティが残ると差し替えがバイパスされる。
    // jsdom は play/pause を実装しないため必須
    delete (HTMLVideoElement.prototype as unknown as Record<string, unknown>)
      .play;
    delete (HTMLVideoElement.prototype as unknown as Record<string, unknown>)
      .pause;
    HTMLMediaElement.prototype.play =
      playMock as unknown as () => Promise<void>;
    HTMLMediaElement.prototype.pause = pauseMock as unknown as () => void;
  });

  afterEach(() => {
    vi.useRealTimers();
    createdObservers.splice(0).forEach((observer) => observer.disconnect());
    globalThis.MutationObserver = OriginalMutationObserver;
    // import 毎に play が wrap されるため、元の記述子へ戻して多重に積まれないようにする
    restoreDescriptors(HTMLMediaElement.prototype, savedMedia);
    restoreDescriptors(HTMLVideoElement.prototype, savedVideo);
  });

  it("DOM追加直後は動画のplayがブロックされpauseが呼ばれること", async () => {
    const video = document.createElement("video");
    document.body.appendChild(video);

    await importVideoControl();
    pauseMock.mockClear();

    video.dispatchEvent(new Event("play"));

    expect(pauseMock).toHaveBeenCalled();
  });

  it("2秒以上経過してもクリック操作が無ければ引き続きブロックされること", async () => {
    vi.useFakeTimers();
    const video = document.createElement("video");
    document.body.appendChild(video);

    await importVideoControl();
    await vi.advanceTimersByTimeAsync(3000);
    pauseMock.mockClear();

    video.dispatchEvent(new Event("play"));

    expect(pauseMock).toHaveBeenCalled();
  });

  it("動画コンテナをクリックした後はplayがブロックされなくなること", async () => {
    const container = document.createElement("div");
    container.dataset.testid = "videoComponent";
    const video = document.createElement("video");
    container.appendChild(video);
    document.body.appendChild(container);

    await importVideoControl();
    pauseMock.mockClear();

    container.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    video.dispatchEvent(new Event("play"));

    expect(pauseMock).not.toHaveBeenCalled();
  });

  it("動画要素自体をクリックした場合もコンテナ内であれば解除されること", async () => {
    const container = document.createElement("div");
    container.dataset.testid = "videoComponent";
    const video = document.createElement("video");
    container.appendChild(video);
    document.body.appendChild(container);

    await importVideoControl();
    pauseMock.mockClear();

    video.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    video.dispatchEvent(new Event("play"));

    expect(pauseMock).not.toHaveBeenCalled();
  });

  it("動画コンテナ外をクリックしても解除されないこと", async () => {
    const outside = document.createElement("div");
    const container = document.createElement("div");
    container.dataset.testid = "videoComponent";
    const video = document.createElement("video");
    container.appendChild(video);
    document.body.appendChild(outside);
    document.body.appendChild(container);

    await importVideoControl();
    pauseMock.mockClear();

    outside.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    video.dispatchEvent(new Event("play"));

    expect(pauseMock).toHaveBeenCalled();
  });

  describe("play() の差し替え", () => {
    afterEach(() => {
      history.pushState({}, "", "/");
    });

    function createUnlockableVideo(): {
      container: HTMLElement;
      video: HTMLVideoElement;
    } {
      const container = document.createElement("div");
      container.dataset.testid = "videoComponent";
      const video = document.createElement("video");
      container.appendChild(video);
      document.body.appendChild(container);
      return { container, video };
    }

    it("最初のplay()は通り、playing直後に一度だけpauseされること", async () => {
      const video = document.createElement("video");
      document.body.appendChild(video);
      await importVideoControl();
      pauseMock.mockClear();

      void video.play();

      expect(playMock).toHaveBeenCalledTimes(1);
      expect(pauseMock).not.toHaveBeenCalled();

      video.dispatchEvent(new Event("playing"));
      expect(pauseMock).toHaveBeenCalledTimes(1);

      video.dispatchEvent(new Event("playing"));
      expect(pauseMock).toHaveBeenCalledTimes(1);
    });

    it("停止後のplay()は元のplayを呼ばず解決済みPromiseを返すこと", async () => {
      const video = document.createElement("video");
      document.body.appendChild(video);
      await importVideoControl();

      void video.play();
      video.dispatchEvent(new Event("playing"));
      pauseMock.mockClear();
      playMock.mockClear();

      const second = video.play();
      const third = video.play();

      expect(playMock).not.toHaveBeenCalled();
      await expect(second).resolves.toBeUndefined();
      await expect(third).resolves.toBeUndefined();

      // 握りつぶされた play() は pause も誘発しない（再試行ループにならない）
      expect(pauseMock).not.toHaveBeenCalled();
    });

    it("クリックでアンロックした動画のplay()は元のplayに通りplay後もpauseされないこと", async () => {
      const { container, video } = createUnlockableVideo();
      await importVideoControl();
      pauseMock.mockClear();

      container.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      void video.play();
      void video.play();
      void video.play();

      expect(playMock).toHaveBeenCalledTimes(3);

      video.dispatchEvent(new Event("play"));
      video.dispatchEvent(new Event("playing"));
      expect(pauseMock).not.toHaveBeenCalled();
    });

    it("アンロック済みの動画はpause後に再度play()しても再生されること", async () => {
      const { container, video } = createUnlockableVideo();
      await importVideoControl();

      container.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      void video.play();
      expect(playMock).toHaveBeenCalledTimes(1);

      video.pause();
      expect(pauseMock).toHaveBeenCalled();

      void video.play();
      expect(playMock).toHaveBeenCalledTimes(2);
    });

    it("mediaviewerではplay()が元のplayに通ること", async () => {
      history.pushState({}, "", "/u/status/1/mediaviewer");
      const video = document.createElement("video");
      document.body.appendChild(video);
      await importVideoControl();
      pauseMock.mockClear();

      void video.play();
      void video.play();
      void video.play();
      video.dispatchEvent(new Event("playing"));

      expect(playMock).toHaveBeenCalledTimes(3);
      expect(pauseMock).not.toHaveBeenCalled();
    });

    it("最初のplay()の通過中に届いたplayイベントではpauseされないこと", async () => {
      const video = document.createElement("video");
      const other = document.createElement("video");
      document.body.appendChild(video);
      document.body.appendChild(other);
      await importVideoControl();
      pauseMock.mockClear();

      void video.play();
      video.dispatchEvent(new Event("play"));
      expect(pauseMock).not.toHaveBeenCalled();

      video.dispatchEvent(new Event("playing"));
      expect(pauseMock).toHaveBeenCalledTimes(1);

      // play() を呼んでいない動画（autoplay 属性など）への保険は残る
      pauseMock.mockClear();
      other.dispatchEvent(new Event("play"));
      expect(pauseMock).toHaveBeenCalledTimes(1);
    });

    it("後から追加された動画も最初のplay()だけ通り以降は握りつぶされること", async () => {
      await importVideoControl();
      const video = document.createElement("video");
      document.body.appendChild(video);
      await new Promise((r) => setTimeout(r));
      pauseMock.mockClear();

      void video.play();
      expect(playMock).toHaveBeenCalledTimes(1);

      video.dispatchEvent(new Event("playing"));
      expect(pauseMock).toHaveBeenCalledTimes(1);

      void video.play();
      void video.play();
      expect(playMock).toHaveBeenCalledTimes(1);

      // 別の動画は独立して最初の1回が通る
      const another = document.createElement("video");
      document.body.appendChild(another);
      await new Promise((r) => setTimeout(r));

      void another.play();
      expect(playMock).toHaveBeenCalledTimes(2);
      void another.play();
      expect(playMock).toHaveBeenCalledTimes(2);
    });
  });
});
