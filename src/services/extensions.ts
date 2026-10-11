// src/services/extensions.ts
// ブラウザ拡張機能の管理コマンド（Windows のみ対応）の IPC 呼び出しを集約するサービス層
import { invoke } from "@tauri-apps/api/core";
import { IPC_COMMANDS } from "@/constants/ipc";
import type { DetectResult, ExtensionEntry } from "@/types";

export type ExtensionPageKind = "popup" | "options";

/** 登録済みの拡張機能一覧を取得する */
export async function listExtensions(): Promise<ExtensionEntry[]> {
  return invoke<ExtensionEntry[]>(IPC_COMMANDS.LIST_EXTENSIONS);
}

/** Chrome にインストール済みの拡張機能を検出する */
export async function detectChromeExtensions(): Promise<DetectResult> {
  return invoke<DetectResult>(IPC_COMMANDS.DETECT_CHROME_EXTENSIONS);
}

/** 拡張機能フォルダの選択ダイアログを開く。キャンセルしたら null */
export async function pickExtensionFolder(): Promise<string | null> {
  return invoke<string | null>(IPC_COMMANDS.PICK_EXTENSION_FOLDER);
}

/** 展開済みの拡張機能フォルダを追加する */
export async function addExtensionFromFolder(
  path: string,
): Promise<ExtensionEntry> {
  return invoke<ExtensionEntry>(IPC_COMMANDS.ADD_EXTENSION_FROM_FOLDER, {
    path,
  });
}

/** Chrome で検出した拡張機能を追加する */
export async function addChromeExtension(
  chromeId: string,
): Promise<ExtensionEntry> {
  return invoke<ExtensionEntry>(IPC_COMMANDS.ADD_CHROME_EXTENSION, {
    chromeId,
  });
}

/** 拡張機能の有効・無効を切り替える */
export async function setExtensionEnabled(
  id: string,
  enabled: boolean,
): Promise<void> {
  await invoke(IPC_COMMANDS.SET_EXTENSION_ENABLED, { id, enabled });
}

/** 拡張機能を削除する */
export async function removeExtension(id: string): Promise<void> {
  await invoke(IPC_COMMANDS.REMOVE_EXTENSION, { id });
}

/** ポップアップ / オプションページを、指定アカウントのデータで別ウィンドウに開く */
export async function openExtensionPage(
  id: string,
  kind: ExtensionPageKind,
  accountId: string,
): Promise<void> {
  await invoke(IPC_COMMANDS.OPEN_EXTENSION_PAGE, { id, kind, accountId });
}
