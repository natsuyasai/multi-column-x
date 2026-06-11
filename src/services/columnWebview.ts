// src/services/columnWebview.ts
// カラム WebView に対する Tauri IPC 呼び出しを集約するサービス層
import { invoke } from "@tauri-apps/api/core";
import type { Column, ColumnSettings } from "../types";
import type { ColumnBounds } from "../lib/gridLayout";
import {
  IPC_COMMANDS,
  WEBVIEW_LABELS,
  WEBVIEW_SCRIPTS,
} from "../constants/ipc";

/** カラム WebView を作成する */
export async function createColumnWebview(
  column: Column,
  dataDirectory: string,
  bounds: ColumnBounds,
): Promise<void> {
  await invoke(IPC_COMMANDS.CREATE_COLUMN_WEBVIEW, {
    args: { column, dataDirectory, ...bounds },
  });
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
  await invoke(IPC_COMMANDS.REMOVE_COLUMN_WEBVIEW, { columnId });
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
  }).catch(console.error);
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
