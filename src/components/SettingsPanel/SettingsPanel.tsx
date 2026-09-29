import React, { useState } from "react";
import { isAutoReloadSupported } from "@/lib/autoReloadTarget";
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
  ) => setSettings((s) => ({ ...s, [key]: value }));

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
          <h2 className={styles.title}>カラム設定</h2>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>カラム</h3>
            <label className={styles.fieldLabelBlock}>
              表示名
              <input
                type="text"
                className={styles.labelInput}
                value={labelText}
                onChange={(e) => setLabelText(e.target.value)}
                maxLength={COLUMN_LABEL_MAX_LENGTH}
                placeholder="未指定の場合は既定の表示名"
              />
            </label>
            {!isMobile && (
              <label className={styles.fieldLabel}>
                幅（px）
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
              <NotificationSection
                settings={settings}
                updateSetting={updateSetting}
              />
              <NgWordsSection
                text={lineListTexts.ngWords}
                error={lineListErrors.ngWords}
                onChange={(value) =>
                  setLineListTexts((t) => ({ ...t, ngWords: value }))
                }
              />
              <RepostHiddenUsersSection
                text={lineListTexts.repostHiddenUserIds}
                error={lineListErrors.repostHiddenUserIds}
                onChange={(value) =>
                  setLineListTexts((t) => ({
                    ...t,
                    repostHiddenUserIds: value,
                  }))
                }
              />
              <WhitelistSection
                text={lineListTexts.whitelistWords}
                error={lineListErrors.whitelistWords}
                onChange={(value) =>
                  setLineListTexts((t) => ({ ...t, whitelistWords: value }))
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
                再読み込み
              </button>
            )}
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={onClose}
            >
              キャンセル
            </button>
            <button type="submit" className={styles.applyBtn}>
              適用
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
