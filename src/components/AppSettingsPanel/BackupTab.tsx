import React from "react";
import { useTranslation } from "react-i18next";
import type { BackupMessage, BackupStep } from "@/hooks/useBackupFlow";
import {
  canExecuteRestore,
  countColumnsByBackupAccount,
  countRestoreSummary,
  findSharedTargets,
  type BackupContent,
  type RestoreMapping,
} from "@/lib/backupRestore";
import type { Account } from "../../types";
import styles from "./BackupTab.module.scss";

interface BackupTabProps {
  /** 復元先（このアプリにログイン済み）のアカウント */
  accounts: Account[];
  step: BackupStep;
  content: BackupContent | null;
  mapping: RestoreMapping;
  busy: boolean;
  /** 設定の読み込み失敗で保存が止まっている（読み込みと復元を無効にする） */
  saveBlocked: boolean;
  message: BackupMessage | null;
  onExport: () => void;
  onPickFile: () => void;
  onChangeMapping: (
    backupAccountId: string,
    targetAccountId: string | null,
  ) => void;
  onCancel: () => void;
  onProceedToConfirm: () => void;
  onBackToMapping: () => void;
  onExecute: () => void;
}

export const BackupTab: React.FC<BackupTabProps> = ({
  accounts,
  step,
  content,
  mapping,
  busy,
  saveBlocked,
  message,
  onExport,
  onPickFile,
  onChangeMapping,
  onCancel,
  onProceedToConfirm,
  onBackToMapping,
  onExecute,
}) => {
  const { t } = useTranslation();
  const messageBox = message && (
    <p
      role={message.kind === "error" ? "alert" : "status"}
      className={`${styles.message} ${styles[message.kind]}`}
    >
      {message.text}
    </p>
  );

  if (step !== "idle" && content) {
    const summary = countRestoreSummary(content.columns, mapping);
    return (
      <div className={styles.container}>
        {step === "mapping" && (
          <MappingStep
            accounts={accounts}
            content={content}
            mapping={mapping}
            busy={busy}
            onChangeMapping={onChangeMapping}
            onCancel={onCancel}
            onProceed={onProceedToConfirm}
          />
        )}
        {step === "confirm" && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>
              {t("settings:backup.confirm.title")}
            </h3>
            <p className={styles.summary}>
              {t("settings:backup.confirm.summary", {
                restore: summary.restore,
                skip: summary.skip,
              })}
            </p>
            <p className={`${styles.message} ${styles.warning}`}>
              {t("settings:backup.replaceWarning")}
            </p>
            <p className={styles.note}>{t("settings:backup.noCredentials")}</p>
            <div className={styles.buttonRow}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={onBackToMapping}
                disabled={busy}
              >
                {t("settings:backup.confirm.back")}
              </button>
              <button
                type="button"
                className={styles.dangerBtn}
                onClick={onExecute}
                disabled={busy || saveBlocked}
              >
                {t("settings:backup.confirm.execute")}
              </button>
            </div>
          </section>
        )}
        {messageBox}
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>
          {t("settings:backup.export.title")}
        </h3>
        <p className={styles.note}>{t("settings:backup.export.note")}</p>
        <p className={styles.note}>{t("settings:backup.noCredentials")}</p>
        <p className={`${styles.message} ${styles.warning}`}>
          {t("settings:backup.exportPrivacy")}
        </p>
        <div className={styles.buttonRow}>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={onExport}
            disabled={busy}
          >
            {t("settings:backup.export.button")}
          </button>
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>
          {t("settings:backup.restore.title")}
        </h3>
        <p className={styles.note}>{t("settings:backup.noCredentials")}</p>
        {saveBlocked && (
          <p role="alert" className={`${styles.message} ${styles.error}`}>
            {t("settings:backup.saveBlocked")}
          </p>
        )}
        <div className={styles.buttonRow}>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={onPickFile}
            disabled={busy || saveBlocked}
          >
            {t("settings:backup.restore.pickFile")}
          </button>
        </div>
      </section>
      {messageBox}
    </div>
  );
};

interface MappingStepProps {
  accounts: Account[];
  content: BackupContent;
  mapping: RestoreMapping;
  busy: boolean;
  onChangeMapping: BackupTabProps["onChangeMapping"];
  onCancel: () => void;
  onProceed: () => void;
}

const MappingStep: React.FC<MappingStepProps> = ({
  accounts,
  content,
  mapping,
  busy,
  onChangeMapping,
  onCancel,
  onProceed,
}) => {
  const { t } = useTranslation();
  const columnCounts = countColumnsByBackupAccount(content.columns);
  const sharedTargets = findSharedTargets(mapping);
  const canExecute = canExecuteRestore(mapping);
  const hasTargetWithoutXUserId = accounts.some((a) => !a.xUserId);
  const labelOf = (id: string) =>
    accounts.find((a) => a.id === id)?.label ?? id;

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>
        {t("settings:backup.mapping.title")}
      </h3>
      <p className={styles.note}>{t("settings:backup.mapping.note")}</p>
      <p className={styles.note}>{t("settings:backup.noCredentials")}</p>
      {accounts.length === 0 && (
        <p role="alert" className={`${styles.message} ${styles.error}`}>
          {t("settings:backup.mapping.noTargets")}
        </p>
      )}
      <ul className={styles.mappingList}>
        {content.accounts.map((backup) => (
          <li key={backup.backupAccountId} className={styles.mappingRow}>
            <span
              className={styles.colorDot}
              style={{ backgroundColor: backup.color }}
              aria-hidden="true"
            />
            <span className={styles.accountLabel}>{backup.label}</span>
            <span className={styles.columnCount}>
              {t("settings:backup.mapping.columnCount", {
                count: columnCounts[backup.backupAccountId] ?? 0,
              })}
            </span>
            <select
              className={styles.select}
              aria-label={t("settings:backup.mapping.targetLabel", {
                name: backup.label,
              })}
              value={mapping[backup.backupAccountId] ?? ""}
              onChange={(e) =>
                onChangeMapping(backup.backupAccountId, e.target.value || null)
              }
              disabled={busy}
            >
              <option value="">
                {t("settings:backup.mapping.skipOption")}
              </option>
              {accounts.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.label}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
      {sharedTargets.length > 0 && (
        <p role="status" className={`${styles.message} ${styles.warning}`}>
          {t("settings:backup.mapping.shared", {
            names: sharedTargets
              .map(labelOf)
              .join(t("settings:backup.mapping.nameSeparator")),
          })}
        </p>
      )}
      {hasTargetWithoutXUserId && (
        <p className={styles.note}>{t("settings:backup.reauthHint")}</p>
      )}
      {!canExecute && (
        <p role="status" className={`${styles.message} ${styles.warning}`}>
          {t("settings:backup.mapping.none")}
        </p>
      )}
      <div className={styles.buttonRow}>
        <button
          type="button"
          className={styles.secondaryBtn}
          onClick={onCancel}
          disabled={busy}
        >
          {t("settings:panel.actions.cancel")}
        </button>
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={onProceed}
          disabled={busy || !canExecute}
        >
          {t("settings:backup.mapping.proceed")}
        </button>
      </div>
    </section>
  );
};
