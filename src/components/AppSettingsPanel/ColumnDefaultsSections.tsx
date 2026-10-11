import React from "react";
import { useTranslation } from "react-i18next";
import styles from "./AppSettingsPanel.module.scss";
import type { SettingsDraft, SetSettingsDraft } from "./settingsDraft";

interface ColumnDefaultsSectionsProps {
  draft: SettingsDraft;
  set: SetSettingsDraft;
  onApplyToAllColumns: () => void;
}

/** 「カラムデフォルト」セクション群（自動更新・表示・画像・カスタムCSS） */
export const ColumnDefaultsSections: React.FC<ColumnDefaultsSectionsProps> = ({
  draft,
  set,
  onApplyToAllColumns,
}) => {
  const { t } = useTranslation();
  return (
    <>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>
          {t("settings:columnDefaults.autoReload.title")}
        </h3>
        <label className={styles.checkLabel}>
          <input
            type="checkbox"
            checked={draft.defaultAutoReloadEnabled}
            onChange={(e) => set("defaultAutoReloadEnabled", e.target.checked)}
          />
          {t("settings:columnDefaults.autoReload.enable")}
        </label>
        {draft.defaultAutoReloadEnabled && (
          <>
            <label className={styles.fieldLabel}>
              {t("settings:columnDefaults.autoReload.interval")}
              <input
                type="number"
                className={styles.numberInput}
                min={10}
                max={3600}
                value={draft.defaultAutoReloadInterval}
                onChange={(e) =>
                  set("defaultAutoReloadInterval", Number(e.target.value))
                }
              />
            </label>
            <label className={styles.checkLabel}>
              <input
                type="checkbox"
                checked={draft.defaultShowCountdown}
                onChange={(e) => set("defaultShowCountdown", e.target.checked)}
              />
              {t("settings:columnDefaults.autoReload.countdown")}
            </label>
          </>
        )}
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>
          {t("settings:columnDefaults.display.title")}
        </h3>
        <label className={styles.checkLabel}>
          <input
            type="checkbox"
            checked={draft.defaultHideHeaderEnabled}
            onChange={(e) => set("defaultHideHeaderEnabled", e.target.checked)}
          />
          {t("settings:columnDefaults.display.hideHeader")}
        </label>
        <label className={styles.checkLabel}>
          <input
            type="checkbox"
            checked={draft.defaultHideTweetInputEnabled}
            onChange={(e) =>
              set("defaultHideTweetInputEnabled", e.target.checked)
            }
          />
          {t("settings:columnDefaults.display.hideTweetInput")}
        </label>
        {draft.defaultHideHeaderEnabled && (
          <label className={styles.checkLabel}>
            <input
              type="checkbox"
              checked={draft.defaultShowCustomMenu}
              onChange={(e) => set("defaultShowCustomMenu", e.target.checked)}
            />
            {t("settings:columnDefaults.display.showCustomMenu")}
          </label>
        )}
        {draft.smallImageEnabled && (
          <label className={styles.checkLabel}>
            <input
              type="checkbox"
              checked={draft.defaultScrollPosRestoreEnabled}
              onChange={(e) =>
                set("defaultScrollPosRestoreEnabled", e.target.checked)
              }
            />
            {t("settings:columnDefaults.display.restoreScroll")}
          </label>
        )}
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>
          {t("settings:columnDefaults.image.title")}
        </h3>
        <label className={styles.checkLabel}>
          <input
            type="checkbox"
            checked={draft.smallImageEnabled}
            onChange={(e) => set("smallImageEnabled", e.target.checked)}
          />
          {t("settings:columnDefaults.image.smallImage")}
        </label>
        {draft.smallImageEnabled && (
          <label className={styles.fieldLabel}>
            {t("settings:columnDefaults.image.width")}
            <input
              type="text"
              className={styles.textInput}
              value={draft.smallImageWidth}
              onChange={(e) => set("smallImageWidth", e.target.value)}
              placeholder="50%"
            />
          </label>
        )}
        <label className={styles.checkLabel}>
          <input
            type="checkbox"
            checked={draft.blurImageEnabled}
            onChange={(e) => set("blurImageEnabled", e.target.checked)}
          />
          {t("settings:columnDefaults.image.blur")}
        </label>
        {draft.blurImageEnabled && (
          <label className={styles.fieldLabel}>
            {t("settings:columnDefaults.image.blurAmount")}
            <input
              type="text"
              className={styles.textInput}
              value={draft.blurImageAmount}
              onChange={(e) => set("blurImageAmount", e.target.value)}
              placeholder="10px"
            />
          </label>
        )}
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>
          {t("settings:columnDefaults.customCss.title")}
        </h3>
        <textarea
          className={styles.cssTextarea}
          value={draft.defaultColumnCustomCSS}
          onChange={(e) => set("defaultColumnCustomCSS", e.target.value)}
          placeholder={t("settings:columnDefaults.customCss.placeholder")}
          spellCheck={false}
        />
        <p className={styles.hint}>
          {t("settings:columnDefaults.customCss.hint")}
        </p>
        <button
          type="button"
          className={styles.applyAllBtn}
          onClick={onApplyToAllColumns}
        >
          {t("settings:columnDefaults.customCss.applyAll")}
        </button>
      </section>
    </>
  );
};
