// video_long_press_menu.ts は IIFE のため、import 時に contextmenu リスナーが
// document へ登録される。vi.resetModules で再 import してテストする。
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const downloadVideoMock = vi.fn();

async function importLongPressMenu(): Promise<void> {
  vi.resetModules();
  document.getElementById("tv-video-long-press-menu")?.remove();
  await import("./video_long_press_menu");
}

/** 要素に疑似 React fiber（__reactFiber$test）を直接セットする。 */
function attachFiber(el: Element, memoizedProps: unknown): void {
  (el as unknown as Record<string, unknown>)["__reactFiber$test"] = {
    memoizedProps,
    return: null,
  };
}

const PLAYER_PROPS = {
  videoId: { type: "tweet", id: "2083360318248378472", index: 0 },
  variants: [
    {
      type: "application/x-mpegURL",
      src: "https://video.twimg.com/amplify_video/1/pl/xxx.m3u8",
    },
    {
      bitrate: 632000,
      type: "video/mp4",
      src: "https://video.twimg.com/amplify_video/1/vid/avc1/320x568/xxx.mp4",
    },
  ],
};

function createVideoComponent(): HTMLDivElement {
  const el = document.createElement("div");
  el.dataset.testid = "videoComponent";
  document.body.appendChild(el);
  return el;
}

function dispatchContextMenu(
  target: Element,
  coords: { clientX?: number; clientY?: number } = {},
): MouseEvent {
  const event = new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    clientX: coords.clientX ?? 100,
    clientY: coords.clientY ?? 100,
  });
  target.dispatchEvent(event);
  return event;
}

function getMenu(): HTMLDivElement | null {
  return document.querySelector<HTMLDivElement>("#tv-video-long-press-menu");
}

function clickMenuItem(): void {
  const menu = getMenu();
  if (!menu) throw new Error("menu not found");
  const item = menu.firstElementChild;
  if (!item) throw new Error("menu item not found");
  item.dispatchEvent(
    new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
  );
}

describe("inject/video_long_press_menu の長押しメニュー", () => {
  beforeEach(() => {
    downloadVideoMock.mockClear();
    document
      .querySelectorAll('[data-testid="videoComponent"]')
      .forEach((el) => el.remove());
    getMenu()?.remove();
    window.__mcxVideoDownloadBridge = { downloadVideo: downloadVideoMock };
  });

  afterEach(() => {
    delete window.__mcxVideoDownloadBridge;
    getMenu()?.remove();
  });

  it("動画要素上でcontextmenuが発火した場合、メニューがDOMに追加されデフォルト動作が抑止される", async () => {
    await importLongPressMenu();
    const videoEl = createVideoComponent();
    attachFiber(videoEl, PLAYER_PROPS);

    const event = dispatchContextMenu(videoEl);

    expect(getMenu()).not.toBeNull();
    expect(event.defaultPrevented).toBe(true);
  });

  it("動画要素以外の場所でcontextmenuが発火した場合、メニューが表示されずデフォルト動作に委ねられる", async () => {
    await importLongPressMenu();
    const other = document.createElement("div");
    document.body.appendChild(other);

    const event = dispatchContextMenu(other);

    expect(getMenu()).toBeNull();
    expect(event.defaultPrevented).toBe(false);
  });

  it("variantsが取得できる場合、メニュー項目クリックでdownloadVideoが正しいJSON文字列で呼ばれる", async () => {
    await importLongPressMenu();
    const videoEl = createVideoComponent();
    attachFiber(videoEl, PLAYER_PROPS);
    dispatchContextMenu(videoEl);

    clickMenuItem();

    expect(downloadVideoMock).toHaveBeenCalledTimes(1);
    const payloadJson = downloadVideoMock.mock.calls[0]?.[0] as string;
    expect(JSON.parse(payloadJson)).toEqual({
      variants: [
        {
          contentType: "application/x-mpegURL",
          url: "https://video.twimg.com/amplify_video/1/pl/xxx.m3u8",
        },
        {
          contentType: "video/mp4",
          bitrate: 632000,
          url: "https://video.twimg.com/amplify_video/1/vid/avc1/320x568/xxx.mp4",
        },
      ],
      suggestedFileName: "2083360318248378472",
    });
  });

  it("variantsが取得できない場合（動画未再生等）はdownloadVideoを呼ばない", async () => {
    await importLongPressMenu();
    const videoEl = createVideoComponent();
    // fiber を付与しないため variants が取得できない

    dispatchContextMenu(videoEl);
    clickMenuItem();

    expect(downloadVideoMock).not.toHaveBeenCalled();
  });

  it("window.__mcxVideoDownloadBridgeが存在しない場合でもエラーにならない", async () => {
    delete window.__mcxVideoDownloadBridge;
    await importLongPressMenu();
    const videoEl = createVideoComponent();
    attachFiber(videoEl, PLAYER_PROPS);
    dispatchContextMenu(videoEl);

    expect(() => clickMenuItem()).not.toThrow();
  });

  it("メニュー外クリックでメニューが閉じる", async () => {
    await importLongPressMenu();
    const videoEl = createVideoComponent();
    attachFiber(videoEl, PLAYER_PROPS);
    dispatchContextMenu(videoEl);
    expect(getMenu()).not.toBeNull();

    document.body.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );

    expect(getMenu()).toBeNull();
  });

  it("再度のcontextmenu（動画要素以外）でメニューが閉じる", async () => {
    await importLongPressMenu();
    const videoEl = createVideoComponent();
    attachFiber(videoEl, PLAYER_PROPS);
    dispatchContextMenu(videoEl);
    expect(getMenu()).not.toBeNull();

    const other = document.createElement("div");
    document.body.appendChild(other);
    dispatchContextMenu(other);

    expect(getMenu()).toBeNull();
  });
});
