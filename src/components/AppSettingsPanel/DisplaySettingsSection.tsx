import React from "react";
import type { ColumnScale, UiScale } from "../../types";
import styles from "./AppSettingsPanel.module.scss";
import type { SettingsDraft, SetSettingsDraft } from "./settingsDraft";

interface DisplaySettingsSectionProps {
  draft: SettingsDraft;
  set: SetSettingsDraft;
}

/** 「表示」セクション（アプリUIの表示サイズ・カラム内の表示サイズ・テーマ） */
export const DisplaySettingsSection: React.FC<DisplaySettingsSectionProps> = ({
  draft,
  set,
}) => (
  <section className={styles.section}>
    <h3 className={styles.sectionTitle}>表示</h3>
    <div className={styles.scaleRow}>
      <span className={styles.scaleLabel}>アプリUIの表示サイズ</span>
      <label className={`${styles.checkLabel} ${styles.scaleOverrideCheckbox}`}>
        <input
          type="checkbox"
          checked={draft.uiScaleOverrideEnabled}
          onChange={(e) => set("uiScaleOverrideEnabled", e.target.checked)}
        />
        アプリUIの表示サイズを変更する
      </label>
      <div
        className={styles.scaleOptions}
        role="group"
        aria-label="アプリUIの表示サイズ"
      >
        {(
          [
            { value: "auto", label: "端末に合わせる" },
            { value: "small", label: "小" },
            { value: "standard", label: "標準" },
            { value: "large", label: "大" },
            { value: "xLarge", label: "特大" },
          ] as { value: UiScale; label: string }[]
        ).map(({ value, label }) => (
          <button
            key={value}
            type="button"
            className={`${styles.scaleBtn} ${draft.uiScale === value ? styles.scaleBtnActive : ""}`}
            aria-pressed={draft.uiScale === value}
            disabled={!draft.uiScaleOverrideEnabled}
            onClick={() => set("uiScale", value)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
    <p className={styles.hint}>
      アプリの画面（ツールバーや設定など）の大きさです。カラムの中身は「カラム内の表示サイズ」で変更します。
    </p>
    <div className={styles.scaleRow}>
      <span className={styles.scaleLabel}>カラム内の表示サイズ</span>
      <label className={`${styles.checkLabel} ${styles.scaleOverrideCheckbox}`}>
        <input
          type="checkbox"
          checked={draft.columnScaleOverrideEnabled}
          onChange={(e) => set("columnScaleOverrideEnabled", e.target.checked)}
        />
        カラム内の表示サイズを変更する
      </label>
      <div
        className={styles.scaleOptions}
        role="group"
        aria-label="カラム内の表示サイズ"
      >
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
    <p className={styles.hint}>カラム内（x.com の表示）の大きさです。</p>
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
