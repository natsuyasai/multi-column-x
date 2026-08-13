import React from "react";
import styles from "./AppSettingsPanel.module.scss";

interface AppInfoSectionsProps {
  onReloadAllWebviews: () => void;
  appVersion: string;
  updateChecking: boolean;
  updateManualResult: "idle" | "none" | "error";
  onCheckUpdate: () => void;
}

/** 「WebView」「アプリ情報」セクション（ドラフト非依存） */
export const AppInfoSections: React.FC<AppInfoSectionsProps> = ({
  onReloadAllWebviews,
  appVersion,
  updateChecking,
  updateManualResult,
  onCheckUpdate,
}) => (
  <>
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>WebView</h3>
      <p className={styles.hint}>
        全カラムのWebViewを順番に再生成します。設定は維持されます。
      </p>
      <button
        type="button"
        className={styles.applyAllBtn}
        onClick={onReloadAllWebviews}
      >
        全WebViewを再生成
      </button>
    </section>

    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>アプリ情報</h3>
      <p className={styles.hint}>現在のバージョン: {appVersion}</p>
      <button
        type="button"
        className={styles.applyAllBtn}
        onClick={onCheckUpdate}
        disabled={updateChecking}
      >
        {updateChecking ? "確認中..." : "更新を確認"}
      </button>
      {updateManualResult === "none" && (
        <p className={styles.hint}>最新のバージョンです</p>
      )}
      {updateManualResult === "error" && (
        <p className={styles.hint}>更新の確認に失敗しました</p>
      )}
    </section>
  </>
);
