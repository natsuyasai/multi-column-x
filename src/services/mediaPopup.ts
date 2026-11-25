// src/services/mediaPopup.ts
// モバイルの複数カラム表示フラグ（メディアのポップアップ可否）をネイティブへ同期するサービス層
import { invoke } from "@tauri-apps/api/core";
import { IPC_COMMANDS } from "../constants/ipc";

let lastSent: boolean | undefined;

/**
 * 複数カラム表示かどうかをネイティブへ通知する。直前に送った値と同じなら送らない。
 * React リロードでモジュール状態が消えても、初回は必ず送る（Kotlin 側は同値なら何もしない）。
 */
export async function syncMobileMediaPopupActive(
  active: boolean,
): Promise<void> {
  if (lastSent === active) return;
  const previous = lastSent;
  lastSent = active;
  try {
    await invoke(IPC_COMMANDS.SET_MOBILE_MEDIA_POPUP_ACTIVE, { active });
  } catch (e) {
    lastSent = previous; // 失敗時は巻き戻して次回再送する
    throw e;
  }
}

/** テスト用: 最後に送った値の記憶を破棄する。 */
export function resetMobileMediaPopupSync(): void {
  lastSent = undefined;
}
