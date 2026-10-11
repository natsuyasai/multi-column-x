import React from "react";
import { useTranslation } from "react-i18next";
import { LANGUAGE_SETTINGS } from "@/lib/language";
import type { ColumnScale, UiScale } from "../../types";
import styles from "./AppSettingsPanel.module.scss";
import type { SettingsDraft, SetSettingsDraft } from "./settingsDraft";

const UI_SCALE_VALUES: UiScale[] = [
  "auto",
  "small",
  "standard",
  "large",
  "xLarge",
];
const COLUMN_SCALE_VALUES: ColumnScale[] = [
  "small",
  "default",
  "normal",
  "large",
  "xLarge",
];
const THEME_VALUES = ["dark", "light", "system"] as const;

interface DisplaySettingsSectionProps {
  draft: SettingsDraft;
  set: SetSettingsDraft;
}

/** 「表示」セクション（アプリUIの表示サイズ・カラム内の表示サイズ・テーマ） */
export const DisplaySettingsSection: React.FC<DisplaySettingsSectionProps> = ({
  draft,
  set,
}) => {
  const { t } = useTranslation();
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{t("settings:display.title")}</h3>
      <div className={styles.scaleRow}>
        <span className={styles.scaleLabel}>
          {t("settings:language.label")}
        </span>
        <div
          className={styles.scaleOptions}
          role="group"
          aria-label={t("settings:language.groupLabel")}
        >
          {LANGUAGE_SETTINGS.map((value) => (
            <button
              key={value}
              type="button"
              className={`${styles.scaleBtn} ${draft.language === value ? styles.scaleBtnActive : ""}`}
              aria-pressed={draft.language === value}
              onClick={() => set("language", value)}
            >
              {t(`common:language.${value}`)}
            </button>
          ))}
        </div>
      </div>
      <p className={styles.hint}>{t("settings:language.hint")}</p>
      <div className={styles.scaleRow}>
        <span className={styles.scaleLabel}>
          {t("settings:display.uiScale.label")}
        </span>
        <label
          className={`${styles.checkLabel} ${styles.scaleOverrideCheckbox}`}
        >
          <input
            type="checkbox"
            checked={draft.uiScaleOverrideEnabled}
            onChange={(e) => set("uiScaleOverrideEnabled", e.target.checked)}
          />
          {t("settings:display.uiScale.override")}
        </label>
        <div
          className={styles.scaleOptions}
          role="group"
          aria-label={t("settings:display.uiScale.label")}
        >
          {UI_SCALE_VALUES.map((value) => (
            <button
              key={value}
              type="button"
              className={`${styles.scaleBtn} ${draft.uiScale === value ? styles.scaleBtnActive : ""}`}
              aria-pressed={draft.uiScale === value}
              disabled={!draft.uiScaleOverrideEnabled}
              onClick={() => set("uiScale", value)}
            >
              {t(`settings:display.uiScale.options.${value}`)}
            </button>
          ))}
        </div>
      </div>
      <p className={styles.hint}>{t("settings:display.uiScale.hint")}</p>
      <div className={styles.scaleRow}>
        <span className={styles.scaleLabel}>
          {t("settings:display.columnScale.label")}
        </span>
        <label
          className={`${styles.checkLabel} ${styles.scaleOverrideCheckbox}`}
        >
          <input
            type="checkbox"
            checked={draft.columnScaleOverrideEnabled}
            onChange={(e) =>
              set("columnScaleOverrideEnabled", e.target.checked)
            }
          />
          {t("settings:display.columnScale.override")}
        </label>
        <div
          className={styles.scaleOptions}
          role="group"
          aria-label={t("settings:display.columnScale.label")}
        >
          {COLUMN_SCALE_VALUES.map((value) => (
            <button
              key={value}
              type="button"
              className={`${styles.scaleBtn} ${draft.columnScale === value ? styles.scaleBtnActive : ""}`}
              disabled={!draft.columnScaleOverrideEnabled}
              onClick={() => set("columnScale", value)}
            >
              {t(`settings:display.columnScale.options.${value}`)}
            </button>
          ))}
        </div>
      </div>
      <p className={styles.hint}>{t("settings:display.columnScale.hint")}</p>
      <div className={styles.scaleRow}>
        <span className={styles.scaleLabel}>
          {t("settings:display.theme.label")}
        </span>
        <label
          className={`${styles.checkLabel} ${styles.scaleOverrideCheckbox}`}
        >
          <input
            type="checkbox"
            checked={draft.themeOverrideEnabled}
            onChange={(e) => set("themeOverrideEnabled", e.target.checked)}
          />
          {t("settings:display.theme.override")}
        </label>
        <div className={styles.scaleOptions}>
          {THEME_VALUES.map((value) => (
            <button
              key={value}
              type="button"
              className={`${styles.scaleBtn} ${draft.theme === value ? styles.scaleBtnActive : ""}`}
              disabled={!draft.themeOverrideEnabled}
              onClick={() => set("theme", value)}
            >
              {t(`settings:display.theme.options.${value}`)}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};
