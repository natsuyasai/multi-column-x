import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

  it("installはダウンロードイベントを進捗通知へ変換する", async () => {
    // downloadAndInstall に渡された onEvent を呼び出してイベント列を再現する。
    const dl = vi.fn().mockImplementation(async (onEvent) => {
      onEvent({ event: "Started", data: { contentLength: 1000 } });
      onEvent({ event: "Progress", data: { chunkLength: 400 } });
      onEvent({ event: "Progress", data: { chunkLength: 600 } });
      onEvent({ event: "Finished" });
    });
    vi.mocked(check).mockResolvedValue({
      version: "1.2.0",
      body: "",
      downloadAndInstall: dl,
    } as never);
    vi.mocked(relaunch).mockResolvedValue(undefined as never);
    const u = createUpdater(false);
    await u.check();
    const progress = vi.fn();
    await u.install(progress);
    expect(progress.mock.calls.map((c) => c[0])).toEqual([
      { phase: "downloading", downloaded: 0, total: 1000 },
      { phase: "downloading", downloaded: 400, total: 1000 },
      { phase: "downloading", downloaded: 1000, total: 1000 },
      { phase: "installing" },
      { phase: "restarting" },
    ]);
  });

  it("contentLengthが無い場合はtotalをnullで通知する", async () => {
    const dl = vi.fn().mockImplementation(async (onEvent) => {
      onEvent({ event: "Started", data: {} });
      onEvent({ event: "Progress", data: { chunkLength: 400 } });
      onEvent({ event: "Finished" });
    });
    vi.mocked(check).mockResolvedValue({
      version: "1.2.0",
      body: "",
      downloadAndInstall: dl,
    } as never);
    vi.mocked(relaunch).mockResolvedValue(undefined as never);
    const u = createUpdater(false);
    await u.check();
    const progress = vi.fn();
    await u.install(progress);
    expect(progress.mock.calls[0][0]).toEqual({
      phase: "downloading",
      downloaded: 0,
      total: null,
    });
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

  it("installは進捗チャネルが無いため不確定のダウンロード状態を通知する", async () => {
    vi.mocked(getVersion).mockResolvedValue("1.0.0");
    vi.mocked(fetchLatestRelease).mockResolvedValue({
      version: "1.2.0",
      apkUrl: "https://x/app.apk",
    });
    const u = createUpdater(true);
    await u.check();
    const progress = vi.fn();
    await u.install(progress);
    expect(progress).toHaveBeenCalledWith({
      phase: "downloading",
      downloaded: 0,
      total: null,
    });
  });

  it("installはinvoke完了後にawaitingInstallを通知する", async () => {
    vi.mocked(getVersion).mockResolvedValue("1.0.0");
    vi.mocked(fetchLatestRelease).mockResolvedValue({
      version: "1.2.0",
      apkUrl: "https://x/app.apk",
    });
    const u = createUpdater(true);
    await u.check();
    const progress = vi.fn();
    await u.install(progress);
    expect(progress.mock.calls.map((c) => c[0])).toEqual([
      { phase: "downloading", downloaded: 0, total: null },
      { phase: "awaitingInstall" },
    ]);
  });
});
