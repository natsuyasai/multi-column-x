// popup_toolbar.ts は IIFE のため、import 時にツールバーが DOM へ注入される。
// vi.resetModules で再 import し、Android ブリッジ有無それぞれの転送先を検証する。
import { describe, it, expect, vi, beforeEach } from "vitest";

const tauriInvokeMock = vi.fn((_cmd: string, _args?: Record<string, unknown>) =>
  Promise.resolve<unknown>(undefined),
);

const switchPopupSessionMock = vi.fn();

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
});
