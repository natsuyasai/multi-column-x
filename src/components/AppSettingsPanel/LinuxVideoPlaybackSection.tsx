import React from "react";
import { useTranslation } from "react-i18next";
import type {
  H264DownloadError,
  H264DownloadState,
} from "@/hooks/useH264Setup";
import { describeAppError } from "@/lib/appError";
import styles from "./AppSettingsPanel.module.scss";
import type { SettingsDraft, SetSettingsDraft } from "./settingsDraft";

/** 設定画面から H.264 を有効化するために必要な状態と操作 */
export interface H264SettingsInfo {
  /** H.264 をダウンロードして有効化できる環境（Linux の AppImage）か */
  downloadApplicable: boolean;
  h264Available: boolean;
  downloadState: H264DownloadState;
  downloadError: H264DownloadError | null;
  onEnable: () => void;
  onRelaunch: () => void;
}

interface LinuxVideoPlaybackSectionProps {
  draft: SettingsDraft;
  set: SetSettingsDraft;
  /** Linux デスクトップか（それ以外では何も表示しない） */
  isLinux: boolean;
  /** アプリ起動時に読み込んだハードウェアデコード設定（再起動案内の判定に使う） */
  startupHardwareVideoDecodeEnabled: boolean;
  h264?: H264SettingsInfo;
}

const H264Row: React.FC<{ h264: H264SettingsInfo }> = ({ h264 }) => {
  const { t } = useTranslation();
  const { downloadState, h264Available } = h264;

  // 取得に成功すると h264Available も true になるが、再起動案内を出し続けるため
  // downloadState を先に判定する
  if (downloadState === "success") {
    return (
      <div className={styles.inlineRow}>
        <span className={styles.hint} role="status">
          {t("settings:linuxVideo.h264Restart", {
            notice: t("settings:linuxVideo.restartNotice"),
          })}
        </span>
        <button
          type="button"
          className={styles.applyAllBtn}
          onClick={h264.onRelaunch}
        >
          {t("settings:linuxVideo.relaunch")}
        </button>
      </div>
    );
  }

  if (downloadState === "downloading") {
    return (
      <div className={styles.inlineRow}>
        <button type="button" className={styles.applyAllBtn} disabled>
          {t("settings:linuxVideo.enable")}
        </button>
        <span className={styles.hint} role="status">
          {t("settings:linuxVideo.downloading")}
        </span>
      </div>
    );
  }

  if (downloadState === "error") {
    return (
      <>
        <p className={styles.errorText} role="alert">
          {h264.downloadError
            ? describeAppError(h264.downloadError, t)
            : t("settings:linuxVideo.fetchFailed")}
        </p>
        <div className={styles.inlineRow}>
          <button
            type="button"
            className={styles.applyAllBtn}
            onClick={h264.onEnable}
          >
            {t("settings:linuxVideo.retry")}
          </button>
        </div>
      </>
    );
  }

  if (h264Available) {
    return <p className={styles.hint}>{t("settings:linuxVideo.enabled")}</p>;
  }

  return (
    <div className={styles.inlineRow}>
      <button
        type="button"
        className={styles.applyAllBtn}
        onClick={h264.onEnable}
      >
        {t("settings:linuxVideo.enable")}
      </button>
      <span className={styles.hint}>{t("settings:linuxVideo.enableHint")}</span>
    </div>
  );
};

/**
 * Linux 向けの動画再生設定（H.264 の有効化・ハードウェアデコード）。
 * Linux 以外では何も表示しない。H.264 の項目は AppImage のみ。
 */
export const LinuxVideoPlaybackSection: React.FC<
  LinuxVideoPlaybackSectionProps
> = ({ draft, set, isLinux, startupHardwareVideoDecodeEnabled, h264 }) => {
  const { t } = useTranslation();
  if (!isLinux) return null;

  const hardwareDecodeChanged =
    draft.hardwareVideoDecodeEnabled !== startupHardwareVideoDecodeEnabled;

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{t("settings:linuxVideo.title")}</h3>
      {h264?.downloadApplicable && <H264Row h264={h264} />}
      <label className={styles.checkLabel}>
        <input
          type="checkbox"
          checked={draft.hardwareVideoDecodeEnabled}
          onChange={(e) => set("hardwareVideoDecodeEnabled", e.target.checked)}
        />
        {t("settings:linuxVideo.hardwareDecode")}
      </label>
      {hardwareDecodeChanged && (
        <p className={styles.hint} role="status">
          {t("settings:linuxVideo.restartNotice")}
        </p>
      )}
    </section>
  );
};
