import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { logError } from "../lib/log";

interface MediaCodecStatus {
  h264Available: boolean;
  aacAvailable: boolean;
}

export type H264DownloadState = "idle" | "downloading" | "success" | "error";

export function useMediaCodecCheck(ready: boolean = true) {
  const [checking, setChecking] = useState(false);
  const [missingH264, setMissingH264] = useState(false);
  const [missingAac, setMissingAac] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [h264DownloadState, setH264DownloadState] =
    useState<H264DownloadState>("idle");
  const [h264DownloadError, setH264DownloadError] = useState<string | null>(
    null,
  );

  // ready が false の間はチェックしない（カラム復元前にダイアログが裏へ隠れるのを防ぐ）。
  // 起動後は ref で一度だけに制限する。
  const checkedRef = useRef(false);
  useEffect(() => {
    if (!ready) return;
    if (checkedRef.current) return;
    checkedRef.current = true;
    setChecking(true);
    invoke<MediaCodecStatus>("check_media_codec_support")
      .then((status) => {
        const noH264 = !status.h264Available;
        const noAac = !status.aacAvailable;
        setMissingH264(noH264);
        setMissingAac(noAac);
        if (noH264 || noAac) {
          setIsDialogOpen(true);
        }
      })
      // invoke 失敗時は fail-open（欠如なし扱い、ダイアログも表示しない）。
      .catch(logError("useMediaCodecCheck:check"))
      .finally(() => setChecking(false));
  }, [ready]);

  const hasMissingCodec = missingH264 || missingAac;

  const openDialog = useCallback(() => setIsDialogOpen(true), []);
  const closeDialog = useCallback(() => setIsDialogOpen(false), []);

  const downloadH264 = useCallback(async () => {
    setH264DownloadState("downloading");
    setH264DownloadError(null);
    try {
      await invoke("download_and_enable_h264");
      setH264DownloadState("success");
    } catch (e) {
      setH264DownloadState("error");
      setH264DownloadError(e instanceof Error ? e.message : String(e));
      logError("useMediaCodecCheck:downloadH264")(e);
    }
  }, []);

  return {
    checking,
    missingH264,
    missingAac,
    hasMissingCodec,
    isDialogOpen,
    openDialog,
    closeDialog,
    h264DownloadState,
    h264DownloadError,
    downloadH264,
  };
}
