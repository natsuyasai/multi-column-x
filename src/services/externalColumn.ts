// src/services/externalColumn.ts
// account に紐付かない external カラム（アカウント非依存の任意URLカラム）向けの
// データディレクトリ解決ロジックを集約するサービス層
import { invoke } from "@tauri-apps/api/core";
import { IPC_COMMANDS } from "../constants/ipc";
import type { Account, Column } from "../types";

/** カラムが external（アカウント非依存の任意URLカラム）かどうかを判定する */
export function isExternalColumn(column: Column): boolean {
  return column.pageType === "external";
}

/**
 * カラムに対応する WebView データディレクトリを解決する。
 * external カラムはアカウント非依存のため、カラムIDから導出した専用ディレクトリを
 * Rust側コマンドで都度取得する。それ以外のカラムは、紐付くアカウントの
 * dataDirectory をそのまま返す（該当アカウントが見つからない場合は undefined を返し、
 * 呼び出し側は従来どおりそのカラムの処理をスキップする）。
 */
export async function resolveColumnDataDirectory(
  column: Column,
  accounts: Account[],
): Promise<string | undefined> {
  if (isExternalColumn(column)) {
    return invoke<string>(IPC_COMMANDS.GET_EXTERNAL_COLUMN_DATA_DIRECTORY, {
      columnId: column.id,
    });
  }
  return accounts.find((a) => a.id === column.accountId)?.dataDirectory;
}
