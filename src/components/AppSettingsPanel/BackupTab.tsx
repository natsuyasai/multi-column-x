import React from "react";
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

export const NO_CREDENTIALS_NOTICE =
  "このバックアップにはログイン情報は含まれません。復元先で事前にログインしてください";
export const EXPORT_PRIVACY_NOTICE =
  "バックアップファイルにはアカウント名・NGワード・リポスト非表示ユーザーなどの個人情報が含まれます。共有・保管するときは取り扱いに注意してください。";
export const REAUTH_HINT =
  "Xユーザー IDが未取得のアカウントは自動で候補を選べません。該当アカウントを再認証すると自動候補が効くようになります。";
export const SAVE_BLOCKED_NOTICE =
  "設定を読み込めていないため、バックアップの読み込みと復元はできません。アプリを再起動してください。";
export const REPLACE_WARNING =
  "現在のカラムと設定（ウィンドウ位置を除く）はすべてバックアップの内容に置き換わります。アカウントは置き換わりません。復元直前の設定は自動で退避されます。";

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
            <h3 className={styles.sectionTitle}>復元の確認</h3>
            <p className={styles.summary}>
              復元されるカラム {summary.restore} 件 / スキップ {summary.skip} 件
            </p>
            <p className={`${styles.message} ${styles.warning}`}>
              {REPLACE_WARNING}
            </p>
            <p className={styles.note}>{NO_CREDENTIALS_NOTICE}</p>
            <div className={styles.buttonRow}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={onBackToMapping}
                disabled={busy}
              >
                戻る
              </button>
              <button
                type="button"
                className={styles.dangerBtn}
                onClick={onExecute}
                disabled={busy || saveBlocked}
              >
                置き換えて復元
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
        <h3 className={styles.sectionTitle}>バックアップを作成</h3>
        <p className={styles.note}>
          アカウント情報（名前・色）・カラム構成・設定を1つのファイルに書き出します。
        </p>
        <p className={styles.note}>{NO_CREDENTIALS_NOTICE}</p>
        <p className={`${styles.message} ${styles.warning}`}>
          {EXPORT_PRIVACY_NOTICE}
        </p>
        <div className={styles.buttonRow}>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={onExport}
            disabled={busy}
          >
            バックアップを書き出す
          </button>
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>バックアップから復元</h3>
        <p className={styles.note}>{NO_CREDENTIALS_NOTICE}</p>
        {saveBlocked && (
          <p role="alert" className={`${styles.message} ${styles.error}`}>
            {SAVE_BLOCKED_NOTICE}
          </p>
        )}
        <div className={styles.buttonRow}>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={onPickFile}
            disabled={busy || saveBlocked}
          >
            バックアップファイルを選択
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
  const columnCounts = countColumnsByBackupAccount(content.columns);
  const sharedTargets = findSharedTargets(mapping);
  const canExecute = canExecuteRestore(mapping);
  const hasTargetWithoutXUserId = accounts.some((a) => !a.xUserId);
  const labelOf = (id: string) =>
    accounts.find((a) => a.id === id)?.label ?? id;

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>アカウントの紐づけ</h3>
      <p className={styles.note}>
        バックアップ内のアカウントごとに、復元先のログイン済みアカウントを選んでください。
        「復元しない」を選んだアカウントのカラムは復元されません。
      </p>
      <p className={styles.note}>{NO_CREDENTIALS_NOTICE}</p>
      {accounts.length === 0 && (
        <p role="alert" className={`${styles.message} ${styles.error}`}>
          復元先にログイン済みのアカウントがありません。先にアカウントを追加してください。
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
              カラム {columnCounts[backup.backupAccountId] ?? 0} 件
            </span>
            <select
              className={styles.select}
              aria-label={`${backup.label} の復元先`}
              value={mapping[backup.backupAccountId] ?? ""}
              onChange={(e) =>
                onChangeMapping(backup.backupAccountId, e.target.value || null)
              }
              disabled={busy}
            >
              <option value="">復元しない</option>
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
          同じ復元先に複数のバックアップ内アカウントが割り当てられています（
          {sharedTargets.map(labelOf).join("、")}
          ）。意図した紐づけか確認してください。
        </p>
      )}
      {hasTargetWithoutXUserId && <p className={styles.note}>{REAUTH_HINT}</p>}
      {!canExecute && (
        <p role="status" className={`${styles.message} ${styles.warning}`}>
          紐づけが1件もないため復元できません。復元先を1つ以上選んでください。
        </p>
      )}
      <div className={styles.buttonRow}>
        <button
          type="button"
          className={styles.secondaryBtn}
          onClick={onCancel}
          disabled={busy}
        >
          キャンセル
        </button>
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={onProceed}
          disabled={busy || !canExecute}
        >
          確認へ進む
        </button>
      </div>
    </section>
  );
};
