// video_long_press_menu.ts は IIFE のため、import 時に contextmenu リスナーが
// document へ登録される。vi.resetModules で再 import してテストする。
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  findLongPressStatusPermalink,
  findLongPressQuotedTweetContainer,
  extractLongPressQuotedTweetId,
  findLongPressMediaIndex,
  buildLongPressVideoUrl,
  buildLongPressIStatusVideoUrl,
} from "./video_long_press_menu";

const downloadVideoMock = vi.fn();
const invokeMock = vi.fn((_cmd: string, _args?: Record<string, unknown>) =>
  Promise.resolve<unknown>(undefined),
);

const WEBVIEW_LABEL = "col-1";

async function importLongPressMenu(): Promise<void> {
  vi.resetModules();
  document.getElementById("tv-video-long-press-menu")?.remove();
  await import("./video_long_press_menu");
}

function setConfig(config: Partial<MultiColumnXConfig>): void {
  window.__multiColumnXConfig = config as MultiColumnXConfig;
}

/** time 子要素を持つ status リンクを内包する article を生成する。 */
function buildArticle(statusHref: string): HTMLElement {
  const article = document.createElement("article");
  const timeLink = document.createElement("a");
  timeLink.setAttribute("href", statusHref);
  timeLink.appendChild(document.createElement("time"));
  article.appendChild(timeLink);
  document.body.appendChild(article);
  return article;
}

/** article/container に tweetPhoto を追加し、動画要素を内包させる。 */
function addTweetPhotoWithVideo(container: HTMLElement): HTMLDivElement {
  const photo = document.createElement("div");
  photo.dataset.testid = "tweetPhoto";
  const videoEl = createVideoComponent();
  photo.appendChild(videoEl);
  container.appendChild(photo);
  return videoEl;
}

function addTweetPhoto(container: HTMLElement): HTMLDivElement {
  const photo = document.createElement("div");
  photo.dataset.testid = "tweetPhoto";
  container.appendChild(photo);
  return photo;
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
  el.appendChild(document.createElement("video"));
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

describe("inject/video_long_press_menu の純粋関数（ポップアップ用）", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  describe("findLongPressStatusPermalink", () => {
    it("time子要素を持つstatusリンクのhrefを返す", () => {
      const article = buildArticle("/alice/status/123");
      expect(findLongPressStatusPermalink(article)).toBe("/alice/status/123");
    });

    it("timeを持たないstatusリンクしかなければnullを返す", () => {
      const article = document.createElement("article");
      const link = document.createElement("a");
      link.setAttribute("href", "/alice/status/123");
      article.appendChild(link);
      expect(findLongPressStatusPermalink(article)).toBeNull();
    });
  });

  describe("findLongPressQuotedTweetContainer", () => {
    it("引用RTコンテナがあれば返す", () => {
      const container = document.createElement("div");
      container.setAttribute("role", "link");
      container.setAttribute("tabindex", "0");
      const child = document.createElement("div");
      container.appendChild(child);
      document.body.appendChild(container);

      expect(findLongPressQuotedTweetContainer(child)).toBe(container);
    });

    it("通常ツイートならnullを返す", () => {
      const el = document.createElement("div");
      document.body.appendChild(el);

      expect(findLongPressQuotedTweetContainer(el)).toBeNull();
    });
  });

  describe("extractLongPressQuotedTweetId", () => {
    it("React Fiberからtweet.id_strを取得できる", () => {
      const container = document.createElement("div");
      attachFiber(container, {
        tweet: { id_str: "2069216779545751868" },
      });

      expect(extractLongPressQuotedTweetId(container)).toBe(
        "2069216779545751868",
      );
    });

    it("取得できない場合はnullを返す", () => {
      const container = document.createElement("div");

      expect(extractLongPressQuotedTweetId(container)).toBeNull();
    });
  });

  describe("findLongPressMediaIndex", () => {
    it("複数tweetPhoto中の正しいインデックスを返す", () => {
      const article = buildArticle("/alice/status/123");
      addTweetPhoto(article);
      const videoEl = addTweetPhotoWithVideo(article);

      expect(findLongPressMediaIndex(videoEl)).toBe(2);
    });

    it("見つからない場合は1を返す", () => {
      const orphan = document.createElement("div");
      document.body.appendChild(orphan);

      expect(findLongPressMediaIndex(orphan)).toBe(1);
    });
  });

  describe("buildLongPressVideoUrl", () => {
    it("相対permalinkから/video/<index>の絶対URLを組み立てる", () => {
      expect(buildLongPressVideoUrl("/alice/status/123", 1)).toBe(
        "https://x.com/alice/status/123/video/1",
      );
    });

    it("末尾に余分なセグメントがあってもstatus idまでを使う", () => {
      expect(buildLongPressVideoUrl("/alice/status/123/photo/1", 2)).toBe(
        "https://x.com/alice/status/123/video/2",
      );
    });
  });

  describe("buildLongPressIStatusVideoUrl", () => {
    it("status idから/i/status/<id>/video/<index>の絶対URLを組み立てる", () => {
      expect(buildLongPressIStatusVideoUrl("2069216779545751868", 1)).toBe(
        "https://x.com/i/status/2069216779545751868/video/1",
      );
    });
  });
});

describe("inject/video_long_press_menu のポップアップメニュー項目", () => {
  function clickSecondMenuItem(): void {
    const menu = getMenu();
    if (!menu) throw new Error("menu not found");
    const item = menu.children[1];
    if (!item) throw new Error("popup menu item not found");
    item.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
    );
  }

  beforeEach(() => {
    document.body.innerHTML = "";
    getMenu()?.remove();
    invokeMock.mockClear();
    window.__TAURI__ = { core: { invoke: invokeMock } };
    window.__TAURI_INTERNALS__ = {
      metadata: { currentWebview: { label: WEBVIEW_LABEL } },
    };
    window.__mcxVideoDownloadBridge = { downloadVideo: downloadVideoMock };
    setConfig({ videoPopupEnabled: true });
  });

  afterEach(() => {
    delete window.__TAURI_INTERNALS__;
    delete window.__mcxVideoDownloadBridge;
    delete window.__multiColumnXConfig;
    getMenu()?.remove();
  });

  it("通常動画ではarticleのpermalinkから/video/<idx>のopen_popup_windowを呼ぶ", async () => {
    await importLongPressMenu();
    const article = buildArticle("/carol/status/555");
    addTweetPhoto(article);
    const videoEl = addTweetPhotoWithVideo(article);
    dispatchContextMenu(videoEl);

    clickSecondMenuItem();

    expect(invokeMock).toHaveBeenCalledWith("open_popup_window", {
      webviewLabelCaller: WEBVIEW_LABEL,
      url: "https://x.com/carol/status/555/video/2",
    });
  });

  it("引用RT内の動画はfiberのtweet.id_strから/i/status/<id>/video/1を開く", async () => {
    await importLongPressMenu();
    const article = buildArticle("/sankims/status/2070347996856996068");
    const quoted = document.createElement("div");
    quoted.setAttribute("role", "link");
    quoted.setAttribute("tabindex", "0");
    attachFiber(quoted, { tweet: { id_str: "2069216779545751868" } });
    article.appendChild(quoted);
    const videoEl = addTweetPhotoWithVideo(quoted);
    dispatchContextMenu(videoEl);

    clickSecondMenuItem();

    expect(invokeMock).toHaveBeenCalledWith("open_popup_window", {
      webviewLabelCaller: WEBVIEW_LABEL,
      url: "https://x.com/i/status/2069216779545751868/video/1",
    });
  });

  it("videoPopupEnabled=falseの場合はメニュー項目が追加されない", async () => {
    setConfig({ videoPopupEnabled: false });
    await importLongPressMenu();
    const article = buildArticle("/carol/status/555");
    const videoEl = addTweetPhotoWithVideo(article);
    dispatchContextMenu(videoEl);

    expect(getMenu()?.children.length).toBe(1);
  });

  it("videoPopupEnabledがundefinedのときは既定で有効扱いとなりメニュー項目が追加される", async () => {
    setConfig({});
    await importLongPressMenu();
    const article = buildArticle("/carol/status/555");
    const videoEl = addTweetPhotoWithVideo(article);
    dispatchContextMenu(videoEl);

    expect(getMenu()?.children.length).toBe(2);
  });

  it("permalinkが見つからない場合はinvokeを呼ばない", async () => {
    await importLongPressMenu();
    const orphanArticle = document.createElement("article");
    document.body.appendChild(orphanArticle);
    const videoEl = addTweetPhotoWithVideo(orphanArticle);
    dispatchContextMenu(videoEl);

    clickSecondMenuItem();

    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("ダウンロード項目クリックは引き続きdownloadVideoを呼ぶ（既存機能への影響なし）", async () => {
    await importLongPressMenu();
    const videoEl = createVideoComponent();
    attachFiber(videoEl, PLAYER_PROPS);
    dispatchContextMenu(videoEl);

    const menu = getMenu();
    if (!menu) throw new Error("menu not found");
    menu.children[0]?.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
    );

    expect(downloadVideoMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("ポップアップ表示項目クリックで対象のvideo要素がpauseされる", async () => {
    await importLongPressMenu();
    const article = buildArticle("/carol/status/555");
    addTweetPhoto(article);
    const videoEl = addTweetPhotoWithVideo(article);
    const videoTag = videoEl.querySelector("video");
    if (!videoTag) throw new Error("video tag not found");
    const pauseSpy = vi
      .spyOn(HTMLVideoElement.prototype, "pause")
      .mockImplementation(() => {});
    dispatchContextMenu(videoEl);

    clickSecondMenuItem();

    expect(pauseSpy).toHaveBeenCalledTimes(1);
    pauseSpy.mockRestore();
  });

  it("video要素が存在しない場合でもエラーにならずポップアップ表示できる", async () => {
    await importLongPressMenu();
    const article = buildArticle("/carol/status/555");
    addTweetPhoto(article);
    const photo = document.createElement("div");
    photo.dataset.testid = "tweetPhoto";
    article.appendChild(photo);
    const videoEl = document.createElement("div");
    videoEl.dataset.testid = "videoComponent";
    photo.appendChild(videoEl);
    dispatchContextMenu(videoEl);

    expect(() => clickSecondMenuItem()).not.toThrow();
    expect(invokeMock).toHaveBeenCalledWith("open_popup_window", {
      webviewLabelCaller: WEBVIEW_LABEL,
      url: "https://x.com/carol/status/555/video/2",
    });
  });
});
