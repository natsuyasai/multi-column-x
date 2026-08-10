// video_control.ts は IIFE だが、mediaviewer 判定ロジックを純粋関数として
// named export しているため、それを直接検証する。
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isMediaViewerPath } from "./video_control";

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

  beforeEach(() => {
    document.body.innerHTML = "";
    playMock = vi.fn().mockResolvedValue(undefined);
    pauseMock = vi.fn();
    // jsdom は play/pause を実装しないため必須
    HTMLVideoElement.prototype.play =
      playMock as unknown as () => Promise<void>;
    HTMLVideoElement.prototype.pause = pauseMock as unknown as () => void;
  });

  afterEach(() => {
    vi.useRealTimers();
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
});
