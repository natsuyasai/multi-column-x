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
  chooseLongPressDownloadTransport,
  isLongPressMediaPopupEnabled,
  chooseLongPressPopupTransport,
  formatLongPressDownloadText,
  shouldAutoDismissLongPressToast,
} from "./video_long_press_menu";
// 画面文言の共有ハブ（window.__mcxI18n）を読み込む（日本語固定の既定言語で従来の文言を検証する）
import "./i18n";

const postMessageMock = vi.fn();
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
    postMessageMock.mockClear();
    document
      .querySelectorAll('[data-testid="videoComponent"]')
      .forEach((el) => el.remove());
    getMenu()?.remove();
    window.__mcxVideoDownloadBridge = { postMessage: postMessageMock };
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

  it("variantsが取得できる場合、メニュー項目クリックで種類と内容を含むダウンロードメッセージがpostMessageで送られる", async () => {
    await importLongPressMenu();
    const videoEl = createVideoComponent();
    attachFiber(videoEl, PLAYER_PROPS);
    dispatchContextMenu(videoEl);

    clickMenuItem();

    expect(postMessageMock).toHaveBeenCalledTimes(1);
    const raw = postMessageMock.mock.calls[0]?.[0] as string;
    const message = JSON.parse(raw) as { type: string; payload: string };
    expect(message.type).toBe("downloadVideo");
    expect(JSON.parse(message.payload)).toEqual({
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

  it("variantsが取得できない場合（動画未再生等）はダウンロードメッセージを送らない", async () => {
    await importLongPressMenu();
    const videoEl = createVideoComponent();
    // fiber を付与しないため variants が取得できない

    dispatchContextMenu(videoEl);
    clickMenuItem();

    expect(postMessageMock).not.toHaveBeenCalled();
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
    window.__mcxVideoDownloadBridge = { postMessage: postMessageMock };
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

  it("ダウンロード項目クリックは引き続きダウンロードメッセージを送る（既存機能への影響なし）", async () => {
    await importLongPressMenu();
    const videoEl = createVideoComponent();
    attachFiber(videoEl, PLAYER_PROPS);
    dispatchContextMenu(videoEl);

    const menu = getMenu();
    if (!menu) throw new Error("menu not found");
    menu.children[0]?.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
    );

    expect(postMessageMock).toHaveBeenCalledTimes(1);
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
      url: "https://x.com/carol/status/555/video/2",
    });
  });
});

/** かな・カタカナ・漢字を1文字でも含むか（英語表示の検証用） */
function containsJapanese(text: string): boolean {
  return /[\u3040-\u30ff\u4e00-\u9fff]/.test(text);
}

describe("inject/video_long_press_menu の表示言語", () => {
  beforeEach(() => {
    postMessageMock.mockClear();
    document
      .querySelectorAll('[data-testid="videoComponent"]')
      .forEach((el) => el.remove());
    getMenu()?.remove();
    window.__mcxVideoDownloadBridge = { postMessage: postMessageMock };
    setConfig({ videoPopupEnabled: true });
  });

  afterEach(() => {
    delete window.__mcxVideoDownloadBridge;
    getMenu()?.remove();
    window.__mcxI18n?.setLang("ja");
  });

  function itemTexts(): string[] {
    const menu = getMenu();
    if (!menu) throw new Error("menu not found");
    return Array.from(menu.children).map((c) => c.textContent ?? "");
  }

  it("日本語のときメニュー項目は従来と同じ文言になる", async () => {
    await importLongPressMenu();
    const videoEl = createVideoComponent();
    attachFiber(videoEl, PLAYER_PROPS);

    dispatchContextMenu(videoEl);

    expect(itemTexts()).toEqual([
      "動画をダウンロード",
      "動画をポップアップで表示",
    ]);
  });

  it("表示言語が英語のときメニュー項目が英語になり日本語を含まない", async () => {
    window.__mcxI18n?.setLang("en");
    await importLongPressMenu();
    const videoEl = createVideoComponent();
    attachFiber(videoEl, PLAYER_PROPS);

    dispatchContextMenu(videoEl);

    const texts = itemTexts();
    expect(texts).toEqual(["Download video", "Show video in popup"]);
    expect(texts.some(containsJapanese)).toBe(false);
  });
});

describe("inject/video_long_press_menu のデスクトップ動画ダウンロード", () => {
  type DownloadProgressForTest = {
    fileIndex: number;
    fileCount: number;
    current: number;
    total: number | null;
    phase: "downloading" | "completed" | "failed";
  };

  const listenMock = vi.fn(
    (
      _event: string,
      _handler: (payload: {
        event: string;
        payload: DownloadProgressForTest;
      }) => void,
      _options?: { target?: string },
    ) => Promise.resolve<() => void>(() => undefined),
  );

  function getListenCall() {
    const call = listenMock.mock.calls.find(
      (c) => c[0] === "video-download-progress",
    );
    if (!call) throw new Error("listen not registered");
    return call;
  }

  function emitProgress(payload: Partial<DownloadProgressForTest>) {
    getListenCall()[1]({
      event: "video-download-progress",
      payload: {
        fileIndex: 1,
        fileCount: 1,
        current: 0,
        total: 100,
        phase: "downloading",
        ...payload,
      },
    });
  }

  function getToast(): HTMLElement | null {
    return document.getElementById("tv-video-download-toast");
  }

  async function setupAndClickDownload(props: unknown = PLAYER_PROPS) {
    await importLongPressMenu();
    const videoEl = createVideoComponent();
    attachFiber(videoEl, props);
    dispatchContextMenu(videoEl);
    // 過去の import で登録済みのリスナーも同じメニューを作るため、今回の import が作った最後のメニューを操作する
    const menus = document.querySelectorAll("#tv-video-long-press-menu");
    const item = menus[menus.length - 1]?.firstElementChild;
    if (!item) throw new Error("menu item not found");
    item.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
    );
  }

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = "";
    getMenu()?.remove();
    getToast()?.remove();
    invokeMock.mockReset();
    invokeMock.mockImplementation(() => Promise.resolve<unknown>(undefined));
    postMessageMock.mockClear();
    listenMock.mockClear();
    window.__TAURI__ = {
      core: { invoke: invokeMock },
      event: { listen: listenMock as unknown as TauriEvent["listen"] },
    };
    window.__TAURI_INTERNALS__ = {
      metadata: { currentWebview: { label: WEBVIEW_LABEL } },
    };
    delete window.__mcxVideoDownloadBridge;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    window.__TAURI__ = undefined;
    delete window.__TAURI_INTERNALS__;
    delete window.__mcxVideoDownloadBridge;
    getMenu()?.remove();
    getToast()?.remove();
  });

  it("デスクトップ（ブリッジ無し）でダウンロードを選ぶとdownload_videoがvariantsとツイートID由来のファイル名でinvokeされる", async () => {
    await setupAndClickDownload();

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("download_video", {
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
    expect(postMessageMock).not.toHaveBeenCalled();
  });

  it("Androidブリッジがあるときはブリッジへ依頼しdownload_videoはinvokeされない", async () => {
    window.__mcxVideoDownloadBridge = { postMessage: postMessageMock };

    await setupAndClickDownload();

    expect(postMessageMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("chooseLongPressDownloadTransportはブリッジ有りならbridge・無しでinvoke有りならinvoke・どちらも無ければnoneを返す", () => {
    expect(
      chooseLongPressDownloadTransport({ hasBridge: true, hasInvoke: true }),
    ).toBe("bridge");
    expect(
      chooseLongPressDownloadTransport({ hasBridge: true, hasInvoke: false }),
    ).toBe("bridge");
    expect(
      chooseLongPressDownloadTransport({ hasBridge: false, hasInvoke: true }),
    ).toBe("invoke");
    expect(
      chooseLongPressDownloadTransport({ hasBridge: false, hasInvoke: false }),
    ).toBe("none");
  });

  it("動画情報が取得できないときはdownload_videoをinvokeせずトーストも出さない", async () => {
    await setupAndClickDownload({ foo: "bar" });

    expect(invokeMock).not.toHaveBeenCalled();
    expect(getToast()).toBeNull();
  });

  it("invokeがrejectされたとき失敗のトーストを表示しconsole.errorに記録する", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    invokeMock.mockImplementation(() => Promise.reject(new Error("boom")));

    await setupAndClickDownload();
    await Promise.resolve();
    await Promise.resolve();

    expect(getToast()?.textContent).toBe("ダウンロード失敗");
    expect(errorSpy).toHaveBeenCalled();
  });

  it("invokeが同期的に例外を投げても失敗のトーストを表示し例外を漏らさない", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    invokeMock.mockImplementation(() => {
      throw new Error("sync boom");
    });

    await expect(setupAndClickDownload()).resolves.not.toThrow();

    expect(getToast()?.textContent).toBe("ダウンロード失敗");
    expect(errorSpy).toHaveBeenCalled();
  });

  it("失敗イベントを受信済みのときinvokeのrejectでトーストを上書きしない", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let rejectInvoke: (e: unknown) => void = () => {};
    invokeMock.mockImplementation(
      () =>
        new Promise<unknown>((_, reject) => {
          rejectInvoke = reject;
        }),
    );

    await setupAndClickDownload();
    emitProgress({ fileIndex: 2, fileCount: 2, phase: "failed" });
    expect(getToast()?.textContent).toBe("ダウンロード失敗 (2/2)");

    rejectInvoke(new Error("boom"));
    await Promise.resolve();
    await Promise.resolve();

    expect(getToast()?.textContent).toBe("ダウンロード失敗 (2/2)");
  });

  it("進捗イベントを受信すると進捗率付きのダウンロード中トーストが表示され自動では消えない", async () => {
    await importLongPressMenu();

    emitProgress({ current: 45, total: 100 });

    expect(getToast()?.textContent).toBe("ダウンロード中 45%");
    vi.advanceTimersByTime(60_000);
    expect(getToast()?.textContent).toBe("ダウンロード中 45%");
  });

  it("fileCountが2のときトーストにファイル番号(1/2)が併記される", async () => {
    await importLongPressMenu();

    emitProgress({ fileIndex: 1, fileCount: 2, current: 45, total: 100 });

    expect(getToast()?.textContent).toBe("ダウンロード中 (1/2) 45%");
  });

  it("formatLongPressDownloadTextは総量不明なら率を省略し総量0なら0%・完了と失敗でもファイル番号を併記する", () => {
    const t = (key: string, params?: Record<string, string | number>) =>
      window.__mcxI18n!.t(key, params);
    const base = { fileIndex: 1, fileCount: 1, current: 10, total: 100 };

    expect(
      formatLongPressDownloadText(
        { ...base, total: null, phase: "downloading" },
        t,
      ),
    ).toBe("ダウンロード中");
    expect(
      formatLongPressDownloadText(
        { ...base, total: 0, phase: "downloading" },
        t,
      ),
    ).toBe("ダウンロード中 0%");
    expect(
      formatLongPressDownloadText(
        { ...base, fileIndex: 2, fileCount: 2, phase: "completed" },
        t,
      ),
    ).toBe("ダウンロード完了 (2/2)");
    expect(
      formatLongPressDownloadText(
        { ...base, fileIndex: 1, fileCount: 2, phase: "failed" },
        t,
      ),
    ).toBe("ダウンロード失敗 (1/2)");
  });

  it("shouldAutoDismissLongPressToastはダウンロード中だけ消さず完了と失敗では消す", () => {
    expect(shouldAutoDismissLongPressToast("downloading")).toBe(false);
    expect(shouldAutoDismissLongPressToast("completed")).toBe(true);
    expect(shouldAutoDismissLongPressToast("failed")).toBe(true);
  });

  it("完了イベントを受信すると完了のトーストが表示され3秒後に消える", async () => {
    await importLongPressMenu();

    emitProgress({ current: 100, phase: "completed" });

    expect(getToast()?.textContent).toBe("ダウンロード完了");
    vi.advanceTimersByTime(2999);
    expect(getToast()).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(getToast()).toBeNull();
  });

  it("失敗イベントを受信すると失敗のトーストが表示され3秒後に消える", async () => {
    await importLongPressMenu();

    emitProgress({ phase: "failed" });

    expect(getToast()?.textContent).toBe("ダウンロード失敗");
    vi.advanceTimersByTime(2999);
    expect(getToast()).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(getToast()).toBeNull();
  });

  it("完了トースト表示中に次の進捗が届いたらタイマーを解除して進捗表示に切り替わり消えない", async () => {
    await importLongPressMenu();

    emitProgress({ fileIndex: 1, fileCount: 2, phase: "completed" });
    vi.advanceTimersByTime(2000);
    emitProgress({ fileIndex: 2, fileCount: 2, current: 30, total: 100 });
    vi.advanceTimersByTime(5000);

    expect(getToast()?.textContent).toBe("ダウンロード中 (2/2) 30%");
  });

  it("保存ダイアログをキャンセルしてinvokeが何も返さず終了してもトーストは表示されない", async () => {
    await setupAndClickDownload();
    await Promise.resolve();
    await Promise.resolve();

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(getToast()).toBeNull();
  });

  it("進捗の購読は自WebViewのラベル宛てに限定して登録される", async () => {
    await importLongPressMenu();

    expect(getListenCall()[2]).toEqual({ target: WEBVIEW_LABEL });
  });

  it("自WebViewのラベルが取れないときは進捗を購読せず例外にもならない", async () => {
    delete window.__TAURI_INTERNALS__;

    await expect(importLongPressMenu()).resolves.not.toThrow();

    expect(listenMock).not.toHaveBeenCalled();
  });

  it("トーストはpointer-events無効・fixed・最前面で表示されrole=statusを持つ", async () => {
    await importLongPressMenu();

    emitProgress({ current: 10 });

    const toast = getToast();
    expect(toast?.getAttribute("role")).toBe("status");
    expect(toast?.style.pointerEvents).toBe("none");
    expect(toast?.style.position).toBe("fixed");
    expect(toast?.style.zIndex).toBe("2147483647");
  });
});

describe("inject/video_long_press_menu の isLongPressMediaPopupEnabled", () => {
  const multi = { hasBridge: true, multiColumnActive: true };

  it("デスクトップでは動画ポップアップ設定がONなら有効になる", () => {
    expect(
      isLongPressMediaPopupEnabled("video", { videoPopupEnabled: true }, multi),
    ).toBe(true);
  });

  it("Androidではブリッジが無いか1列表示のときは設定がONでも無効になる", () => {
    const config = {
      videoPopupEnabled: true,
      mediaPopupRequiresMultiColumn: true,
    };
    expect(
      isLongPressMediaPopupEnabled("video", config, {
        hasBridge: false,
        multiColumnActive: true,
      }),
    ).toBe(false);
    expect(
      isLongPressMediaPopupEnabled("video", config, {
        hasBridge: true,
        multiColumnActive: false,
      }),
    ).toBe(false);
  });
});

describe("inject/video_long_press_menu の chooseLongPressPopupTransport", () => {
  it("Androidブリッジがあればブリッジ、無ければ invoke、どちらも無ければ none を選ぶ", () => {
    expect(
      chooseLongPressPopupTransport({ hasBridge: true, hasInvoke: true }),
    ).toBe("bridge");
    expect(
      chooseLongPressPopupTransport({ hasBridge: false, hasInvoke: true }),
    ).toBe("invoke");
    expect(
      chooseLongPressPopupTransport({ hasBridge: false, hasInvoke: false }),
    ).toBe("none");
  });
});

describe("inject/video_long_press_menu のAndroidでのポップアップメニュー項目", () => {
  const popupBridgeMock = vi.fn();

  function setAndroid(multiColumnActive: boolean | undefined): void {
    setConfig({
      videoPopupEnabled: true,
      imagePopupEnabled: true,
      mediaPopupRequiresMultiColumn: true,
    });
    window.__mcxMultiColumnActive = multiColumnActive;
  }

  function openMenu(): HTMLElement {
    const article = buildArticle("/carol/status/555");
    const videoEl = addTweetPhotoWithVideo(article);
    dispatchContextMenu(videoEl);
    return videoEl;
  }

  function selectPopupItem(): void {
    const item = getMenu()?.children[1];
    if (!item) throw new Error("popup menu item not found");
    item.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
    );
  }

  beforeEach(() => {
    document.body.innerHTML = "";
    getMenu()?.remove();
    popupBridgeMock.mockClear();
    invokeMock.mockClear();
    window.__TAURI__ = { core: { invoke: invokeMock } };
    window.__mcxVideoDownloadBridge = { postMessage: postMessageMock };
    window.__mcxMediaPopupBridge = { postMessage: popupBridgeMock };
  });

  afterEach(() => {
    delete window.__mcxMediaPopupBridge;
    delete window.__mcxVideoDownloadBridge;
    delete window.__mcxMultiColumnActive;
    delete window.__multiColumnXConfig;
    getMenu()?.remove();
  });

  it("複数カラム表示中は動画の長押しメニューに「動画をポップアップで表示」が表示される", async () => {
    setAndroid(true);
    await importLongPressMenu();
    openMenu();

    expect(getMenu()?.children.length).toBe(2);
    expect(getMenu()?.children[1]?.textContent).toBe(
      "動画をポップアップで表示",
    );
  });

  it("1列表示中は動画の長押しメニューに「動画をポップアップで表示」が表示されない", async () => {
    setAndroid(false);
    await importLongPressMenu();
    openMenu();

    expect(getMenu()?.children.length).toBe(1);
  });

  it("複数カラム表示フラグが未設定の間は「動画をポップアップで表示」が表示されない", async () => {
    setAndroid(undefined);
    await importLongPressMenu();
    openMenu();

    expect(getMenu()?.children.length).toBe(1);
  });

  it("ブリッジが無いAndroidでは複数カラム表示中でも「動画をポップアップで表示」が表示されない", async () => {
    setAndroid(true);
    delete window.__mcxMediaPopupBridge;
    await importLongPressMenu();
    openMenu();

    expect(getMenu()?.children.length).toBe(1);
  });

  it("メニューを開くたびに複数カラム表示フラグを評価する", async () => {
    setAndroid(false);
    await importLongPressMenu();
    const videoEl = openMenu();
    expect(getMenu()?.children.length).toBe(1);

    window.__mcxMultiColumnActive = true;
    dispatchContextMenu(videoEl);
    expect(getMenu()?.children.length).toBe(2);
  });

  it("長押しメニューの「動画をポップアップで表示」を選ぶとブリッジへポップアップを要求する", async () => {
    setAndroid(true);
    await importLongPressMenu();
    openMenu();

    selectPopupItem();

    expect(popupBridgeMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(popupBridgeMock.mock.calls[0][0] as string)).toEqual({
      type: "openMediaPopup",
      url: "https://x.com/carol/status/555/video/1",
    });
    expect(invokeMock).not.toHaveBeenCalled();
    expect(postMessageMock).not.toHaveBeenCalled();
  });

  it("デスクトップの長押し（右クリック）メニューは従来どおりtauri invokeでポップアップを開く", async () => {
    setConfig({ videoPopupEnabled: true });
    delete window.__mcxMediaPopupBridge;
    window.__mcxMultiColumnActive = false;
    await importLongPressMenu();
    openMenu();

    expect(getMenu()?.children.length).toBe(2);
    selectPopupItem();

    expect(invokeMock).toHaveBeenCalledWith("open_popup_window", {
      url: "https://x.com/carol/status/555/video/1",
    });
    expect(popupBridgeMock).not.toHaveBeenCalled();
  });
});
