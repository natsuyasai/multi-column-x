import React, { useCallback, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ModalDialog } from "@/components/ModalDialog/ModalDialog";
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
import { useAndroidBackHandler } from "../../hooks/useAndroidBackHandler";
import { useBackupFlow } from "../../hooks/useBackupFlow";
import { useUnsavedChangesGuard } from "../../hooks/useUnsavedChangesGuard";
import { useAppStore } from "../../store/useAppStore";
import type {
  GlobalSettings,
  Column,
  Account,
  ColumnSettings,
} from "../../types";
import { UnsavedChangesDialog } from "../UnsavedChangesDialog/UnsavedChangesDialog";
import {
  AboutAppSection,
  MaintenanceSections,
  OfficialSettingsSection,
} from "./AppInfoSections";
import styles from "./AppSettingsPanel.module.scss";
import { BackupTab } from "./BackupTab";
import { ColumnDefaultsSections } from "./ColumnDefaultsSections";
import { ColumnLayoutTab } from "./ColumnLayoutTab";
import { DisplaySettingsSection } from "./DisplaySettingsSection";
import { ExtensionsTab } from "./ExtensionsTab";
import {
  AndroidSettingsSections,
  ApiRateLimitSettingsSection,
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
  INITIAL_CATEGORY,
  VALIDATION_ERROR_CATEGORY,
  dirtyCategories,
  visibleCategories,
  type SettingsCategoryId,
} from "./settingsCategories";
import { SettingsCategoryList } from "./SettingsCategoryList";
import { SettingsCategoryNav } from "./SettingsCategoryNav";
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
  const { t } = useTranslation();
  const isMobile = useAppStore((s) => s.isMobile);
  const { savePreset, deletePreset } = useAppStore();
  const titleId = useId();
  const navId = useId();
  const extensionsSupported = isExtensionsSupported(
    currentPlatformName(),
    isMobile,
  );
  const backup = useBackupFlow(onReplaceColumnsAndRecreate, onClose);

  const categories = visibleCategories({ isMobile, extensionsSupported });
  const [activeCategory, setActiveCategory] =
    useState<SettingsCategoryId>(INITIAL_CATEGORY);
  /** Android の詳細表示中のカテゴリ。null ならカテゴリ一覧 */
  const [mobileDetail, setMobileDetail] = useState<SettingsCategoryId | null>(
    null,
  );
  // Android の戻る操作: 詳細画面ならカテゴリ一覧に戻す（一覧ではネイティブ側の既定動作に委ねる）
  useAndroidBackHandler(isMobile && mobileDetail !== null, () => {
    setMobileDetail(null);
    return true;
  });
  const [initialDraft] = useState<SettingsDraft>(() =>
    createSettingsDraft(settings),
  );
  const [draft, setDraft] = useState<SettingsDraft>(initialDraft);
  const dirty = useMemo(
    () => dirtyCategories(initialDraft, draft),
    [initialDraft, draft],
  );
  const guard = useUnsavedChangesGuard(dirty.size > 0, onClose);
  // 確認メッセージ自身が Esc を処理するため、表示中はパネル側の Esc を無効にする
  const noop = useCallback(() => {}, []);
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

  const hasValidationError =
    ngWordsError !== null || repostHiddenUserIdsError !== null;
  const errorCategory = hasValidationError ? VALIDATION_ERROR_CATEGORY : null;

  /** 入力エラーがあるときはエラーのあるカテゴリへ切り替える */
  const showValidationErrorCategory = () => {
    setActiveCategory(VALIDATION_ERROR_CATEGORY);
    if (isMobile) setMobileDetail(VALIDATION_ERROR_CATEGORY);
  };

  const handleApply = () => {
    const ngWords = parseAndValidateWordLines(draft.globalNgWordsText, t);
    if (ngWords.kind === "invalid") {
      setNgWordsError(ngWords.error);
      showValidationErrorCategory();
      return;
    }
    setNgWordsError(null);
    const repostHiddenUserIds = parseAndValidateUserIdLines(
      draft.globalRepostHiddenUserIdsText,
      t,
    );
    if (repostHiddenUserIds.kind === "invalid") {
      setRepostHiddenUserIdsError(repostHiddenUserIds.error);
      showValidationErrorCategory();
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

  const navItemId = (id: SettingsCategoryId) => `${navId}-nav-${id}`;
  const panelId = `${navId}-panel`;

  /** 一覧（Android）なら null。それ以外は表示中のカテゴリ */
  const shownCategory = isMobile ? mobileDetail : activeCategory;
  const shownDef = categories.find((c) => c.id === shownCategory);

  const renderCategory = (id: SettingsCategoryId): React.ReactNode => {
    switch (id) {
      case "display":
        return (
          <>
            <DisplaySettingsSection draft={draft} set={set} />
            <ApiRateLimitSettingsSection draft={draft} set={set} />
          </>
        );
      case "filter":
        return (
          <>
            <OfficialSettingsSection
              onOpenOfficialSettings={onOpenOfficialSettings}
            />
            <FilterSettingsSections
              draft={draft}
              set={set}
              ngWordsError={ngWordsError}
              repostHiddenUserIdsError={repostHiddenUserIdsError}
            />
          </>
        );
      case "media":
        return (
          <>
            <VideoSettingsSection draft={draft} set={set} />
            <PopupSettingsSection draft={draft} set={set} isMobile={isMobile} />
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
          </>
        );
      case "columnDefaults":
        return (
          <ColumnDefaultsSections
            draft={draft}
            set={set}
            onApplyToAllColumns={handleApplyColumnDefaults}
          />
        );
      case "android":
        return <AndroidSettingsSections draft={draft} set={set} />;
      case "layout":
        return (
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
        );
      case "presets":
        return (
          <PresetsTab
            presets={settings.presets ?? []}
            onSave={(name) => savePreset(name)}
            onLoad={(presetId) => {
              // WebView の作り直し完了を待ってから閉じる。dialogOpenRef が
              // 開いている間に作り直させることで、退避状態を維持したまま
              // プリセットのカラムを構築し、ダイアログを閉じた瞬間に
              // App 側の anyDialogOpen effect が通常座標へ再表示する。
              void onLoadPreset(presetId).then(() => onClose());
            }}
            onDelete={(presetId) => deletePreset(presetId)}
          />
        );
      case "extensions":
        return (
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
        );
      case "backup":
        return (
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
        );
      case "maintenance":
        return (
          <MaintenanceSections
            onReloadAllWebviews={() => {
              onReloadAllWebviews();
              onClose();
            }}
            pendingDataDirectoryDeletionCount={
              pendingDataDirectoryDeletionCount
            }
            retryingDataDirectoryDeletion={retryingDataDirectoryDeletion}
            dataDirectoryDeletionRetryResult={dataDirectoryDeletionRetryResult}
            dataDirectoryDeletionRemainingCount={
              dataDirectoryDeletionRemainingCount
            }
            onRetryDataDirectoryDeletion={handleRetryDataDirectoryDeletion}
          />
        );
      case "about":
        return (
          <AboutAppSection
            appVersion={appVersion}
            updateChecking={updateChecking}
            updateManualResult={updateManualResult}
            onCheckUpdate={onCheckUpdate}
          />
        );
    }
  };

  const renderPage = () => {
    if (!shownDef) return null;
    const body = renderCategory(shownDef.id);
    return shownDef.mode === "draft" ? (
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          handleApply();
        }}
      >
        {body}
      </form>
    ) : (
      body
    );
  };

  // 下書き対象のカテゴリ、または Android の一覧（未適用の変更・エラーがあるとき）だけ「キャンセル / 適用」を出す
  const showApplyFooter = shownDef
    ? shownDef.mode === "draft"
    : isMobile && (dirty.size > 0 || hasValidationError);

  const mobileDetailDef = isMobile ? shownDef : undefined;
  const headerTitle = mobileDetailDef
    ? t(`settings:panel.categories.${mobileDetailDef.id}.label`)
    : t("settings:panel.title");

  return (
    <ModalDialog
      className={styles.overlay}
      aria-labelledby={titleId}
      onEscape={guard.confirmOpen ? noop : guard.requestClose}
    >
      <div className={styles.panel}>
        <div className={styles.header}>
          <div className={styles.headerMain}>
            {mobileDetailDef && (
              <button
                type="button"
                className={styles.backBtn}
                onClick={() => setMobileDetail(null)}
                aria-label={t("settings:panel.actions.back")}
              >
                ‹
              </button>
            )}
            <h2 id={titleId} className={styles.title}>
              {headerTitle}
            </h2>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={guard.requestClose}
            aria-label={t("settings:panel.close")}
          >
            ✕
          </button>
        </div>

        {isMobile ? (
          <div className={styles.content}>
            {shownDef ? (
              renderPage()
            ) : (
              <SettingsCategoryList
                categories={categories}
                dirty={dirty}
                errorCategory={errorCategory}
                onOpen={setMobileDetail}
              />
            )}
          </div>
        ) : (
          <div className={styles.body}>
            <SettingsCategoryNav
              categories={categories}
              current={activeCategory}
              dirty={dirty}
              errorCategory={errorCategory}
              itemId={navItemId}
              onSelect={setActiveCategory}
            />
            <div
              className={styles.content}
              id={panelId}
              role="region"
              aria-labelledby={navItemId(activeCategory)}
            >
              {shownDef && (
                <h3 className={styles.pageTitle}>
                  {t(`settings:panel.categories.${shownDef.id}.label`)}
                </h3>
              )}
              {renderPage()}
            </div>
          </div>
        )}

        <div className={styles.actions}>
          {showApplyFooter ? (
            <>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={onClose}
              >
                {t("settings:panel.actions.cancel")}
              </button>
              <button
                type="button"
                className={styles.applyBtn}
                onClick={handleApply}
              >
                {t("settings:panel.actions.apply")}
              </button>
            </>
          ) : (
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={guard.requestClose}
            >
              {t("settings:panel.actions.close")}
            </button>
          )}
        </div>
      </div>
      {guard.confirmOpen && (
        <UnsavedChangesDialog
          onDiscard={guard.confirmDiscard}
          onBack={guard.cancelConfirm}
        />
      )}
    </ModalDialog>
  );
};
