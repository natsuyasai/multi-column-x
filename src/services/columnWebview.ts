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
import type { Column, ColumnSettings, GlobalSettings } from "../types";

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

/**
 * モバイルスワイプバー（ネイティブオーバーレイ）の表示状態を更新する（Android のみ実体動作）。
 * y/height はカラム WebView と同じ絶対座標系（mobileColumnLayout と同じ計算式）で渡す。
 */
export async function updateMobileSwipeBar(
  visible: boolean,
  y: number,
  height: number,
  opacity: number,
  darkTheme: boolean,
): Promise<void> {
  await invoke(IPC_COMMANDS.UPDATE_MOBILE_SWIPE_BAR, {
    visible,
    y,
    height,
    opacity,
    darkTheme,
  });
}

/**
 * モバイルスワイプバーの遷移確定フラッシュ演出をトリガーする（Android のみ実体動作）。
 * カラム遷移が実際に確定したとき（navigateColumn 側）にのみ呼ぶこと。
 */
export async function flashMobileSwipeBar(
  direction: "left" | "right",
): Promise<void> {
  await invoke(IPC_COMMANDS.FLASH_MOBILE_SWIPE_BAR, { direction });
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
  globalRepostHiddenUserIds: string[],
): Promise<void> {
  await evalInColumn(
    columnId,
    WEBVIEW_SCRIPTS.applyAreaVisibility(
      settings.hideHeaderEnabled,
      settings.hideTweetInputEnabled,
    ),
  );
  await evalInColumn(
    columnId,
    WEBVIEW_SCRIPTS.applyCustomCSS(settings.customCSS),
  );
  await evalInColumn(
    columnId,
    WEBVIEW_SCRIPTS.applyNgWords(
      settings.ngWords,
      globalNgWords,
      settings.repostHiddenUserIds ?? [],
      globalRepostHiddenUserIds,
    ),
  );
  await evalInColumn(
    columnId,
    WEBVIEW_SCRIPTS.applyWhitelist(
      settings.whitelistEnabled,
      settings.whitelistWords,
    ),
  );
  await evalInColumn(columnId, WEBVIEW_SCRIPTS.SCROLL_TOP_AND_RELOAD);
}

/**
 * 全体設定の patch から、全カラムへ送る applyNgWords スクリプト列を組み立てる。
 * ngWords / repostHiddenUserIds のどちらも含まない patch では空配列を返す。
 * 片方だけの patch のときは、もう一方を現在の全体設定から補う（空で上書きしない）。
 */
export function buildGlobalNgScripts(
  patch: Partial<GlobalSettings>,
  currentGlobal: GlobalSettings,
  columns: Column[],
): { columnId: string; script: string }[] {
  if (!("ngWords" in patch) && !("repostHiddenUserIds" in patch)) return [];
  const globalNgWords =
    ("ngWords" in patch ? patch.ngWords : currentGlobal.ngWords) ?? [];
  const globalRepostHiddenUserIds =
    ("repostHiddenUserIds" in patch
      ? patch.repostHiddenUserIds
      : currentGlobal.repostHiddenUserIds) ?? [];
  return columns.map((col) => ({
    columnId: col.id,
    script: WEBVIEW_SCRIPTS.applyNgWords(
      col.settings.ngWords,
      globalNgWords,
      col.settings.repostHiddenUserIds ?? [],
      globalRepostHiddenUserIds,
    ),
  }));
}
