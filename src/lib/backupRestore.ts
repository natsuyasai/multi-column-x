// src/lib/backupRestore.ts
// バックアップの復元ロジック（Tauri / React 非依存の純粋関数）。
// 紐づけの初期候補・実行可否・件数集計・accountId の差し替え・id 再採番・グリッド正規化・エラー文言を扱う。
import { normalizeOrder } from "@/lib/columnOrder";
import { validateNgWordLines } from "@/lib/ngWordPattern";
import { validateUserIdLine } from "@/lib/repostHiddenUserId";
import type { Account, Column, ColumnPreset, GlobalSettings } from "@/types";

/** バックアップに含まれる端末非依存の globalSettings（windowBounds と削除待ち一覧を除く） */
export type BackupGlobalSettings = Omit<
  GlobalSettings,
  "windowBounds" | "pendingDataDirectoryDeletions"
>;

export interface BackupAccount {
  backupAccountId: string;
  label: string;
  color: string;
  xUserId?: string;
}

/** read_backup が返す、検証済みのバックアップ内容 */
export interface BackupContent {
  accounts: BackupAccount[];
  columns: Column[];
  globalSettings: BackupGlobalSettings;
}

/** バックアップ内アカウント ID -> 復元先アカウント ID（null は「復元しない」） */
export type RestoreMapping = Record<string, string | null>;

/** apply_restore に渡す復元内容（紐づけ・再採番・グリッド正規化済み） */
export interface RestorePayload {
  columns: Column[];
  globalSettings: BackupGlobalSettings;
}

export interface RestoreSummary {
  restore: number;
  skip: number;
}

const isExternal = (column: Column) => column.pageType === "external";

/**
 * X ユーザー ID が双方に設定されていて一致する復元先アカウントを初期候補にする。
 * 片方でも未設定なら候補なし(null)。同じ ID の復元先が複数あれば一覧順で最初を選ぶ。
 */
export function suggestMapping(
  backupAccounts: BackupAccount[],
  targets: Account[],
): RestoreMapping {
  const mapping: RestoreMapping = {};
  for (const backup of backupAccounts) {
    const match = backup.xUserId
      ? targets.find((t) => t.xUserId && t.xUserId === backup.xUserId)
      : undefined;
    mapping[backup.backupAccountId] = match ? match.id : null;
  }
  return mapping;
}

/** 紐づけが 1 件以上あるときだけ復元を実行できる */
export function canExecuteRestore(mapping: RestoreMapping): boolean {
  return Object.values(mapping).some((target) => target != null);
}

/** 複数のバックアップ内アカウントが割り当てられた復元先 ID（警告表示用） */
export function findSharedTargets(mapping: RestoreMapping): string[] {
  const counts = new Map<string, number>();
  for (const target of Object.values(mapping)) {
    if (target == null) continue;
    counts.set(target, (counts.get(target) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id);
}

/** 紐づけ画面の各行に出す、バックアップ内アカウント別のカラム数（外部カラムは含めない） */
export function countColumnsByBackupAccount(
  columns: Column[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const column of columns) {
    if (isExternal(column)) continue;
    counts[column.accountId] = (counts[column.accountId] ?? 0) + 1;
  }
  return counts;
}

/** 確認画面の「復元されるカラム N 件 / スキップ M 件」。外部カラムは常に復元側 */
export function countRestoreSummary(
  columns: Column[],
  mapping: RestoreMapping,
): RestoreSummary {
  let restore = 0;
  let skip = 0;
  for (const column of columns) {
    if (isExternal(column) || mapping[column.accountId] != null) {
      restore += 1;
    } else {
      skip += 1;
    }
  }
  return { restore, skip };
}

/**
 * グリッド配置を詰める。
 * 1. gridCol を昇順に 1..k へ詰める  2. 各列内の gridRow を 1..m へ詰める  3. order を振り直す
 * 入力の並び順は保つ。
 */
export function normalizeGridPositions(columns: Column[]): Column[] {
  const colIndex = new Map<number, number>();
  [...new Set(columns.map((c) => c.gridCol))]
    .sort((a, b) => a - b)
    .forEach((col, i) => colIndex.set(col, i + 1));

  const rowIndex = new Map<string, number>();
  const byCol = new Map<number, Column[]>();
  for (const column of columns) {
    byCol.set(column.gridCol, [...(byCol.get(column.gridCol) ?? []), column]);
  }
  for (const group of byCol.values()) {
    [...group]
      .sort((a, b) => a.gridRow - b.gridRow)
      .forEach((column, i) => rowIndex.set(column.id, i + 1));
  }

  return normalizeOrder(
    columns.map((c) => ({
      ...c,
      gridCol: colIndex.get(c.gridCol) ?? c.gridCol,
      gridRow: rowIndex.get(c.id) ?? c.gridRow,
    })),
  );
}

/** 紐づけに従ってカラムを残し、accountId と id を差し替える。復元しないカラムは捨てる */
function remapColumns(
  columns: Column[],
  mapping: RestoreMapping,
  newId: () => string,
): Column[] {
  const result: Column[] = [];
  for (const column of columns) {
    const id = newId();
    if (isExternal(column)) {
      result.push({ ...column, id, accountId: id });
      continue;
    }
    const target = mapping[column.accountId];
    if (target == null) continue;
    result.push({ ...column, id, accountId: target });
  }
  return result;
}

/**
 * バックアップ内容と紐づけから、apply_restore に渡す復元内容を作る。
 * accountId（カラム・プリセット内カラム・defaultAccountId）を差し替え、
 * 全カラム（プリセット内を含む）の id を再採番し、グリッド配置を正規化する。
 * 入力は変更しない。
 */
export function buildRestorePayload(
  content: BackupContent,
  mapping: RestoreMapping,
  newId: () => string,
): RestorePayload {
  const columns = normalizeGridPositions(
    remapColumns(content.columns, mapping, newId),
  );

  const presets: ColumnPreset[] = [];
  for (const preset of content.globalSettings.presets) {
    const presetColumns = remapColumns(preset.columns, mapping, newId);
    if (presetColumns.length === 0) continue;
    presets.push({ ...preset, columns: normalizeGridPositions(presetColumns) });
  }

  const { defaultAccountId, ...rest } = content.globalSettings;
  const mappedDefault =
    defaultAccountId != null ? mapping[defaultAccountId] : undefined;
  const globalSettings: BackupGlobalSettings = { ...rest, presets };
  if (mappedDefault != null) {
    globalSettings.defaultAccountId = mappedDefault;
  }

  return { columns, globalSettings };
}

/** NG ワード（正規表現の構文）とリポスト非表示ユーザー ID を既存の基準で検証する。問題があればメッセージ */
export function validateBackupLists(content: BackupContent): string | null {
  const settingsList = [
    {
      ngWords: content.globalSettings.ngWords,
      userIds: content.globalSettings.repostHiddenUserIds,
    },
    ...[
      ...content.columns,
      ...content.globalSettings.presets.flatMap((p) => p.columns),
    ].map((c) => ({
      ngWords: c.settings.ngWords,
      userIds: c.settings.repostHiddenUserIds ?? [],
    })),
  ];
  for (const { ngWords, userIds } of settingsList) {
    const ngError = validateNgWordLines(ngWords);
    if (ngError) return ngError;
    for (const id of userIds) {
      const idError = validateUserIdLine(id);
      if (idError) return idError;
    }
  }
  return null;
}

/** Rust の BackupError（tag = "kind"）に対応するエラー情報 */
export type BackupErrorKind =
  | "brokenJson"
  | "formatMismatch"
  | "futureVersion"
  | "tooLarge"
  | "limitExceeded"
  | "invalidField"
  | "io"
  | "settingsUnreadable";

export interface BackupErrorInfo {
  kind: BackupErrorKind;
  message?: string;
  field?: string;
  reason?: string;
  found?: number | string | null;
  current?: number;
  limit?: number;
  size?: number;
}

const withDetail = (base: string, detail?: string) =>
  detail ? `${base}（${detail}）` : base;

/** エラー種別から利用者向け文言を作る。将来バージョンだけ「アプリを更新してください」を案内する */
export function describeBackupError(error: BackupErrorInfo): string {
  switch (error.kind) {
    case "futureVersion":
      return "このバックアップは新しいバージョンのアプリで作成されています。アプリを更新してください。";
    case "brokenJson":
      return "ファイルが壊れているか、JSON として読み取れません。";
    case "formatMismatch":
      return "Multi Column X のバックアップファイルではありません。";
    case "tooLarge":
      return "ファイルサイズが大きすぎるため読み込めません。";
    case "limitExceeded":
      return withDetail(
        "バックアップの件数または文字数が上限を超えています",
        error.field,
      );
    case "invalidField":
      return withDetail(
        "バックアップに不正な値が含まれています",
        [error.field, error.reason].filter(Boolean).join(": "),
      );
    case "io":
      return withDetail("ファイルの読み書きに失敗しました", error.message);
    case "settingsUnreadable":
      return "現在の設定を読み込めていないため、復元できません。アプリを再起動してください。";
  }
}

const BACKUP_ERROR_KINDS: readonly string[] = [
  "brokenJson",
  "formatMismatch",
  "futureVersion",
  "tooLarge",
  "limitExceeded",
  "invalidField",
  "io",
  "settingsUnreadable",
] satisfies BackupErrorKind[];

/**
 * invoke が reject した値を BackupErrorInfo に変換する。
 * Rust の BackupError（tag = "kind"）はそのまま通し、それ以外（文字列や Error）は io として扱う。
 */
export function toBackupErrorInfo(error: unknown): BackupErrorInfo {
  if (
    typeof error === "object" &&
    error !== null &&
    "kind" in error &&
    typeof error.kind === "string" &&
    BACKUP_ERROR_KINDS.includes(error.kind)
  ) {
    return error as BackupErrorInfo;
  }
  return {
    kind: "io",
    message: error instanceof Error ? error.message : String(error),
  };
}
