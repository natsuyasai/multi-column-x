import type { DragEndEvent } from "@dnd-kit/core";
import React, { useState, useCallback, useMemo } from "react";
import {
  buildGroups,
  moveGroup,
  normalizeOrder,
  resolveGroupMove,
  type ColumnGroup,
} from "../../lib/columnOrder";
import { getPageTypeLabel, type Account, type Column } from "../../types";
import {
  assignToCell,
  findColumnAtCell,
  isAssignedWithin,
  setHeight,
  unassign,
  unassignBeyond,
} from "./columnLayoutDraft";
import {
  ColumnOrderList,
  GridPreview,
  HeightSettings,
  UnassignedList,
  type CellKey,
} from "./ColumnLayoutParts";
import styles from "./ColumnLayoutTab.module.scss";

interface ColumnLayoutTabProps {
  columns: Column[];
  accounts: Account[];
  onApply: (columns: Column[]) => void;
  onCancel: () => void;
  isMobile?: boolean;
}

function getColumnLabel(col: Column, accounts: Account[]): string {
  const account = accounts.find((a) => a.id === col.accountId);
  return (
    col.label || `${account?.label ?? col.accountId} - ${getPageTypeLabel(col)}`
  );
}

export const ColumnLayoutTab: React.FC<ColumnLayoutTabProps> = ({
  columns,
  accounts,
  onApply,
  onCancel,
  isMobile = false,
}) => {
  const [draft, setDraft] = useState<Column[]>(() =>
    normalizeOrder(columns.map((c) => ({ ...c }))),
  );

  // draft 変更は必ずここを通す（order の再正規化漏れを防ぐ）
  const updateDraft = useCallback((updater: (prev: Column[]) => Column[]) => {
    setDraft((prev) => normalizeOrder(updater(prev)));
  }, []);

  const groups = useMemo(() => buildGroups(draft), [draft]);

  const handleMoveGroupUp = useCallback((groupIdx: number) => {
    setDraft((prev) => moveGroup(prev, groupIdx, groupIdx - 1));
  }, []);

  const handleMoveGroupDown = useCallback((groupIdx: number) => {
    setDraft((prev) => moveGroup(prev, groupIdx, groupIdx + 1));
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    setDraft((prev) => {
      const move = resolveGroupMove(prev, String(active.id), String(over.id));
      return move ? moveGroup(prev, move.fromIdx, move.toIdx) : prev;
    });
  }, []);

  const [cols, setCols] = useState(() =>
    Math.max(...columns.map((c) => c.gridCol).filter((g) => g >= 1), 1),
  );
  const [selectedCellKey, setSelectedCellKey] = useState<CellKey | null>(null);
  const [pendingCell, setPendingCell] = useState<CellKey | null>(null);

  const assigned = draft.filter((c) => isAssignedWithin(c, cols));
  const unassigned = draft.filter((c) => !isAssignedWithin(c, cols));

  const selectedColumn = selectedCellKey
    ? (assigned.find(
        (c) =>
          c.gridRow === selectedCellKey.row &&
          c.gridCol === selectedCellKey.col,
      ) ?? null)
    : null;

  const handleCellClick = useCallback(
    (row: number, col: number) => {
      const colAtCell = findColumnAtCell(draft, row, col);
      if (colAtCell) {
        setSelectedCellKey({ row, col });
        setPendingCell(null);
      } else {
        setPendingCell({ row, col });
        setSelectedCellKey(null);
      }
    },
    [draft],
  );

  const handleAssign = useCallback(
    (columnId: string) => {
      if (!pendingCell) return;
      updateDraft((prev) => assignToCell(prev, columnId, pendingCell));
      setPendingCell(null);
    },
    [pendingCell, updateDraft],
  );

  const handleRemove = useCallback(
    (columnId: string) => {
      updateDraft((prev) => unassign(prev, columnId));
      setSelectedCellKey(null);
    },
    [updateDraft],
  );

  const handleHeightChange = useCallback(
    (
      columnId: string,
      mode: "auto" | "fixed",
      value?: number,
      unit?: "px" | "%",
    ) => {
      updateDraft((prev) => setHeight(prev, columnId, mode, value, unit));
    },
    [updateDraft],
  );

  const getLabel = (col: Column) => getColumnLabel(col, accounts);
  const getGroupLabel = (group: ColumnGroup) =>
    group.columns.map((c) => getLabel(c)).join(" / ");

  return (
    <div className={styles.container}>
      {!isMobile && (
        <>
          <div className={styles.gridSizeRow}>
            <span>列数:</span>
            <input
              type="number"
              className={styles.numberInput}
              min={1}
              value={cols}
              onChange={(e) => {
                const newCols = Math.max(1, Number(e.target.value));
                setCols(newCols);
                updateDraft((prev) => unassignBeyond(prev, newCols));
                setSelectedCellKey(null);
                setPendingCell(null);
              }}
            />
          </div>

          <div className={styles.body}>
            <GridPreview
              cols={cols}
              draft={draft}
              assigned={assigned}
              selectedCellKey={selectedCellKey}
              pendingCell={pendingCell}
              getLabel={getLabel}
              onCellClick={handleCellClick}
              onRemove={handleRemove}
            />

            <UnassignedList
              unassigned={unassigned}
              pendingCell={pendingCell}
              getLabel={getLabel}
              onAssign={handleAssign}
            />
          </div>

          {selectedColumn && (
            <HeightSettings
              column={selectedColumn}
              getLabel={getLabel}
              onHeightChange={handleHeightChange}
            />
          )}
        </>
      )}

      {isMobile && (
        <div
          className={styles.gridPreview}
          data-testid="grid-preview"
          style={{ display: "none" }}
        />
      )}

      <ColumnOrderList
        groups={groups}
        isMobile={isMobile}
        getGroupLabel={getGroupLabel}
        onMoveUp={handleMoveGroupUp}
        onMoveDown={handleMoveGroupDown}
        onDragEnd={handleDragEnd}
      />

      <div className={styles.actions}>
        <button className={styles.cancelBtn} onClick={onCancel}>
          キャンセル
        </button>
        <button className={styles.applyBtn} onClick={() => onApply(draft)}>
          適用
        </button>
      </div>
    </div>
  );
};
