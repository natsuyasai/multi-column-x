import React, { useState } from "react";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { useAppStore } from "../../store/useAppStore";
import type {
  GlobalSettings,
  Column,
  Account,
  ColumnSettings,
} from "../../types";
import { AppInfoSections } from "./AppInfoSections";
import styles from "./AppSettingsPanel.module.scss";
import { ColumnDefaultsSections } from "./ColumnDefaultsSections";
import { ColumnLayoutTab } from "./ColumnLayoutTab";
import { DisplaySettingsSection } from "./DisplaySettingsSection";
import { GeneralSettingsSections } from "./GeneralSettingsSections";
import { PresetsTab } from "./PresetsTab";
import {
  clampSwipeAreaHeight,
  createSettingsDraft,
  type SettingsDraft,
} from "./settingsDraft";

interface AppSettingsPanelProps {
  settings: GlobalSettings;
  columns: Column[];
  accounts: Account[];
  onApply: (patch: Partial<GlobalSettings>) => void;
  onApplyLayout: (columns: Column[]) => void;
  onApplyColumnDefaults: (
    patch: Omit<ColumnSettings, "visibleLinks" | "ngWords">,
  ) => void;
  onReloadAllWebviews: () => void;
  appVersion: string;
  updateChecking: boolean;
  updateManualResult: "idle" | "none" | "error";
  onCheckUpdate: () => void;
  onClose: () => void;
}

export const AppSettingsPanel: React.FC<AppSettingsPanelProps> = ({
  settings,
  columns,
  accounts,
  onApply,
  onApplyLayout,
  onApplyColumnDefaults,
  onReloadAllWebviews,
  appVersion,
  updateChecking,
  updateManualResult,
  onCheckUpdate,
  onClose,
}) => {
  const isMobile = useAppStore((s) => s.isMobile);
  const { savePreset, loadPreset, deletePreset } = useAppStore();
  useEscapeKey(onClose);
  const [activeTab, setActiveTab] = useState<"general" | "layout" | "presets">(
    "general",
  );

  const [draft, setDraft] = useState<SettingsDraft>(() =>
    createSettingsDraft(settings),
  );

  const set = <K extends keyof SettingsDraft>(
    key: K,
    value: SettingsDraft[K],
  ) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const ngWords = draft.globalNgWordsText
      .split("\n")
      .map((w) => w.trim())
      .filter((w) => w.length > 0);
    onApply({
      theme: draft.theme,
      defaultAutoReloadEnabled: draft.defaultAutoReloadEnabled,
      defaultAutoReloadInterval: draft.defaultAutoReloadInterval,
      defaultShowCountdown: draft.defaultShowCountdown,
      defaultAreaRemoveEnabled: draft.defaultAreaRemoveEnabled,
      defaultShowCustomMenu: draft.defaultShowCustomMenu,
      defaultScrollPosRestoreEnabled: draft.defaultScrollPosRestoreEnabled,
      defaultColumnCustomCSS: draft.defaultColumnCustomCSS,
      popupEscCloseEnabled: draft.popupEscCloseEnabled,
      videoAutoPlayStopEnabled: draft.videoAutoPlayStopEnabled,
      imagePopupEnabled: draft.imagePopupEnabled,
      videoPopupEnabled: draft.videoPopupEnabled,
      smallImageEnabled: draft.smallImageEnabled,
      smallImageWidth: draft.smallImageWidth,
      blurImageEnabled: draft.blurImageEnabled,
      blurImageAmount: draft.blurImageAmount,
      hideAdEnabled: draft.hideAdEnabled,
      columnScale: draft.columnScale,
      useXAppForCompose: draft.useXAppForCompose,
      mobileSwipeAreaEnabled: draft.mobileSwipeAreaEnabled,
      mobileSwipeAreaHeight: clampSwipeAreaHeight(draft.mobileSwipeAreaHeight),
      mobileTwoColumnEnabled: draft.mobileTwoColumnEnabled,
      ngWords,
    });
    onClose();
  };

  const handleApplyColumnDefaults = () => {
    onApplyColumnDefaults({
      autoReloadEnabled: draft.defaultAutoReloadEnabled,
      autoReloadInterval: draft.defaultAutoReloadInterval,
      showCountdown: draft.defaultShowCountdown,
      areaRemoveEnabled: draft.defaultAreaRemoveEnabled,
      showCustomMenu: draft.defaultShowCustomMenu,
      scrollPosRestoreEnabled: draft.defaultScrollPosRestoreEnabled,
      customCSS: draft.defaultColumnCustomCSS,
      smallImageEnabled: draft.smallImageEnabled,
      smallImageWidth: draft.smallImageWidth,
      blurImageEnabled: draft.blurImageEnabled,
      blurImageAmount: draft.blurImageAmount,
    });
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <h2 className={styles.title}>アプリ設定</h2>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>

        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${activeTab === "general" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("general")}
          >
            一般
          </button>
          <button
            className={`${styles.tab} ${activeTab === "layout" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("layout")}
          >
            カラム配置
          </button>
          {!isMobile && (
            <button
              className={`${styles.tab} ${activeTab === "presets" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("presets")}
            >
              プリセット
            </button>
          )}
        </div>

        <div className={styles.tabContent}>
          {activeTab === "general" && (
            <form
              id="app-settings-form"
              onSubmit={handleSubmit}
              className={styles.form}
            >
              <DisplaySettingsSection draft={draft} set={set} />

              <ColumnDefaultsSections
                draft={draft}
                set={set}
                onApplyToAllColumns={handleApplyColumnDefaults}
              />

              <GeneralSettingsSections
                draft={draft}
                set={set}
                isMobile={isMobile}
              />

              <AppInfoSections
                onReloadAllWebviews={() => {
                  onReloadAllWebviews();
                  onClose();
                }}
                appVersion={appVersion}
                updateChecking={updateChecking}
                updateManualResult={updateManualResult}
                onCheckUpdate={onCheckUpdate}
              />
            </form>
          )}

          {activeTab === "layout" && (
            <ColumnLayoutTab
              columns={columns}
              accounts={accounts}
              onApply={(updatedColumns) => {
                onApplyLayout(updatedColumns);
                onClose();
              }}
              onCancel={onClose}
              isMobile={isMobile}
            />
          )}

          {!isMobile && activeTab === "presets" && (
            <PresetsTab
              presets={settings.presets ?? []}
              onSave={(name) => savePreset(name)}
              onLoad={(id) => {
                loadPreset(id);
                onClose();
              }}
              onDelete={(id) => deletePreset(id)}
            />
          )}
        </div>

        {activeTab === "general" && (
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={onClose}
            >
              キャンセル
            </button>
            <button
              type="submit"
              form="app-settings-form"
              className={styles.applyBtn}
            >
              適用
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
