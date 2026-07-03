// src/services/columnWebview.ts
// カラム WebView に対する Tauri IPC 呼び出しを集約するサービス層
import { invoke } from "@tauri-apps/api/core";
import {
  IPC_COMMANDS,
  WEBVIEW_LABELS,
  WEBVIEW_SCRIPTS,
} from "../constants/ipc";
import type { ColumnBounds } from "../lib/gridLayout";
import { logError } from "../lib/log";
import type { Column, ColumnSettings } from "../types";

/**
 * 作成に成功したカラム WebView の columnId 台帳。
 * プリセット読み込み等で store のカラムが差し替わった後でも、
 * 画面上に実在する WebView を確実に削除できるようにするために追跡する。
 */
const activeColumnWebviewIds = new Set<string>();

/** 作成済み（未削除）のカラム WebView の columnId 一覧を返す */
export function getActiveColumnWebviewIds(): string[] {
  return [...activeColumnWebviewIds];
}

/** カラム WebView を作成する */
export async function createColumnWebview(
  column: Column,
  dataDirectory: string,
  bounds: ColumnBounds,
): Promise<void> {
  await invoke(IPC_COMMANDS.CREATE_COLUMN_WEBVIEW, {
    args: { column, dataDirectory, ...bounds },
  });
  activeColumnWebviewIds.add(column.id);
}

/** カラム WebView の位置・サイズを更新する */
export async function resizeColumnWebview(
  columnId: string,
  bounds: ColumnBounds,
): Promise<void> {
  await invoke(IPC_COMMANDS.RESIZE_COLUMN_WEBVIEW, {
    bounds: { columnId, ...bounds },
  });
}

/** カラム WebView を削除する */
export async function removeColumnWebview(columnId: string): Promise<void> {
  try {
    await invoke(IPC_COMMANDS.REMOVE_COLUMN_WEBVIEW, { columnId });
  } finally {
    // 削除失敗の主因は「WebView が既に存在しない」ため、意図どおり追跡から外す
    activeColumnWebviewIds.delete(columnId);
  }
}

/** アクティブカラムのアカウントに Cookie を切り替える（Android のみ実体動作） */
export async function setColumnCookies(accountId: string): Promise<void> {
  await invoke(IPC_COMMANDS.SET_COLUMN_COOKIES, { accountId });
}

/** カラム WebView 内でスクリプトを評価する（失敗は握りつぶす） */
export async function evalInColumn(
  columnId: string,
  script: string,
): Promise<void> {
  await invoke(IPC_COMMANDS.EVAL_IN_WEBVIEW, {
    label: WEBVIEW_LABELS.column(columnId),
    script,
  }).catch(logError("evalInColumn"));
}

/** カラム設定変更時に必要な inject スクリプト一式を適用してリロードする */
export async function applyColumnSettingsScripts(
  columnId: string,
  settings: ColumnSettings,
  globalNgWords: string[],
): Promise<void> {
  await evalInColumn(
    columnId,
    WEBVIEW_SCRIPTS.applyAreaRemove(settings.areaRemoveEnabled),
  );
  await evalInColumn(
    columnId,
    WEBVIEW_SCRIPTS.applyCustomCSS(settings.customCSS),
  );
  await evalInColumn(
    columnId,
    WEBVIEW_SCRIPTS.applyNgWords(settings.ngWords, globalNgWords),
  );
  await evalInColumn(columnId, WEBVIEW_SCRIPTS.TRIGGER_RELOAD);
}
