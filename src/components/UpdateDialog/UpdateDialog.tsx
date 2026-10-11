import React from "react";
import { useTranslation } from "react-i18next";
import type { AppTFunction } from "@/i18n/types";
import type { AppUpdate, UpdateProgress } from "../../services/updater";
import styles from "./UpdateDialog.module.scss";

interface Props {
  update: AppUpdate;
  installing: boolean;
  progress?: UpdateProgress | null;
  installError?: string | null;
  onInstall: () => void;
  onLater: () => void;
}

/** 進捗のフェーズから表示文言とパーセント（不確定なら null）を導出する。 */
function describeProgress(
  progress: UpdateProgress,
  t: AppTFunction,
): {
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
        return {
          label: t("dialogs:update.downloadingPercent", { percent }),
          percent,
        };
      }
      return { label: t("dialogs:update.downloading"), percent: null };
    }
    case "installing":
      return { label: t("dialogs:update.installing"), percent: null };
    case "restarting":
      return { label: t("dialogs:update.restarting"), percent: null };
    case "awaitingInstall":
      return {
        label: t("dialogs:update.awaitingInstall"),
        percent: null,
      };
  }
}

export const UpdateDialog: React.FC<Props> = ({
  update,
  installing,
  progress,
  installError,
  onInstall,
  onLater,
}) => {
  const { t } = useTranslation();
  const status = progress ? describeProgress(progress, t) : null;
  return (
    <div className={styles.overlay}>
      <div className={styles.dialog}>
        <h2 className={styles.title}>{t("dialogs:update.title")}</h2>
        <p className={styles.version}>
          {t("dialogs:update.version", { version: update.version })}
        </p>
        {update.notes && <pre className={styles.notes}>{update.notes}</pre>}
        {status && (
          <div className={styles.progress}>
            <p className={styles.progressLabel}>{status.label}</p>
            <div
              className={styles.progressTrack}
              role="progressbar"
              aria-label={t("dialogs:update.progressAria")}
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
        {installError && (
          <p className={styles.error} role="alert">
            {installError}
          </p>
        )}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.laterBtn}
            onClick={onLater}
            disabled={installing}
          >
            {t("dialogs:update.later")}
          </button>
          <button
            type="button"
            className={styles.installBtn}
            onClick={onInstall}
            disabled={installing}
          >
            {installing
              ? t("dialogs:update.installingButton")
              : t("dialogs:update.install")}
          </button>
        </div>
      </div>
    </div>
  );
};
