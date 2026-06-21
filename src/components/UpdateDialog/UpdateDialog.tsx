import React from "react";
import type { AppUpdate, UpdateProgress } from "../../services/updater";
import styles from "./UpdateDialog.module.scss";

interface Props {
  update: AppUpdate;
  installing: boolean;
  progress?: UpdateProgress | null;
  onInstall: () => void;
  onLater: () => void;
}

/** 進捗のフェーズから表示文言とパーセント（不確定なら null）を導出する。 */
function describeProgress(progress: UpdateProgress): {
  label: string;
  percent: number | null;
} {
  switch (progress.phase) {
    case "downloading": {
      if (progress.total && progress.total > 0) {
        const percent = Math.min(
          100,
          Math.round((progress.downloaded / progress.total) * 100),
        );
        return { label: `ダウンロード中... ${percent}%`, percent };
      }
      return { label: "ダウンロード中...", percent: null };
    }
    case "installing":
      return { label: "インストール中...", percent: null };
    case "restarting":
      return { label: "再起動中...", percent: null };
  }
}

export const UpdateDialog: React.FC<Props> = ({
  update,
  installing,
  progress,
  onInstall,
  onLater,
}) => {
  const status = progress ? describeProgress(progress) : null;
  return (
    <div className={styles.overlay}>
      <div className={styles.dialog}>
        <h2 className={styles.title}>新しいバージョンがあります</h2>
        <p className={styles.version}>バージョン {update.version}</p>
        {update.notes && <pre className={styles.notes}>{update.notes}</pre>}
        {status && (
          <div className={styles.progress}>
            <p className={styles.progressLabel}>{status.label}</p>
            <div
              className={styles.progressTrack}
              role="progressbar"
              aria-label="更新の進捗"
              aria-valuemin={0}
              aria-valuemax={100}
              {...(status.percent !== null
                ? { "aria-valuenow": status.percent }
                : {})}
            >
              <div
                className={
                  status.percent !== null
                    ? styles.progressFill
                    : styles.progressIndeterminate
                }
                style={
                  status.percent !== null
                    ? { width: `${status.percent}%` }
                    : undefined
                }
              />
            </div>
          </div>
        )}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.laterBtn}
            onClick={onLater}
            disabled={installing}
          >
            後で
          </button>
          <button
            type="button"
            className={styles.installBtn}
            onClick={onInstall}
            disabled={installing}
          >
            {installing ? "更新中..." : "更新する"}
          </button>
        </div>
      </div>
    </div>
  );
};
