import React, { useCallback, useEffect, useRef } from "react";
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

const FALLBACK_ERROR_MESSAGE = "ダウンロードに失敗しました。";

export const H264SetupDialog: React.FC<Props> = ({
  downloadState,
  downloadError,
  onDownload,
  onDismiss,
  onClose,
  onRelaunch,
}) => {
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
          動画を再生するための追加コンポーネント
        </h2>

        {(downloadState === "idle" || downloading) && (
          <>
            <p className={styles.description}>
              動画の再生に必要な H.264 デコーダが見つかりません。Cisco
              の公式配布元から H.264
              デコーダ（OpenH264）を取得して有効化できます。
            </p>
            <p className={styles.note}>
              このデコーダは Cisco のライセンスに基づいて提供されます。
            </p>
            {downloading && (
              <p className={styles.status} role="status">
                ダウンロード中…
              </p>
            )}
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={onDismiss}
                disabled={downloading}
              >
                今はしない
              </button>
              <button
                ref={primaryRef}
                type="button"
                className={styles.primaryBtn}
                onClick={onDownload}
                disabled={downloading}
              >
                ダウンロードして有効化
              </button>
            </div>
          </>
        )}

        {downloadState === "success" && (
          <>
            <p className={styles.status} role="status">
              有効化しました。反映するにはアプリの再起動が必要です。
            </p>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={onClose}
              >
                後で
              </button>
              <button
                ref={primaryRef}
                type="button"
                className={styles.primaryBtn}
                onClick={onRelaunch}
              >
                今すぐ再起動
              </button>
            </div>
          </>
        )}

        {downloadState === "error" && (
          <>
            <p className={styles.error} role="alert">
              {downloadError ?? FALLBACK_ERROR_MESSAGE}
            </p>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={onClose}
              >
                閉じる
              </button>
              <button
                ref={primaryRef}
                type="button"
                className={styles.primaryBtn}
                onClick={onDownload}
              >
                再試行
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
