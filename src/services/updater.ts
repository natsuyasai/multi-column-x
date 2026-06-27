import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import type { Update } from "@tauri-apps/plugin-updater";
import { fetchLatestRelease } from "../lib/githubRelease";
import { isNewerVersion } from "../lib/version";

export interface AppUpdate {
  version: string;
  notes?: string;
}

/** 更新適用中の処理状態。UI で進捗表示するために通知する。 */
export type UpdateProgress =
  | { phase: "downloading"; downloaded: number; total: number | null }
  | { phase: "installing" }
  | { phase: "restarting" }
  // Android: OSがAPKダウンロードを引き継いだ後の待機状態
  | { phase: "awaitingInstall" };

export type UpdateProgressCallback = (progress: UpdateProgress) => void;

export interface Updater {
  /** 更新があれば情報を返す。無ければ null。 */
  check(): Promise<AppUpdate | null>;
  /** 直近の check() で見つかった更新を適用する。進捗は onProgress で通知する。 */
  install(onProgress?: UpdateProgressCallback): Promise<void>;
}

function createDesktopUpdater(): Updater {
  let pending: Update | null = null;
  return {
    async check() {
      pending = await check();
      if (!pending) return null;
      return { version: pending.version, notes: pending.body || undefined };
    },
    async install(onProgress) {
      if (!pending) return;
      let total: number | null = null;
      let downloaded = 0;
      await pending.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            total = event.data.contentLength ?? null;
            downloaded = 0;
            onProgress?.({ phase: "downloading", downloaded, total });
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            onProgress?.({ phase: "downloading", downloaded, total });
            break;
          case "Finished":
            onProgress?.({ phase: "installing" });
            break;
        }
      });
      onProgress?.({ phase: "restarting" });
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
    async install(onProgress) {
      if (!apkUrl) return;
      // Android はネイティブ側にダウンロードを委ねるため進捗チャネルが無い。
      // 不確定のダウンロード状態を通知してフリーズに見えないようにする。
      onProgress?.({ phase: "downloading", downloaded: 0, total: null });
      await invoke("install_apk_update", { url: apkUrl });
      // invoke はバックグラウンド Thread を起動して即 return する fire-and-forget。
      // OS がダウンロードを引き継いだことを UI に伝え、ボタン再押下を防ぐ。
      onProgress?.({ phase: "awaitingInstall" });
    },
  };
}

export function createUpdater(isMobile: boolean): Updater {
  return isMobile ? createMobileUpdater() : createDesktopUpdater();
}
