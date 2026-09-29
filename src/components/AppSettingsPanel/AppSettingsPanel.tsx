import React, { useState } from "react";
import {
  parseAndValidateUserIdLines,
  parseAndValidateWordLines,
} from "@/lib/lineListValidation";
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
  createSettingsDraft,
  toColumnDefaults,
  toGlobalSettingsPatch,
  type SettingsDraft,
} from "./settingsDraft";

interface AppSettingsPanelProps {
  settings: GlobalSettings;
  columns: Column[];
  accounts: Account[];
  onApply: (patch: Partial<GlobalSettings>) => void;
  onApplyLayout: (columns: Column[]) => void;
  onApplyColumnDefaults: (
    patch: Omit<
      ColumnSettings,
      | "visibleLinks"
      | "ngWords"
      | "repostHiddenUserIds"
      | "whitelistEnabled"
      | "whitelistWords"
      | "returnToLastReadEnabled"
    >,
  ) => void;
  onReloadAllWebviews: () => void;
  onLoadPreset: (id: string) => Promise<void>;
  appVersion: string;
  updateChecking: boolean;
  updateManualResult: "idle" | "none" | "error";
  onCheckUpdate: () => void;
  onOpenOfficialSettings: () => void;
  onClose: () => void;
  pendingDataDirectoryDeletionCount: number;
  onRetryDataDirectoryDeletion: () => Promise<{ remaining: number }>;
}

export const AppSettingsPanel: React.FC<AppSettingsPanelProps> = ({
  settings,
  columns,
  accounts,
  onApply,
  onApplyLayout,
  onApplyColumnDefaults,
  onReloadAllWebviews,
  onLoadPreset,
  appVersion,
  updateChecking,
  updateManualResult,
  onCheckUpdate,
  onOpenOfficialSettings,
  onClose,
  pendingDataDirectoryDeletionCount,
  onRetryDataDirectoryDeletion,
}) => {
  const isMobile = useAppStore((s) => s.isMobile);
  const { savePreset, deletePreset } = useAppStore();
  useEscapeKey(onClose);
  const [activeTab, setActiveTab] = useState<"general" | "layout" | "presets">(
    "general",
  );

  const [draft, setDraft] = useState<SettingsDraft>(() =>
    createSettingsDraft(settings),
  );
  const [ngWordsError, setNgWordsError] = useState<string | null>(null);
  const [repostHiddenUserIdsError, setRepostHiddenUserIdsError] = useState<
    string | null
  >(null);

  const [retryingDataDirectoryDeletion, setRetryingDataDirectoryDeletion] =
    useState(false);
  const [
    dataDirectoryDeletionRetryResult,
    setDataDirectoryDeletionRetryResult,
  ] = useState<"idle" | "success" | "remaining">("idle");
  const [
    dataDirectoryDeletionRemainingCount,
    setDataDirectoryDeletionRemainingCount,
  ] = useState(0);

  const handleRetryDataDirectoryDeletion = async () => {
    setRetryingDataDirectoryDeletion(true);
    try {
      const { remaining } = await onRetryDataDirectoryDeletion();
      setDataDirectoryDeletionRemainingCount(remaining);
      setDataDirectoryDeletionRetryResult(
        remaining === 0 ? "success" : "remaining",
      );
    } finally {
      setRetryingDataDirectoryDeletion(false);
    }
  };

  const set = <K extends keyof SettingsDraft>(
    key: K,
    value: SettingsDraft[K],
  ) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const ngWords = parseAndValidateWordLines(draft.globalNgWordsText);
    if (ngWords.kind === "invalid") {
      setNgWordsError(ngWords.error);
      return;
    }
    setNgWordsError(null);
    const repostHiddenUserIds = parseAndValidateUserIdLines(
      draft.globalRepostHiddenUserIdsText,
    );
    if (repostHiddenUserIds.kind === "invalid") {
      setRepostHiddenUserIdsError(repostHiddenUserIds.error);
      return;
    }
    setRepostHiddenUserIdsError(null);
    onApply(
      toGlobalSettingsPatch(draft, {
        ngWords: ngWords.values,
        repostHiddenUserIds: repostHiddenUserIds.values,
      }),
    );
    onClose();
  };

  const handleApplyColumnDefaults = () => {
    onApplyColumnDefaults(toColumnDefaults(draft));
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
                ngWordsError={ngWordsError}
                repostHiddenUserIdsError={repostHiddenUserIdsError}
              />

              <AppInfoSections
                onOpenOfficialSettings={onOpenOfficialSettings}
                onReloadAllWebviews={() => {
                  onReloadAllWebviews();
                  onClose();
                }}
                appVersion={appVersion}
                updateChecking={updateChecking}
                updateManualResult={updateManualResult}
                onCheckUpdate={onCheckUpdate}
                pendingDataDirectoryDeletionCount={
                  pendingDataDirectoryDeletionCount
                }
                retryingDataDirectoryDeletion={retryingDataDirectoryDeletion}
                dataDirectoryDeletionRetryResult={
                  dataDirectoryDeletionRetryResult
                }
                dataDirectoryDeletionRemainingCount={
                  dataDirectoryDeletionRemainingCount
                }
                onRetryDataDirectoryDeletion={handleRetryDataDirectoryDeletion}
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
                // WebView の作り直し完了を待ってから閉じる。dialogOpenRef が
                // 開いている間に作り直させることで、退避状態を維持したまま
                // プリセットのカラムを構築し、ダイアログを閉じた瞬間に
                // App 側の anyDialogOpen effect が通常座標へ再表示する。
                void onLoadPreset(id).then(() => onClose());
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
