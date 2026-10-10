import React, { useState } from "react";
import {
  currentPlatformName,
  isExtensionsSupported,
} from "@/lib/extensionsSupport";
import {
  parseAndValidateUserIdLines,
  parseAndValidateWordLines,
} from "@/lib/lineListValidation";
import { nextDraftOnSmallImageChange } from "@/lib/scrollRestoreSetting";
import type { ReplaceColumnsAndRecreate } from "@/services/backup";
import {
  addChromeExtension,
  addExtensionFromFolder,
  detectChromeExtensions,
  listExtensions,
  openExtensionPage,
  pickExtensionFolder,
  removeExtension,
  setExtensionEnabled,
} from "@/services/extensions";
import { useBackupFlow } from "../../hooks/useBackupFlow";
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
import { BackupTab } from "./BackupTab";
import { ColumnDefaultsSections } from "./ColumnDefaultsSections";
import { ColumnLayoutTab } from "./ColumnLayoutTab";
import { DisplaySettingsSection } from "./DisplaySettingsSection";
import { ExtensionsTab } from "./ExtensionsTab";
import {
  AndroidSettingsSections,
  FilterSettingsSections,
  PopupSettingsSection,
  VideoSettingsSection,
} from "./GeneralSettingsSections";
import {
  LinuxVideoPlaybackSection,
  type H264SettingsInfo,
} from "./LinuxVideoPlaybackSection";
import { PresetsTab } from "./PresetsTab";
import {
  createSettingsDraft,
  toColumnDefaults,
  toGlobalSettingsPatch,
  type SettingsDraft,
} from "./settingsDraft";
import { SettingsGroup } from "./SettingsGroup";

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
  /** バックアップ復元: 旧カラムの WebView 破棄 → ストア置換 → WebView 再生成 */
  onReplaceColumnsAndRecreate: ReplaceColumnsAndRecreate;
  /** 拡張機能の追加・削除・有効無効の変更に成功したとき（全カラムの再読込に使う） */
  onExtensionsChanged: () => void;
  /** 拡張機能のポップアップ / オプションを開くアカウント。決まらなければ null */
  extensionPageAccountId: string | null;
  appVersion: string;
  updateChecking: boolean;
  updateManualResult: "idle" | "none" | "error";
  onCheckUpdate: () => void;
  onOpenOfficialSettings: () => void;
  onClose: () => void;
  pendingDataDirectoryDeletionCount: number;
  onRetryDataDirectoryDeletion: () => Promise<{ remaining: number }>;
  /** Linux デスクトップか（動画再生設定セクションの表示条件） */
  isLinux?: boolean;
  /** アプリ起動時に読み込んだハードウェアデコード設定。未指定なら settings の値を使う */
  startupHardwareVideoDecodeEnabled?: boolean;
  /** H.264 有効化の状態と操作（AppImage のときのみ表示に使われる） */
  h264Setup?: H264SettingsInfo;
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
  onReplaceColumnsAndRecreate,
  onExtensionsChanged,
  extensionPageAccountId,
  appVersion,
  updateChecking,
  updateManualResult,
  onCheckUpdate,
  onOpenOfficialSettings,
  onClose,
  pendingDataDirectoryDeletionCount,
  onRetryDataDirectoryDeletion,
  isLinux = false,
  startupHardwareVideoDecodeEnabled,
  h264Setup,
}) => {
  const isMobile = useAppStore((s) => s.isMobile);
  const { savePreset, deletePreset } = useAppStore();
  useEscapeKey(onClose);
  const [activeTab, setActiveTab] = useState<
    "general" | "layout" | "presets" | "extensions" | "backup"
  >("general");
  const extensionsSupported = isExtensionsSupported(
    currentPlatformName(),
    isMobile,
  );
  const backup = useBackupFlow(onReplaceColumnsAndRecreate, onClose);

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
    setDraft((prev) =>
      key === "smallImageEnabled"
        ? nextDraftOnSmallImageChange(prev, value as boolean)
        : { ...prev, [key]: value },
    );
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
          {extensionsSupported && (
            <button
              className={`${styles.tab} ${activeTab === "extensions" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("extensions")}
            >
              拡張機能
            </button>
          )}
          <button
            className={`${styles.tab} ${activeTab === "backup" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("backup")}
          >
            バックアップ
          </button>
        </div>

        <div className={styles.tabContent}>
          {activeTab === "general" && (
            <form
              id="app-settings-form"
              onSubmit={handleSubmit}
              className={styles.form}
            >
              <SettingsGroup title="表示">
                <DisplaySettingsSection draft={draft} set={set} />
              </SettingsGroup>

              <SettingsGroup title="新規カラムの既定値">
                <ColumnDefaultsSections
                  draft={draft}
                  set={set}
                  onApplyToAllColumns={handleApplyColumnDefaults}
                />
              </SettingsGroup>

              <SettingsGroup title="閲覧・フィルタ">
                <FilterSettingsSections
                  draft={draft}
                  set={set}
                  ngWordsError={ngWordsError}
                  repostHiddenUserIdsError={repostHiddenUserIdsError}
                />
              </SettingsGroup>

              <SettingsGroup title="メディア">
                <VideoSettingsSection draft={draft} set={set} />
                {!isMobile && <PopupSettingsSection draft={draft} set={set} />}
                <LinuxVideoPlaybackSection
                  draft={draft}
                  set={set}
                  isLinux={isLinux && !isMobile}
                  startupHardwareVideoDecodeEnabled={
                    startupHardwareVideoDecodeEnabled ??
                    settings.hardwareVideoDecodeEnabled
                  }
                  h264={h264Setup}
                />
              </SettingsGroup>

              {isMobile && (
                <SettingsGroup title="Android専用">
                  <AndroidSettingsSections draft={draft} set={set} />
                </SettingsGroup>
              )}

              <SettingsGroup title="アプリ・メンテナンス">
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
                  onRetryDataDirectoryDeletion={
                    handleRetryDataDirectoryDeletion
                  }
                />
              </SettingsGroup>
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

          {extensionsSupported && activeTab === "extensions" && (
            <ExtensionsTab
              accountId={extensionPageAccountId}
              onExtensionsChanged={onExtensionsChanged}
              listExtensions={listExtensions}
              detectChromeExtensions={detectChromeExtensions}
              pickFolder={pickExtensionFolder}
              addFromFolder={addExtensionFromFolder}
              addChrome={addChromeExtension}
              setEnabled={setExtensionEnabled}
              remove={removeExtension}
              openPage={openExtensionPage}
            />
          )}

          {activeTab === "backup" && (
            <BackupTab
              accounts={backup.accounts}
              step={backup.step}
              content={backup.content}
              mapping={backup.mapping}
              busy={backup.busy}
              saveBlocked={backup.saveBlocked}
              message={backup.message}
              onExport={() => void backup.exportToFile()}
              onPickFile={() => void backup.pickFile()}
              onChangeMapping={backup.changeMapping}
              onCancel={backup.cancel}
              onProceedToConfirm={backup.proceedToConfirm}
              onBackToMapping={backup.backToMapping}
              onExecute={() => void backup.execute()}
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
