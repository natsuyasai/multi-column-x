// @vitest-environment-options {"url":"https://example.com/"}
// ポップアップが X 系以外のホストを表示している状態を検証する。
// アカウント一覧の取り扱いは popup_toolbar.test.ts（jsdom URL は https://x.com/ 固定）で
// 検証済みのため、このファイルでは「X 以外のホストでのツールバー表示」に絞る。
import { describe, it, expect, vi, beforeEach } from "vitest";

const accounts: TvAccountInfo[] = [
  { id: "acc1", label: "アカウント1", color: "#fff", dataDirectory: "dir1" },
  { id: "acc2", label: "アカウント2", color: "#000", dataDirectory: "dir2" },
];

const tauriInvokeMock = vi.fn((_cmd: string, _args?: Record<string, unknown>) =>
  Promise.resolve<unknown>(undefined),
);

async function importToolbar(): Promise<void> {
  vi.resetModules();
  document.getElementById("tv-popup-toolbar")?.remove();
  await import("./popup_toolbar");
}

describe("inject/popup_toolbar のX以外のホストでの表示", () => {
  beforeEach(() => {
    tauriInvokeMock.mockClear();
    window.__TAURI__ = { core: { invoke: tauriInvokeMock } };
    window.__mcxAccounts = accounts;
    window.__mcxCurrentAccountId = "acc1";
    window.__mcxTargetHref = "";
    window.__mcxEscCloseEnabled = false;
    delete window.__mcxPopupBridge;
  });

  it("アカウントが2件登録されている状態でX以外のページが読み込まれてもツールバーは表示される", async () => {
    await importToolbar();

    expect(document.getElementById("tv-popup-toolbar")).not.toBeNull();
  });

  it("アカウントが2件登録されている状態でX以外のページが読み込まれるとツールバーにアカウント切替とアカウント名は表示されない", async () => {
    await importToolbar();

    const toolbar = document.getElementById("tv-popup-toolbar");
    if (!toolbar) throw new Error("toolbar not found");

    expect(toolbar.querySelector("select")).toBeNull();
    expect(toolbar.textContent).not.toContain("アカウント1");
    expect(toolbar.textContent).not.toContain("アカウント2");
  });
});
