import React, { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import type { H264DownloadState } from "@/hooks/useH264Setup";
import styles from "./H264SetupDialog.module.scss";

interface Props {
  downloadState: H264DownloadState;
  downloadError: string | null;
  onDownload: () => void;
  /** 「今はしない」: 案内の拒否を保存して閉じる */
  onDismiss: () => void;
  /** 拒否を保存せずに閉じる（Escape・「後で」・失敗後の「閉じる」） */
  onClose: () => void;
  onRelaunch: () => void;
}

export const H264SetupDialog: React.FC<Props> = ({
  downloadState,
  downloadError,
  onDownload,
  onDismiss,
  onClose,
  onRelaunch,
}) => {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const downloading = downloadState === "downloading";

  // Escape は拒否を保存しない閉じる操作に統一する（誤操作で案内が拒否されないように）。
  // ダウンロード中は閉じても処理が止まらず状態だけ見えなくなるため無視する。
  const handleEscape = useCallback(() => {
    if (!downloading) onClose();
  }, [downloading, onClose]);
  useEscapeKey(handleEscape);

  // 状態が変わるたびに主操作ボタンへ（無ければダイアログ自身へ）フォーカスを移す
  useEffect(() => {
    (primaryRef.current ?? dialogRef.current)?.focus();
  }, [downloadState]);

  return (
    <div className={styles.overlay}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="h264-setup-title"
        aria-busy={downloading}
        tabIndex={-1}
      >
        <h2 id="h264-setup-title" className={styles.title}>
          {t("dialogs:h264.title")}
        </h2>

        {(downloadState === "idle" || downloading) && (
          <>
            <p className={styles.description}>
              {t("dialogs:h264.description")}
            </p>
            <p className={styles.note}>{t("dialogs:h264.note")}</p>
            {downloading && (
              <p className={styles.status} role="status">
                {t("dialogs:h264.downloading")}
              </p>
            )}
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={onDismiss}
                disabled={downloading}
              >
                {t("dialogs:h264.dismiss")}
              </button>
              <button
                ref={primaryRef}
                type="button"
                className={styles.primaryBtn}
                onClick={onDownload}
                disabled={downloading}
              >
                {t("dialogs:h264.download")}
              </button>
            </div>
          </>
        )}

        {downloadState === "success" && (
          <>
            <p className={styles.status} role="status">
              {t("dialogs:h264.success")}
            </p>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={onClose}
              >
                {t("dialogs:h264.later")}
              </button>
              <button
                ref={primaryRef}
                type="button"
                className={styles.primaryBtn}
                onClick={onRelaunch}
              >
                {t("dialogs:h264.relaunch")}
              </button>
            </div>
          </>
        )}

        {downloadState === "error" && (
          <>
            <p className={styles.error} role="alert">
              {downloadError ?? t("dialogs:h264.fallbackError")}
            </p>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={onClose}
              >
                {t("dialogs:h264.close")}
              </button>
              <button
                ref={primaryRef}
                type="button"
                className={styles.primaryBtn}
                onClick={onDownload}
              >
                {t("dialogs:h264.retry")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
