import { beforeEach, describe, expect, it, vi } from "vitest";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { createUpdater } from "./updater";

vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));

describe("desktop updater", () => {
  beforeEach(() => vi.clearAllMocks());

  it("更新があればversionとnotesを返す", async () => {
    vi.mocked(check).mockResolvedValue({
      version: "1.2.0",
      body: "fixes",
      downloadAndInstall: vi.fn().mockResolvedValue(undefined),
    } as never);
    const u = createUpdater(false);
    expect(await u.check()).toEqual({ version: "1.2.0", notes: "fixes" });
  });

  it("更新が無ければnullを返す", async () => {
    vi.mocked(check).mockResolvedValue(null as never);
    const u = createUpdater(false);
    expect(await u.check()).toBeNull();
  });

  it("installはcheckで得た更新をdownloadAndInstallしrelaunchする", async () => {
    const dl = vi.fn().mockResolvedValue(undefined);
    vi.mocked(check).mockResolvedValue({
      version: "1.2.0",
      body: "",
      downloadAndInstall: dl,
    } as never);
    vi.mocked(relaunch).mockResolvedValue(undefined as never);
    const u = createUpdater(false);
    await u.check();
    await u.install();
    expect(dl).toHaveBeenCalledOnce();
    expect(relaunch).toHaveBeenCalledOnce();
  });
});

describe("mobile updater (スタブ)", () => {
  it("checkはnull、installは何もしない", async () => {
    const u = createUpdater(true);
    expect(await u.check()).toBeNull();
    await expect(u.install()).resolves.toBeUndefined();
  });
});
