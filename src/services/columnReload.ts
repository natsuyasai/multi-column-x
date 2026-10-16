// src/services/columnReload.ts
// ユーザーが手動で起こす再読み込みの共通処理。
// 最後の構築以降に埋め込み設定が変わったカラムだけ WebView を再構築し、
// 変更が無ければ従来どおり eval による軽量な再読み込みで済ませる。
import { isColumnBuildStale } from "@/lib/columnBuildRegistry";
import { useAppStore } from "@/store/useAppStore";
import { evalInColumn } from "./columnWebview";

/** 対象カラムの埋め込み設定が構築時から変わっているか（カラムが無ければ false） */
export function isColumnStaleNow(columnId: string): boolean {
  const { columns, globalSettings } = useAppStore.getState();
  const column = columns.find((c) => c.id === columnId);
  if (!column) return false;
  return isColumnBuildStale(column, globalSettings);
}

/**
 * stale なら WebView を再構築し、そうでなければ reloadScript を eval する。
 * recreateColumnWebview が未提供の場合は常に eval にフォールバックする。
 */
export async function reloadColumnOrRecreate(
  columnId: string,
  reloadScript: string,
  recreateColumnWebview?: (columnId: string) => Promise<void>,
): Promise<void> {
  if (recreateColumnWebview && isColumnStaleNow(columnId)) {
    await recreateColumnWebview(columnId);
    return;
  }
  await evalInColumn(columnId, reloadScript);
}
