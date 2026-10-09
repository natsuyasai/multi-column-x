import { invoke } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { useCallback, useEffect, useRef, useState } from "react";
import { IPC_COMMANDS } from "@/constants/ipc";
import { logError } from "@/lib/log";
import { useAppStore } from "@/store/useAppStore";

export type H264DownloadState = "idle" | "downloading" | "success" | "error";

/** Rust 側 `check_media_codec_support` の戻り値（camelCase） */
interface MediaCodecStatus {
  h264Available: boolean;
  aacAvailable: boolean;
  h264DownloadApplicable: boolean;
}

interface H264PromptConditions {
  /** H.264 をダウンロードして有効化できる環境（Linux の AppImage）か */
  downloadApplicable: boolean;
  h264Available: boolean;
  /** ユーザーが案内を拒否済みか */
  dismissed: boolean;
}

/** 起動時の H.264 取得案内を表示するかの判定（ハードウェアデコード可否は影響しない） */
export function shouldShowH264Prompt({
  downloadApplicable,
  h264Available,
  dismissed,
}: H264PromptConditions): boolean {
  return downloadApplicable && !h264Available && !dismissed;
}

/**
 * H.264 デコーダの取得案内と取得操作の状態管理。
 * `ready` が true になってから一度だけ判定する（カラム復元前にダイアログが裏へ隠れるのを防ぐ）。
 */
export function useH264Setup(ready: boolean) {
  const dismissed = useAppStore(
    (s) => s.globalSettings.h264DownloadPromptDismissed,
  );
  const updateGlobalSettings = useAppStore((s) => s.updateGlobalSettings);

  const [downloadApplicable, setDownloadApplicable] = useState(false);
  const [h264Available, setH264Available] = useState(true);
  const [downloadState, setDownloadState] = useState<H264DownloadState>("idle");
  const [downloadError, setDownloadError] = useState<string | null>(null);
  // 案内ダイアログを閉じた（または設定画面から開始した）後に再表示しないための状態
  const [closed, setClosed] = useState(false);

  const checkedRef = useRef(false);
  const downloadingRef = useRef(false);

  useEffect(() => {
    if (!ready) return;
    if (checkedRef.current) return;
    checkedRef.current = true;
    invoke<MediaCodecStatus>(IPC_COMMANDS.CHECK_MEDIA_CODEC_SUPPORT)
      .then((status) => {
        setDownloadApplicable(status.h264DownloadApplicable);
        setH264Available(status.h264Available);
      })
      // 判定失敗時は fail-open（案内を表示しない）
      .catch(logError("useH264Setup:check"));
  }, [ready]);

  const startDownload = useCallback(async (viaDialog: boolean) => {
    if (downloadingRef.current) return;
    downloadingRef.current = true;
    if (!viaDialog) setClosed(true);
    setDownloadState("downloading");
    setDownloadError(null);
    try {
      await invoke(IPC_COMMANDS.DOWNLOAD_AND_ENABLE_H264);
      setH264Available(true);
      setDownloadState("success");
    } catch (e) {
      setDownloadState("error");
      setDownloadError(e instanceof Error ? e.message : String(e));
      logError("useH264Setup:download")(e);
    } finally {
      downloadingRef.current = false;
    }
  }, []);

  const download = useCallback(() => startDownload(true), [startDownload]);

  const openFromSettings = useCallback(() => {
    void startDownload(false);
  }, [startDownload]);

  const dismiss = useCallback(() => {
    updateGlobalSettings({ h264DownloadPromptDismissed: true });
    setClosed(true);
  }, [updateGlobalSettings]);

  const close = useCallback(() => setClosed(true), []);

  const relaunchApp = useCallback(() => relaunch(), []);

  const isDialogOpen =
    !closed &&
    (downloadState !== "idle" ||
      shouldShowH264Prompt({ downloadApplicable, h264Available, dismissed }));

  return {
    downloadApplicable,
    h264Available,
    isDialogOpen,
    downloadState,
    downloadError,
    download,
    dismiss,
    close,
    relaunchApp,
    openFromSettings,
  };
}
