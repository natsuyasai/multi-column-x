import type { Column } from "@/types";

/** 自動更新の対象にできるカラムか。external（外部サイト）と list（リスト詳細）は対象外。 */
export function isAutoReloadSupported(
  column: Pick<Column, "pageType">,
): boolean {
  return column.pageType !== "external" && column.pageType !== "list";
}
