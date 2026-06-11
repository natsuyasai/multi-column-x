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
