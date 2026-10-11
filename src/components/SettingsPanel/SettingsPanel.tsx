import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { isAutoReloadSupported } from "@/lib/autoReloadTarget";
import { nextColumnSettingsOnSmallImageChange } from "@/lib/scrollRestoreSetting";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import {
  COLUMN_LABEL_MAX_LENGTH,
  normalizeColumnLabel,
  type Column,
  type ColumnSettings,
} from "../../types";
import {
  nextLineListErrors,
  validateLineListInputs,
  type LineListErrors,
  type LineListTexts,
} from "./lineListInputs";
import styles from "./SettingsPanel.module.scss";
import {
  AutoReloadSection,
  CustomCssSection,
  DisplaySection,
  ImageBlurSection,
  ImageSection,
  NgWordsSection,
  NotificationSection,
  RepostHiddenUsersSection,
  WhitelistSection,
} from "./SettingsSections";

interface SettingsPanelProps {
  column: Column;
  onApply: (
    columnId: string,
    settings: ColumnSettings,
    width: number,
    label: string | undefined,
  ) => void;
  onClose: () => void;
  onReload?: (columnId: string) => void;
  isMobile: boolean;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  column,
  onApply,
  onClose,
  onReload,
  isMobile,
}) => {
  const { t } = useTranslation();
  useEscapeKey(onClose);

  const isExternal = column.pageType === "external";

  const [settings, setSettings] = useState<ColumnSettings>({
    ...column.settings,
  });
  const [width, setWidth] = useState<number>(column.width);
  const [labelText, setLabelText] = useState<string>(column.label ?? "");
  const [lineListTexts, setLineListTexts] = useState<LineListTexts>({
    ngWords: (column.settings.ngWords ?? []).join("\n"),
    repostHiddenUserIds: (column.settings.repostHiddenUserIds ?? []).join("\n"),
    whitelistWords: (column.settings.whitelistWords ?? []).join("\n"),
  });
  const [lineListErrors, setLineListErrors] = useState<LineListErrors>({
    ngWords: null,
    repostHiddenUserIds: null,
    whitelistWords: null,
  });

  const updateSetting = <K extends keyof ColumnSettings>(
    key: K,
    value: ColumnSettings[K],
  ) =>
    setSettings((s) =>
      key === "smallImageEnabled"
        ? nextColumnSettingsOnSmallImageChange(s, value as boolean)
        : { ...s, [key]: value },
    );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = validateLineListInputs(lineListTexts);
    setLineListErrors((prev) => nextLineListErrors(prev, result));
    if (result.kind === "invalid") {
      return;
    }

    onApply(
      column.id,
      { ...settings, ...result.values },
      width,
      normalizeColumnLabel(labelText),
    );
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <h2 className={styles.title}>{t("columnSettings:title")}</h2>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            aria-label={t("columnSettings:close")}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>
              {t("columnSettings:column.title")}
            </h3>
            <label className={styles.fieldLabelBlock}>
              {t("columnSettings:column.label")}
              <input
                type="text"
                className={styles.labelInput}
                value={labelText}
                onChange={(e) => setLabelText(e.target.value)}
                maxLength={COLUMN_LABEL_MAX_LENGTH}
                placeholder={t("columnSettings:column.labelPlaceholder")}
              />
            </label>
            {!isMobile && (
              <label className={styles.fieldLabel}>
                {t("columnSettings:column.width")}
                <input
                  type="number"
                  className={styles.numberInput}
                  min={200}
                  max={1200}
                  value={width}
                  onChange={(e) => setWidth(Number(e.target.value))}
                />
              </label>
            )}
          </section>

          {isAutoReloadSupported(column) && (
            <AutoReloadSection
              settings={settings}
              updateSetting={updateSetting}
            />
          )}

          {!isExternal && (
            <>
              <DisplaySection
                settings={settings}
                updateSetting={updateSetting}
                showReturnToLastRead={column.pageType === "home"}
              />
              <ImageSection settings={settings} updateSetting={updateSetting} />
              <ImageBlurSection
                settings={settings}
                updateSetting={updateSetting}
              />
              {!isMobile && (
                <NotificationSection
                  settings={settings}
                  updateSetting={updateSetting}
                />
              )}
              <NgWordsSection
                text={lineListTexts.ngWords}
                error={lineListErrors.ngWords}
                onChange={(value) =>
                  setLineListTexts((prev) => ({ ...prev, ngWords: value }))
                }
              />
              <RepostHiddenUsersSection
                text={lineListTexts.repostHiddenUserIds}
                error={lineListErrors.repostHiddenUserIds}
                onChange={(value) =>
                  setLineListTexts((prev) => ({
                    ...prev,
                    repostHiddenUserIds: value,
                  }))
                }
              />
              <WhitelistSection
                text={lineListTexts.whitelistWords}
                error={lineListErrors.whitelistWords}
                onChange={(value) =>
                  setLineListTexts((prev) => ({
                    ...prev,
                    whitelistWords: value,
                  }))
                }
                settings={settings}
                updateSetting={updateSetting}
              />
            </>
          )}

          <CustomCssSection settings={settings} updateSetting={updateSetting} />

          <div className={styles.actions}>
            {onReload && (
              <button
                type="button"
                className={styles.reloadBtn}
                onClick={() => {
                  onClose();
                  onReload(column.id);
                }}
              >
                {t("columnSettings:actions.reload")}
              </button>
            )}
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={onClose}
            >
              {t("columnSettings:actions.cancel")}
            </button>
            <button type="submit" className={styles.applyBtn}>
              {t("columnSettings:actions.apply")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
