// ColumnLayoutTab の draft 操作に関する純粋関数（React 非依存）
import type { Column } from "@/types";

/** カラムがグリッド上に割当済み（1以上かつ cols 以内）かどうかを判定する */
export function isAssignedWithin(column: Column, cols: number): boolean {
  return column.gridRow >= 1 && column.gridCol >= 1 && column.gridCol <= cols;
}

/** 指定列（colNum）に割り当てられたカラムの最大gridRowを返す（最低1） */
export function rowCountForCol(columns: Column[], colNum: number): number {
  const assigned = columns.filter(
    (c) => c.gridCol === colNum && c.gridRow >= 1 && c.gridCol >= 1,
  );
  return Math.max(...assigned.map((c) => c.gridRow), 1);
}

/** 指定したidのカラムを指定セルへ割り当てる */
export function assignToCell(
  columns: Column[],
  columnId: string,
  cell: { row: number; col: number },
): Column[] {
  return columns.map((c) =>
    c.id === columnId ? { ...c, gridRow: cell.row, gridCol: cell.col } : c,
  );
}

/** 指定したidのカラムの割り当てを解除する（gridRow・gridColを0にする） */
export function unassign(columns: Column[], columnId: string): Column[] {
  return columns.map((c) =>
    c.id === columnId ? { ...c, gridRow: 0, gridCol: 0 } : c,
  );
}

/** gridColがcolsを超えるカラムを未割当（gridRow・gridCol=0）にする */
export function unassignBeyond(columns: Column[], cols: number): Column[] {
  return columns.map((c) =>
    c.gridCol > cols ? { ...c, gridRow: 0, gridCol: 0 } : c,
  );
}

/** 指定したidのカラムの高さ設定（heightMode / heightValue / heightUnit）を設定する */
export function setHeight(
  columns: Column[],
  columnId: string,
  mode: "auto" | "fixed",
  value?: number,
  unit?: "px" | "%",
): Column[] {
  return columns.map((c) =>
    c.id === columnId
      ? { ...c, heightMode: mode, heightValue: value, heightUnit: unit }
      : c,
  );
}

/** 指定したセル位置（row / col）に割り当てられているカラムを探す。無ければ null */
export function findColumnAtCell(
  columns: Column[],
  row: number,
  col: number,
): Column | null {
  return (
    columns.find(
      (c) =>
        c.gridRow === row &&
        c.gridCol === col &&
        c.gridRow >= 1 &&
        c.gridCol >= 1,
    ) ?? null
  );
}
