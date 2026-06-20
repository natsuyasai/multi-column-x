import { check } from "@tauri-apps/plugin-updater";
import type { Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

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

// モバイル実装はサブプロジェクト3（Android 更新）で差し替える。
function createMobileUpdater(): Updater {
  return {
    async check() {
      return null;
    },
    async install() {},
  };
}

export function createUpdater(isMobile: boolean): Updater {
  return isMobile ? createMobileUpdater() : createDesktopUpdater();
}
