// popup_toolbar.ts は IIFE のため、import 時にツールバーが DOM へ注入される。
// vi.resetModules で再 import し、Android ブリッジ有無それぞれの転送先を検証する。
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { formatVideoDownloadProgressText } from "./popup_toolbar";

const tauriInvokeMock = vi.fn((_cmd: string, _args?: Record<string, unknown>) =>
  Promise.resolve<unknown>(undefined),
);

const switchPopupSessionMock = vi.fn();

type VideoDownloadProgressPayload = {
  fileIndex: number;
  fileCount: number;
  current: number;
  total: number | null;
  phase: "downloading" | "completed" | "failed";
};

const tauriListenMock = vi.fn(
  (
    _event: string,
    _handler: (
      payload: TauriEventPayload<VideoDownloadProgressPayload>,
    ) => void,
  ) => Promise.resolve<() => void>(() => undefined),
);

const accounts: TvAccountInfo[] = [
  { id: "acc1", label: "アカウント1", color: "#fff", dataDirectory: "dir1" },
  { id: "acc2", label: "アカウント2", color: "#000", dataDirectory: "dir2" },
];

async function importToolbar(): Promise<void> {
  vi.resetModules();
  document.getElementById("tv-popup-toolbar")?.remove();
  await import("./popup_toolbar");
}

function selectAccount(accountId: string): void {
  const select = document.querySelector<HTMLSelectElement>(
    "#tv-popup-toolbar select",
  );
  if (!select) throw new Error("toolbar select not found");
  select.value = accountId;
  select.dispatchEvent(new Event("change"));
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

function clickDownloadButton(): void {
  const button = document.querySelector<HTMLButtonElement>(
    "#tv-popup-download-button",
  );
  if (!button) throw new Error("download button not found");
  button.click();
}

describe("inject/popup_toolbar のアカウント切替", () => {
  beforeEach(() => {
    tauriInvokeMock.mockClear();
    switchPopupSessionMock.mockClear();
    window.__TAURI__ = { core: { invoke: tauriInvokeMock } };
    window.__mcxAccounts = accounts;
    window.__mcxCurrentAccountId = "acc1";
    window.__mcxTargetHref = "";
    window.__mcxEscCloseEnabled = false;
    delete window.__mcxPopupBridge;
  });

  it("Androidブリッジがある場合はswitchPopupSessionへ転送しTauri invokeは呼ばない", async () => {
    window.__mcxPopupBridge = { switchPopupSession: switchPopupSessionMock };
    await importToolbar();

    selectAccount("acc2");

    expect(switchPopupSessionMock).toHaveBeenCalledWith(
      "acc2",
      window.location.href,
    );
    expect(tauriInvokeMock).not.toHaveBeenCalled();
  });

  it("Androidブリッジがない場合はswitch_popup_sessionコマンドにフォールバックする", async () => {
    await importToolbar();

    selectAccount("acc2");

    expect(tauriInvokeMock).toHaveBeenCalledWith("switch_popup_session", {
      popupLabel: "",
      accountId: "acc2",
      dataDirectory: "dir2",
      url: window.location.href,
    });
  });

  it("存在しないアカウントIDの場合はどこへも転送しない", async () => {
    window.__mcxPopupBridge = { switchPopupSession: switchPopupSessionMock };
    await importToolbar();

    const select = document.querySelector<HTMLSelectElement>(
      "#tv-popup-toolbar select",
    );
    if (!select) throw new Error("toolbar select not found");
    const ghost = document.createElement("option");
    ghost.value = "ghost";
    select.appendChild(ghost);

    selectAccount("ghost");

    expect(switchPopupSessionMock).not.toHaveBeenCalled();
    expect(tauriInvokeMock).not.toHaveBeenCalled();
  });
});

describe("inject/popup_toolbar の動画ダウンロードボタン", () => {
  beforeEach(() => {
    tauriInvokeMock.mockClear();
    window.__TAURI__ = { core: { invoke: tauriInvokeMock } };
    window.__mcxAccounts = accounts;
    window.__mcxCurrentAccountId = "acc1";
    window.__mcxTargetHref = "";
    window.__mcxEscCloseEnabled = false;
    delete window.__mcxPopupBridge;
    document
      .querySelectorAll('[data-testid="videoComponent"]')
      .forEach((el) => el.remove());
  });

  it("ツールバーにDLボタンが追加される", async () => {
    await importToolbar();

    const button = document.querySelector<HTMLButtonElement>(
      "#tv-popup-download-button",
    );

    expect(button).not.toBeNull();
    expect(button?.textContent).toBe("動画をダウンロード");
  });

  it("variantsが取得できる場合、クリックでdownload_videoがinvokeされる", async () => {
    const videoComponent = document.createElement("div");
    videoComponent.dataset.testid = "videoComponent";
    document.body.appendChild(videoComponent);
    attachFiber(videoComponent, PLAYER_PROPS);

    await importToolbar();
    clickDownloadButton();

    expect(tauriInvokeMock).toHaveBeenCalledWith("download_video", {
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

  it("variantsが取得できない場合（動画未再生等）はdownload_videoをinvokeしない", async () => {
    await importToolbar();

    clickDownloadButton();

    expect(tauriInvokeMock).not.toHaveBeenCalled();
  });

  it("variantsが取得できない場合、フィードバックメッセージを表示する", async () => {
    await importToolbar();

    clickDownloadButton();

    const status = document.querySelector<HTMLSpanElement>(
      "#tv-popup-download-status",
    );
    expect(status?.textContent).toBe(
      "動画を再生してからダウンロードしてください",
    );
  });

  it("variantsが取得できる場合、クリック直後にボタンがdisabledになる", async () => {
    const videoComponent = document.createElement("div");
    videoComponent.dataset.testid = "videoComponent";
    document.body.appendChild(videoComponent);
    attachFiber(videoComponent, PLAYER_PROPS);

    await importToolbar();
    const button = document.querySelector<HTMLButtonElement>(
      "#tv-popup-download-button",
    );
    if (!button) throw new Error("download button not found");

    clickDownloadButton();

    expect(button.disabled).toBe(true);
  });

  it("download_videoのinvokeが成功した場合、ボタンが再度disabled=falseになる", async () => {
    const videoComponent = document.createElement("div");
    videoComponent.dataset.testid = "videoComponent";
    document.body.appendChild(videoComponent);
    attachFiber(videoComponent, PLAYER_PROPS);

    await importToolbar();
    const button = document.querySelector<HTMLButtonElement>(
      "#tv-popup-download-button",
    );
    if (!button) throw new Error("download button not found");

    clickDownloadButton();
    expect(button.disabled).toBe(true);

    // invoke().catch().finally() のマイクロタスクをflushする
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(button.disabled).toBe(false);
  });

  it("download_videoのinvokeが失敗した場合でも、ボタンが再度disabled=falseになる", async () => {
    const videoComponent = document.createElement("div");
    videoComponent.dataset.testid = "videoComponent";
    document.body.appendChild(videoComponent);
    attachFiber(videoComponent, PLAYER_PROPS);
    tauriInvokeMock.mockRejectedValueOnce(new Error("dialog closed"));

    await importToolbar();
    const button = document.querySelector<HTMLButtonElement>(
      "#tv-popup-download-button",
    );
    if (!button) throw new Error("download button not found");

    clickDownloadButton();
    expect(button.disabled).toBe(true);

    // invoke().catch().finally() のマイクロタスクをflushする
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(button.disabled).toBe(false);
  });

  it("variantsが取得できない場合、ボタンはdisabledにならない", async () => {
    await importToolbar();
    const button = document.querySelector<HTMLButtonElement>(
      "#tv-popup-download-button",
    );
    if (!button) throw new Error("download button not found");

    clickDownloadButton();

    expect(button.disabled).toBe(false);
    expect(tauriInvokeMock).not.toHaveBeenCalled();
  });

  it("連続クリックしても1回目のinvoke呼び出し中は2回目が受け付けられない", async () => {
    const videoComponent = document.createElement("div");
    videoComponent.dataset.testid = "videoComponent";
    document.body.appendChild(videoComponent);
    attachFiber(videoComponent, PLAYER_PROPS);

    await importToolbar();
    const button = document.querySelector<HTMLButtonElement>(
      "#tv-popup-download-button",
    );
    if (!button) throw new Error("download button not found");

    // 1回目のクリック（disabledになりinvokeが呼ばれる）
    clickDownloadButton();
    // 2回目のクリック（disabled状態のためブラウザ標準の挙動でイベントが発火しない）
    clickDownloadButton();

    expect(tauriInvokeMock).toHaveBeenCalledTimes(1);
  });
});

describe("inject/popup_toolbar の動画ダウンロードボタンの表示切替", () => {
  beforeEach(() => {
    tauriInvokeMock.mockClear();
    window.__TAURI__ = { core: { invoke: tauriInvokeMock } };
    window.__mcxAccounts = accounts;
    window.__mcxCurrentAccountId = "acc1";
    window.__mcxTargetHref = "";
    window.__mcxEscCloseEnabled = false;
    delete window.__mcxPopupBridge;
    document
      .querySelectorAll('[data-testid="videoComponent"]')
      .forEach((el) => el.remove());
  });

  function getDownloadButton(): HTMLButtonElement {
    const button = document.querySelector<HTMLButtonElement>(
      "#tv-popup-download-button",
    );
    if (!button) throw new Error("download button not found");
    return button;
  }

  /** MutationObserver のコールバック（マイクロタスク）実行を待つ。 */
  async function flushMutationObserver(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  }

  it("動画コンポーネントが存在しない状態でツールバーを注入すると初期状態でダウンロードボタンが非表示になる", async () => {
    await importToolbar();

    expect(getDownloadButton().style.display).toBe("none");
  });

  it("動画コンポーネントが存在する状態でツールバーを注入すると初期状態でダウンロードボタンが表示される", async () => {
    const videoComponent = document.createElement("div");
    videoComponent.dataset.testid = "videoComponent";
    document.body.appendChild(videoComponent);
    attachFiber(videoComponent, PLAYER_PROPS);

    await importToolbar();

    expect(getDownloadButton().style.display).not.toBe("none");
  });

  it("初期表示時は非表示だったが、後から動画コンポーネントをDOMに動的追加するとボタンが表示に切り替わる", async () => {
    await importToolbar();
    expect(getDownloadButton().style.display).toBe("none");

    const videoComponent = document.createElement("div");
    videoComponent.dataset.testid = "videoComponent";
    document.body.appendChild(videoComponent);
    attachFiber(videoComponent, PLAYER_PROPS);

    await flushMutationObserver();

    expect(getDownloadButton().style.display).not.toBe("none");
  });

  it("表示されていた動画コンポーネント要素をDOMから削除するとボタンが非表示に戻る", async () => {
    const videoComponent = document.createElement("div");
    videoComponent.dataset.testid = "videoComponent";
    document.body.appendChild(videoComponent);
    attachFiber(videoComponent, PLAYER_PROPS);

    await importToolbar();
    expect(getDownloadButton().style.display).not.toBe("none");

    videoComponent.remove();

    await flushMutationObserver();

    expect(getDownloadButton().style.display).toBe("none");
  });
});

describe("formatVideoDownloadProgressText", () => {
  it("downloadingかつtotalありの場合パーセンテージを表示する", () => {
    expect(
      formatVideoDownloadProgressText({
        fileIndex: 1,
        fileCount: 1,
        current: 45,
        total: 100,
        phase: "downloading",
      }),
    ).toBe("ダウンロード中 45%");
  });

  it("downloadingかつtotalなしの場合パーセンテージを省略する", () => {
    expect(
      formatVideoDownloadProgressText({
        fileIndex: 1,
        fileCount: 1,
        current: 45,
        total: null,
        phase: "downloading",
      }),
    ).toBe("ダウンロード中");
  });

  it("completedの場合完了メッセージを表示する", () => {
    expect(
      formatVideoDownloadProgressText({
        fileIndex: 1,
        fileCount: 1,
        current: 100,
        total: 100,
        phase: "completed",
      }),
    ).toBe("ダウンロード完了");
  });

  it("failedの場合失敗メッセージを表示する", () => {
    expect(
      formatVideoDownloadProgressText({
        fileIndex: 1,
        fileCount: 1,
        current: 10,
        total: 100,
        phase: "failed",
      }),
    ).toBe("ダウンロード失敗");
  });

  it("fileCountが1より大きい場合ファイル番号ラベルを併記する", () => {
    expect(
      formatVideoDownloadProgressText({
        fileIndex: 1,
        fileCount: 2,
        current: 50,
        total: 100,
        phase: "downloading",
      }),
    ).toBe("ダウンロード中 (1/2) 50%");
  });

  it("fileCountが1の場合ファイル番号ラベルを付けない", () => {
    expect(
      formatVideoDownloadProgressText({
        fileIndex: 1,
        fileCount: 1,
        current: 50,
        total: 100,
        phase: "downloading",
      }),
    ).toBe("ダウンロード中 50%");
  });

  it("totalが0の場合ゼロ除算せず0%として扱う", () => {
    expect(
      formatVideoDownloadProgressText({
        fileIndex: 1,
        fileCount: 1,
        current: 0,
        total: 0,
        phase: "downloading",
      }),
    ).toBe("ダウンロード中 0%");
  });

  it("completedかつfileCountが2の場合ファイル番号ラベルを併記する", () => {
    expect(
      formatVideoDownloadProgressText({
        fileIndex: 2,
        fileCount: 2,
        current: 30,
        total: 30,
        phase: "completed",
      }),
    ).toBe("ダウンロード完了 (2/2)");
  });
});

describe("inject/popup_toolbar の動画ダウンロード進捗イベント受信", () => {
  function getListenHandler(): (
    payload: TauriEventPayload<VideoDownloadProgressPayload>,
  ) => void {
    const call = tauriListenMock.mock.calls.find(
      (c) => c[0] === "video-download-progress",
    );
    if (!call) {
      throw new Error("listen not registered for video-download-progress");
    }
    return call[1];
  }

  function getStatus(): HTMLSpanElement {
    const status = document.querySelector<HTMLSpanElement>(
      "#tv-popup-download-status",
    );
    if (!status) throw new Error("status element not found");
    return status;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    tauriInvokeMock.mockClear();
    tauriListenMock.mockClear();
    window.__TAURI__ = {
      core: { invoke: tauriInvokeMock },
      event: { listen: tauriListenMock },
    };
    window.__mcxAccounts = accounts;
    window.__mcxCurrentAccountId = "acc1";
    window.__mcxTargetHref = "";
    window.__mcxEscCloseEnabled = false;
    delete window.__mcxPopupBridge;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("進捗イベントを受信するとdownloadStatusのテキストが更新される", async () => {
    await importToolbar();
    const handler = getListenHandler();

    handler({
      event: "video-download-progress",
      payload: {
        fileIndex: 1,
        fileCount: 1,
        current: 50,
        total: 100,
        phase: "downloading",
      },
    });

    expect(getStatus().textContent).toBe("ダウンロード中 50%");
  });

  it("phaseがdownloadingの間はテキストが残り続ける（3秒消去が働かない）", async () => {
    await importToolbar();
    const handler = getListenHandler();

    handler({
      event: "video-download-progress",
      payload: {
        fileIndex: 1,
        fileCount: 1,
        current: 50,
        total: 100,
        phase: "downloading",
      },
    });

    vi.advanceTimersByTime(3000);

    expect(getStatus().textContent).toBe("ダウンロード中 50%");
  });

  it("phaseがcompletedを受信すると一定時間後にテキストが消える", async () => {
    await importToolbar();
    const handler = getListenHandler();

    handler({
      event: "video-download-progress",
      payload: {
        fileIndex: 1,
        fileCount: 1,
        current: 100,
        total: 100,
        phase: "completed",
      },
    });

    expect(getStatus().textContent).toBe("ダウンロード完了");

    vi.advanceTimersByTime(3000);

    expect(getStatus().textContent).toBe("");
  });

  it("phaseがfailedを受信すると一定時間後にテキストが消える", async () => {
    await importToolbar();
    const handler = getListenHandler();

    handler({
      event: "video-download-progress",
      payload: {
        fileIndex: 1,
        fileCount: 1,
        current: 10,
        total: 100,
        phase: "failed",
      },
    });

    expect(getStatus().textContent).toBe("ダウンロード失敗");

    vi.advanceTimersByTime(3000);

    expect(getStatus().textContent).toBe("");
  });

  it("window.__TAURI__.eventが存在しない場合でもエラーにならない", async () => {
    window.__TAURI__ = { core: { invoke: tauriInvokeMock } };

    await expect(importToolbar()).resolves.not.toThrow();
    expect(tauriListenMock).not.toHaveBeenCalled();
  });
});
