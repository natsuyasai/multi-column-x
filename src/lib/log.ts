// tauri-plugin-log 経由でファイル/stdout にも残す軽量ロガー。
// listen 系の後始末など「失敗してもユーザー影響なし」の箇所は logError を使う。
import { error as pluginError } from "@tauri-apps/plugin-log";

/** 文脈名付きのエラーハンドラを返す。`.catch(logError("..."))` の形で使う。 */
export function logError(context: string): (e: unknown) => void {
  return (e: unknown) => {
    const msg = `[${context}] ${e instanceof Error ? e.message : String(e)}`;
    console.error(msg);
    pluginError(msg).catch(() => {});
  };
}
