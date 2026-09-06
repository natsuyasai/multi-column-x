import React from "react";
import type { ColumnScale } from "../../types";
import styles from "./AppSettingsPanel.module.scss";
import type { SettingsDraft, SetSettingsDraft } from "./settingsDraft";

interface DisplaySettingsSectionProps {
  draft: SettingsDraft;
  set: SetSettingsDraft;
}

/** 「表示」セクション（表示サイズ・テーマ） */
export const DisplaySettingsSection: React.FC<DisplaySettingsSectionProps> = ({
  draft,
  set,
}) => (
  <section className={styles.section}>
    <h3 className={styles.sectionTitle}>表示</h3>
    <div className={styles.scaleRow}>
      <span className={styles.scaleLabel}>表示サイズ</span>
      <label className={`${styles.checkLabel} ${styles.scaleOverrideCheckbox}`}>
        <input
          type="checkbox"
          checked={draft.columnScaleOverrideEnabled}
          onChange={(e) => set("columnScaleOverrideEnabled", e.target.checked)}
        />
        表示サイズを変更する
      </label>
      <div className={styles.scaleOptions}>
        {(
          [
            { value: "small", label: "小" },
            { value: "default", label: "標準" },
            { value: "normal", label: "普通" },
            { value: "large", label: "大" },
            { value: "xLarge", label: "特大" },
          ] as { value: ColumnScale; label: string }[]
        ).map(({ value, label }) => (
          <button
            key={value}
            type="button"
            className={`${styles.scaleBtn} ${draft.columnScale === value ? styles.scaleBtnActive : ""}`}
            disabled={!draft.columnScaleOverrideEnabled}
            onClick={() => set("columnScale", value)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
    <div className={styles.scaleRow}>
      <span className={styles.scaleLabel}>テーマ</span>
      <label className={`${styles.checkLabel} ${styles.scaleOverrideCheckbox}`}>
        <input
          type="checkbox"
          checked={draft.themeOverrideEnabled}
          onChange={(e) => set("themeOverrideEnabled", e.target.checked)}
        />
        テーマを変更する
      </label>
      <div className={styles.scaleOptions}>
        {(
          [
            { value: "dark", label: "ダーク" },
            { value: "light", label: "ライト" },
            { value: "system", label: "システム" },
          ] as {
            value: "dark" | "light" | "system";
            label: string;
          }[]
        ).map(({ value, label }) => (
          <button
            key={value}
            type="button"
            className={`${styles.scaleBtn} ${draft.theme === value ? styles.scaleBtnActive : ""}`}
            disabled={!draft.themeOverrideEnabled}
            onClick={() => set("theme", value)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  </section>
);
