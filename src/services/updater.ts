import { check } from "@tauri-apps/plugin-updater";
import type { Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { fetchLatestRelease } from "../lib/githubRelease";
import { isNewerVersion } from "../lib/version";

export interface AppUpdate {
  version: string;
  notes?: string;
}

export interface Updater {
  /** 更新があれば情報を返す。無ければ null。 */
  check(): Promise<AppUpdate | null>;
  /** 直近の check() で見つかった更新を適用する。 */
  install(): Promise<void>;
}

function createDesktopUpdater(): Updater {
  let pending: Update | null = null;
  return {
    async check() {
      pending = await check();
      if (!pending) return null;
      return { version: pending.version, notes: pending.body || undefined };
    },
    async install() {
      if (!pending) return;
      await pending.downloadAndInstall();
      await relaunch();
    },
  };
}

// Android: GitHub Releases API で最新版を検出し、APK をインストーラ経由で適用する。
function createMobileUpdater(): Updater {
  let apkUrl: string | null = null;
  return {
    async check() {
      const current = await getVersion();
      const release = await fetchLatestRelease();
      if (!release || !isNewerVersion(release.version, current)) return null;
      apkUrl = release.apkUrl;
      return { version: release.version, notes: release.notes };
    },
    async install() {
      if (!apkUrl) return;
      await invoke("install_apk_update", { url: apkUrl });
    },
  };
}

export function createUpdater(isMobile: boolean): Updater {
  return isMobile ? createMobileUpdater() : createDesktopUpdater();
}
