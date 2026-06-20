import { beforeEach, describe, expect, it, vi } from "vitest";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { fetchLatestRelease } from "../lib/githubRelease";
import { createUpdater } from "./updater";

vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../lib/githubRelease", () => ({ fetchLatestRelease: vi.fn() }));

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

describe("mobile updater", () => {
  beforeEach(() => vi.clearAllMocks());

  it("新しいバージョンがあればversion/notesを返す", async () => {
    vi.mocked(getVersion).mockResolvedValue("1.0.0");
    vi.mocked(fetchLatestRelease).mockResolvedValue({
      version: "1.2.0",
      notes: "n",
      apkUrl: "u",
    });
    const u = createUpdater(true);
    expect(await u.check()).toEqual({ version: "1.2.0", notes: "n" });
  });

  it("同一バージョンならnull", async () => {
    vi.mocked(getVersion).mockResolvedValue("1.2.0");
    vi.mocked(fetchLatestRelease).mockResolvedValue({
      version: "1.2.0",
      apkUrl: "u",
    });
    const u = createUpdater(true);
    expect(await u.check()).toBeNull();
  });

  it("installはcheckで得たapkUrlでinstall_apk_updateを呼ぶ", async () => {
    vi.mocked(getVersion).mockResolvedValue("1.0.0");
    vi.mocked(fetchLatestRelease).mockResolvedValue({
      version: "1.2.0",
      apkUrl: "https://x/app.apk",
    });
    const u = createUpdater(true);
    await u.check();
    await u.install();
    expect(invoke).toHaveBeenCalledWith("install_apk_update", {
      url: "https://x/app.apk",
    });
  });
});
