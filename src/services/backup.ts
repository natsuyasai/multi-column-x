// src/services/backup.ts
// バックアップの書き出し・読み込み・復元の IPC 呼び出し。
// 検証・退避・置換は Rust 側（commands/backup）が担い、ここは IPC と結果の正規化だけを行う。
import { invoke } from "@tauri-apps/api/core";
import { IPC_COMMANDS } from "@/constants/ipc";
import {
  buildRestorePayload,
  toBackupErrorInfo,
  validateBackupLists,
  type BackupAccount,
  type BackupContent,
  type BackupErrorInfo,
  type BackupGlobalSettings,
  type RestoreMapping,
} from "@/lib/backupRestore";
import { logError } from "@/lib/log";
import { migrateColumn, useAppStore } from "@/store/useAppStore";
import type { AppSettings, Column } from "@/types";

// read_backup が返すファイル内容。Rust 側は None を省略して出力するが、
// defaultAccountId だけは null で届くため undefined に正規化する。
interface RawBackupFile {
  accounts: Array<Omit<BackupAccount, "xUserId"> & { xUserId?: string | null }>;
  columns: Column[];
  globalSettings: Omit<BackupGlobalSettings, "defaultAccountId"> & {
    defaultAccountId?: string | null;
  };
}

/** Rust から届いたバックアップ内容を、フロントの型（undefined で未設定）へ正規化する */
export function normalizeBackupFile(raw: RawBackupFile): BackupContent {
  const { defaultAccountId, ...globalRest } = raw.globalSettings;
  const globalSettings: BackupGlobalSettings = {
    ...globalRest,
    presets: raw.globalSettings.presets.map((preset) => ({
      ...preset,
      columns: preset.columns.map(migrateColumn),
    })),
  };
  if (defaultAccountId != null) {
    globalSettings.defaultAccountId = defaultAccountId;
  }
  return {
    accounts: raw.accounts.map(({ xUserId, ...rest }) =>
      xUserId ? { ...rest, xUserId } : rest,
    ),
    columns: raw.columns.map(migrateColumn),
    globalSettings,
  };
}

/**
 * 現在の設定をバックアップファイルとして書き出す。保存先の選択をキャンセルしたら false。
 * 直前の変更が保存済みの状態を書き出すため、保留中の保存の完了を待ってから呼ぶ。
 */
export async function exportBackup(): Promise<boolean> {
  await useAppStore.getState().flushPendingSaves();
  return invoke<boolean>(IPC_COMMANDS.EXPORT_BACKUP);
}

/**
 * バックアップファイルを選んで検証する。選択をキャンセルしたら null。
 * 拒否理由は BackupErrorInfo 形式で reject される（toBackupErrorInfo で変換できる）。
 * NG ワード・リポスト非表示ユーザー ID は既存の基準で追加検証する。
 */
export async function readBackup(): Promise<BackupContent | null> {
  const raw = await invoke<RawBackupFile | null>(IPC_COMMANDS.READ_BACKUP);
  if (!raw) return null;
  const content = normalizeBackupFile(raw);
  const message = validateBackupLists(content);
  if (message) {
    throw { kind: "invalidField", reason: message };
  }
  return content;
}

/**
 * 紐づけに従って復元内容を作り、apply_restore（退避 → 置換 → アトミック保存）を呼ぶ。
 * 置換後の設定を返す。失敗時は reject され、既存の設定・カラム WebView は変わらない。
 */
export async function applyRestore(
  content: BackupContent,
  mapping: RestoreMapping,
): Promise<AppSettings> {
  const payload = buildRestorePayload(content, mapping, () =>
    crypto.randomUUID(),
  );
  return invoke<AppSettings>(IPC_COMMANDS.APPLY_RESTORE, { payload });
}

export type RestoreOutcome =
  | { status: "ok" }
  // 検証・退避・保存のいずれかに失敗。既存の設定・カラム WebView は変わっていない
  | { status: "rejected"; error: BackupErrorInfo }
  // 設定の置換と保存は成功したが、カラム WebView の再生成に失敗した
  | { status: "recreateFailed" };

/** 現在のカラム WebView を破棄し、apply でストアを更新してから WebView を作り直す処理 */
export type ReplaceColumnsAndRecreate = (apply: () => void) => Promise<void>;

/**
 * 復元の全体手順。
 * 1. 復元中フラグを立てる（自動保存・自動更新・アカウント追加／再認証を止める）
 * 2. 復元前に積まれた保存の完了を待つ
 * 3. apply_restore（Rust が退避 → 置換 → アトミック保存）。失敗したら旧 WebView に触れず終了
 * 4. 旧 WebView 破棄 → ストア置換（保存しない）→ WebView 再生成
 * 5. フラグを下ろす
 */
export async function performRestore(
  content: BackupContent,
  mapping: RestoreMapping,
  replaceColumnsAndRecreate: ReplaceColumnsAndRecreate,
): Promise<RestoreOutcome> {
  const store = useAppStore.getState();
  store.beginRestore();
  let outcome: RestoreOutcome;
  try {
    await store.flushPendingSaves();
    let restored: AppSettings;
    try {
      restored = await applyRestore(content, mapping);
    } catch (e) {
      outcome = { status: "rejected", error: toBackupErrorInfo(e) };
      return outcome;
    }
    let applied = false;
    const apply = () => {
      applied = true;
      useAppStore.getState().applyRestoredSettings(restored);
    };
    try {
      await replaceColumnsAndRecreate(apply);
      outcome = { status: "ok" };
    } catch (e) {
      logError("performRestore:recreateWebviews")(e);
      // ディスクは既に復元後の内容。メモリが古いまま残らないよう反映だけは確実に行う。
      if (!applied) apply();
      outcome = { status: "recreateFailed" };
    }
    return outcome;
  } finally {
    useAppStore.getState().finishRestore();
  }
}

interface DetectedUserId {
  accountId: string;
  xUserId: string | null;
}

/**
 * X ユーザー ID が未設定の既存アカウントについて、ログイン済みセッションの twid Cookie から
 * 後追いで取得し、取得できたものだけアカウントに保存する（紐づけ画面の自動候補用）。
 * 取得できなかったアカウントはそのまま（呼び出し側は再認証のヒントを表示する）。
 * 失敗しても復元の流れは止めない。
 */
export async function backfillXUserIds(): Promise<void> {
  const { accounts, columns } = useAppStore.getState();
  const targets = accounts
    .filter((a) => !a.xUserId)
    .flatMap((account) => {
      const column = columns.find(
        (c) => c.accountId === account.id && c.pageType !== "external",
      );
      return column ? [{ accountId: account.id, columnId: column.id }] : [];
    });
  if (targets.length === 0) return;

  try {
    const detected = await invoke<DetectedUserId[]>(
      IPC_COMMANDS.DETECT_ACCOUNT_USER_IDS,
      { targets },
    );
    for (const { accountId, xUserId } of detected) {
      if (xUserId) {
        useAppStore.getState().updateAccount(accountId, { xUserId });
      }
    }
  } catch (e) {
    logError("backfillXUserIds")(e);
  }
}
