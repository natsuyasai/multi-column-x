// src/hooks/useBackupFlow.ts
// バックアップタブの操作の流れ（書き出し／ファイル選択→紐づけ→確認→復元）を管理するフック。
// 検証・退避・置換は services/backup と Rust 側が担い、ここは画面状態と結果メッセージを扱う。
import { useCallback, useState } from "react";
import {
  describeBackupError,
  suggestMapping,
  toBackupErrorInfo,
  type BackupContent,
  type RestoreMapping,
} from "@/lib/backupRestore";
import {
  backfillXUserIds,
  exportBackup,
  performRestore,
  readBackup,
  type ReplaceColumnsAndRecreate,
} from "@/services/backup";
import { useAppStore } from "@/store/useAppStore";

export type BackupStep = "idle" | "mapping" | "confirm";

export interface BackupMessage {
  kind: "error" | "success" | "warning";
  text: string;
}

const EXPORT_DONE_MESSAGE = "バックアップを書き出しました。";
const NOT_CHANGED_SUFFIX = "既存のカラムと設定は変更されていません。";
const RECREATE_FAILED_MESSAGE =
  "設定の復元は完了しましたが、カラムの表示を作り直せませんでした。アプリを再起動して表示を確認してください。復元直前の設定は、アプリのデータフォルダ内の restore_snapshots フォルダ（appsettings-日時.json）に退避してあります。";

export function useBackupFlow(
  replaceColumnsAndRecreate: ReplaceColumnsAndRecreate,
  onRestored: () => void,
) {
  const accounts = useAppStore((s) => s.accounts);
  const saveBlocked = useAppStore((s) => s.settingsSaveBlocked);
  const [step, setStep] = useState<BackupStep>("idle");
  const [content, setContent] = useState<BackupContent | null>(null);
  const [mapping, setMapping] = useState<RestoreMapping>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<BackupMessage | null>(null);

  const reset = useCallback(() => {
    setStep("idle");
    setContent(null);
    setMapping({});
  }, []);

  const exportToFile = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      if (await exportBackup()) {
        setMessage({ kind: "success", text: EXPORT_DONE_MESSAGE });
      }
    } catch (e) {
      setMessage({
        kind: "error",
        text: describeBackupError(toBackupErrorInfo(e)),
      });
    } finally {
      setBusy(false);
    }
  }, []);

  const pickFile = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const picked = await readBackup();
      if (!picked) return;
      // 自動候補を効かせるため、X ユーザー ID 未設定の既存アカウントを可能な範囲で補完する
      await backfillXUserIds();
      setContent(picked);
      setMapping(
        suggestMapping(picked.accounts, useAppStore.getState().accounts),
      );
      setStep("mapping");
    } catch (e) {
      setMessage({
        kind: "error",
        text: `${describeBackupError(toBackupErrorInfo(e))}${NOT_CHANGED_SUFFIX}`,
      });
    } finally {
      setBusy(false);
    }
  }, []);

  const changeMapping = useCallback(
    (backupAccountId: string, targetAccountId: string | null) => {
      setMapping((prev) => ({ ...prev, [backupAccountId]: targetAccountId }));
    },
    [],
  );

  const cancel = useCallback(() => {
    reset();
    setMessage(null);
  }, [reset]);

  const proceedToConfirm = useCallback(() => {
    setMessage(null);
    setStep("confirm");
  }, []);

  const backToMapping = useCallback(() => {
    setMessage(null);
    setStep("mapping");
  }, []);

  const execute = useCallback(async () => {
    if (!content) return;
    setBusy(true);
    setMessage(null);
    try {
      const outcome = await performRestore(
        content,
        mapping,
        replaceColumnsAndRecreate,
      );
      switch (outcome.status) {
        case "ok":
          reset();
          onRestored();
          break;
        case "rejected":
          setMessage({
            kind: "error",
            text: `${describeBackupError(outcome.error)}${NOT_CHANGED_SUFFIX}`,
          });
          break;
        case "recreateFailed":
          reset();
          setMessage({ kind: "warning", text: RECREATE_FAILED_MESSAGE });
          break;
      }
    } finally {
      setBusy(false);
    }
  }, [content, mapping, replaceColumnsAndRecreate, reset, onRestored]);

  return {
    accounts,
    saveBlocked,
    step,
    content,
    mapping,
    busy,
    message,
    exportToFile,
    pickFile,
    changeMapping,
    cancel,
    proceedToConfirm,
    backToMapping,
    execute,
  };
}
