// カラムの表示順序（order）とグリッド列グループに関する純粋ロジック（Tauri / React 非依存）
import type { Column } from "@/types";

export interface ColumnGroup {
  gridCol: number;
  columns: Column[];
}

/** gridCol ごとにカラムをまとめ、gridCol 昇順・グループ内は gridRow 昇順で返す */
export function buildGroups(columns: Column[]): ColumnGroup[] {
  const byCol = new Map<number, Column[]>();
  for (const col of columns) {
    if (col.gridCol >= 1 && col.gridRow >= 1) {
      if (!byCol.has(col.gridCol)) byCol.set(col.gridCol, []);
      byCol.get(col.gridCol)!.push(col);
    }
  }
  return [...byCol.entries()]
    .sort(([a], [b]) => a - b)
    .map(([gridCol, cols]) => ({
      gridCol,
      columns: [...cols].sort((a, b) => a.gridRow - b.gridRow),
    }));
}

/** order を gridCol 昇順 → gridRow 昇順で 0..n-1 に振り直す。未割当は既存 order 順で末尾 */
export function normalizeOrder(columns: Column[]): Column[] {
  const assigned = columns.filter((c) => c.gridCol >= 1 && c.gridRow >= 1);
  const unassigned = columns.filter((c) => !(c.gridCol >= 1 && c.gridRow >= 1));

  const sortedAssigned = [...assigned].sort((a, b) =>
    a.gridCol !== b.gridCol ? a.gridCol - b.gridCol : a.gridRow - b.gridRow,
  );

  const orderMap = new Map<string, number>();
  sortedAssigned.forEach((col, i) => orderMap.set(col.id, i));

  const sortedUnassigned = [...unassigned].sort((a, b) => a.order - b.order);
  sortedUnassigned.forEach((col, i) =>
    orderMap.set(col.id, sortedAssigned.length + i),
  );

  return columns.map((c) => ({ ...c, order: orderMap.get(c.id) ?? c.order }));
}

/**
 * 列グループを fromIdx から toIdx へ移動する。
 * gridCol の値集合（スロット）は保持し、並べ替え後の順序で再配分する
 * （飛び番の空き列を詰めないため）。order も再正規化する。
 */
export function moveGroup(
  columns: Column[],
  fromIdx: number,
  toIdx: number,
): Column[] {
  const groups = buildGroups(columns);
  if (fromIdx < 0 || fromIdx >= groups.length) return columns;
  if (toIdx < 0 || toIdx >= groups.length) return columns;
  if (fromIdx === toIdx) return columns;

  const slots = groups.map((g) => g.gridCol); // buildGroups が昇順を保証

  const reordered = [...groups];
  const [moved] = reordered.splice(fromIdx, 1);
  reordered.splice(toIdx, 0, moved);

  const newGridColById = new Map<string, number>();
  reordered.forEach((g, i) => {
    for (const col of g.columns) newGridColById.set(col.id, slots[i]);
  });

  return normalizeOrder(
    columns.map((c) => {
      const gc = newGridColById.get(c.id);
      return gc === undefined ? c : { ...c, gridCol: gc };
    }),
  );
}
