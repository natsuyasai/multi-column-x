import type { Column, GlobalSettings } from "@/types";
import { columnBuildSignature } from "./columnBuildSignature";

// カラムID -> WebView 構築時点の埋め込み設定の署名。
// 永続化しない（アプリ再起動で全カラムが作り直されるため）。
const builtSignatures = new Map<string, string>();

/** カラム WebView の構築完了時に署名を記録する */
export function recordColumnBuild(columnId: string, signature: string): void {
  builtSignatures.set(columnId, signature);
}

/** カラム WebView の破棄時に記録を消す */
export function clearColumnBuild(columnId: string): void {
  builtSignatures.delete(columnId);
}

/**
 * 構築後に埋め込み設定が変わり、WebView が古い設定のままか。
 * 構築記録が無いカラムは判定できないため false を返す。
 */
export function isColumnBuildStale(
  column: Column,
  global: GlobalSettings,
): boolean {
  const recorded = builtSignatures.get(column.id);
  if (recorded === undefined) return false;
  return recorded !== columnBuildSignature(column, global);
}

/** テスト用: 記録をすべて消す */
export function resetColumnBuildRegistry(): void {
  builtSignatures.clear();
}
