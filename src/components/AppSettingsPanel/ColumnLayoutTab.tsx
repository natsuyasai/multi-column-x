import React, { useState, useCallback, useMemo } from "react";
import type { Account, Column } from "../../types";
import styles from "./ColumnLayoutTab.module.scss";

interface ColumnLayoutTabProps {
  columns: Column[];
  accounts: Account[];
  onApply: (columns: Column[]) => void;
  onCancel: () => void;
  isMobile?: boolean;
}

interface CellKey {
  row: number;
  col: number;
}

interface ColumnGroup {
  gridCol: number;
  columns: Column[];
}

function getPageLabel(col: Column): string {
  switch (col.pageType) {
    case "home":
      return col.homeTabName ?? "ホーム";
    case "notifications":
      return "通知";
    case "search":
      return `検索: ${col.searchQuery ?? ""}`;
    case "list":
      return "リスト";
    case "custom":
      return "カスタム";
  }
}

function getColumnLabel(col: Column, accounts: Account[]): string {
  const account = accounts.find((a) => a.id === col.accountId);
  return (
    col.label ?? `${account?.label ?? col.accountId} - ${getPageLabel(col)}`
  );
}

function buildGroups(columns: Column[]): ColumnGroup[] {
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

function normalizeOrder(columns: Column[]): Column[] {
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

export const ColumnLayoutTab: React.FC<ColumnLayoutTabProps> = ({
  columns,
  accounts,
  onApply,
  onCancel,
  isMobile = false,
}) => {
  const [draft, setDraft] = useState<Column[]>(() =>
    columns.map((c) => ({ ...c })),
  );

  const groups = useMemo(() => buildGroups(draft), [draft]);

  const handleMoveGroupUp = useCallback((groupIdx: number) => {
    setDraft((prev) => {
      const gs = buildGroups(prev);
      if (groupIdx <= 0 || groupIdx >= gs.length) return prev;

      const groupAbove = gs[groupIdx - 1];
      const groupCurrent = gs[groupIdx];
      const aboveGridCol = groupAbove.gridCol;
      const currentGridCol = groupCurrent.gridCol;
      const aboveIds = new Set(groupAbove.columns.map((c) => c.id));
      const currentIds = new Set(groupCurrent.columns.map((c) => c.id));

      const updated = prev.map((c) => {
        if (aboveIds.has(c.id)) return { ...c, gridCol: currentGridCol };
        if (currentIds.has(c.id)) return { ...c, gridCol: aboveGridCol };
        return c;
      });
      return normalizeOrder(updated);
    });
  }, []);

  const handleMoveGroupDown = useCallback((groupIdx: number) => {
    setDraft((prev) => {
      const gs = buildGroups(prev);
      if (groupIdx < 0 || groupIdx >= gs.length - 1) return prev;

      const groupCurrent = gs[groupIdx];
      const groupBelow = gs[groupIdx + 1];
      const currentGridCol = groupCurrent.gridCol;
      const belowGridCol = groupBelow.gridCol;
      const currentIds = new Set(groupCurrent.columns.map((c) => c.id));
      const belowIds = new Set(groupBelow.columns.map((c) => c.id));

      const updated = prev.map((c) => {
        if (currentIds.has(c.id)) return { ...c, gridCol: belowGridCol };
        if (belowIds.has(c.id)) return { ...c, gridCol: currentGridCol };
        return c;
      });
      return normalizeOrder(updated);
    });
  }, []);

  const [cols, setCols] = useState(() =>
    Math.max(...columns.map((c) => c.gridCol).filter((g) => g >= 1), 1),
  );
  const [selectedCellKey, setSelectedCellKey] = useState<CellKey | null>(null);
  const [pendingCell, setPendingCell] = useState<CellKey | null>(null);

  const rowCountForCol = useCallback(
    (colNum: number): number => {
      const assigned = draft.filter(
        (c) => c.gridCol === colNum && c.gridRow >= 1 && c.gridCol >= 1,
      );
      return Math.max(...assigned.map((c) => c.gridRow), 1);
    },
    [draft],
  );

  const assigned = draft.filter(
    (c) => c.gridRow >= 1 && c.gridCol >= 1 && c.gridCol <= cols,
  );
  const unassigned = draft.filter(
    (c) => !(c.gridRow >= 1 && c.gridCol >= 1 && c.gridCol <= cols),
  );

  const selectedColumn = selectedCellKey
    ? (assigned.find(
        (c) =>
          c.gridRow === selectedCellKey.row &&
          c.gridCol === selectedCellKey.col,
      ) ?? null)
    : null;

  const handleCellClick = useCallback((row: number, col: number) => {
    setDraft((prev) => {
      const colAtCell =
        prev.find(
          (c) =>
            c.gridRow === row &&
            c.gridCol === col &&
            c.gridRow >= 1 &&
            c.gridCol >= 1,
        ) ?? null;
      if (colAtCell) {
        setSelectedCellKey({ row, col });
        setPendingCell(null);
      } else {
        setPendingCell({ row, col });
        setSelectedCellKey(null);
      }
      return prev;
    });
  }, []);

  const handleAssign = useCallback(
    (columnId: string) => {
      if (!pendingCell) return;
      setDraft((prev) =>
        prev.map((c) =>
          c.id === columnId
            ? { ...c, gridRow: pendingCell.row, gridCol: pendingCell.col }
            : c,
        ),
      );
      setPendingCell(null);
    },
    [pendingCell],
  );

  const handleRemove = useCallback((columnId: string) => {
    setDraft((prev) =>
      prev.map((c) =>
        c.id === columnId ? { ...c, gridRow: 0, gridCol: 0 } : c,
      ),
    );
    setSelectedCellKey(null);
  }, []);

  const handleHeightChange = useCallback(
    (
      columnId: string,
      mode: "auto" | "fixed",
      value?: number,
      unit?: "px" | "%",
    ) => {
      setDraft((prev) =>
        prev.map((c) =>
          c.id === columnId
            ? { ...c, heightMode: mode, heightValue: value, heightUnit: unit }
            : c,
        ),
      );
    },
    [],
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
                setDraft((prev) =>
                  prev.map((c) =>
                    c.gridCol > newCols ? { ...c, gridRow: 0, gridCol: 0 } : c,
                  ),
                );
                setSelectedCellKey(null);
                setPendingCell(null);
              }}
            />
          </div>

          <div className={styles.body}>
            <div className={styles.gridPreview} data-testid="grid-preview">
              {Array.from({ length: cols }, (_, cIdx) => {
                const colNum = cIdx + 1;
                const rows = rowCountForCol(colNum);
                return (
                  <div key={cIdx} className={styles.gridColumn}>
                    <div className={styles.gridColHeader}>列 {colNum}</div>
                    <div className={styles.gridColCells}>
                      {Array.from({ length: rows }, (_, rIdx) => {
                        const r = rIdx + 1;
                        const colAtCell =
                          assigned.find(
                            (col) =>
                              col.gridRow === r && col.gridCol === colNum,
                          ) ?? null;
                        const isSelected =
                          selectedCellKey?.row === r &&
                          selectedCellKey?.col === colNum;
                        const isPending =
                          pendingCell?.row === r && pendingCell?.col === colNum;

                        if (colAtCell) {
                          return (
                            <div
                              key={rIdx}
                              className={`${styles.cell} ${styles.cellAssigned} ${isSelected ? styles.cellSelected : ""}`}
                              onClick={() => handleCellClick(r, colNum)}
                            >
                              <span className={styles.cellName}>
                                {getLabel(colAtCell)}
                              </span>
                              <span className={styles.cellHeight}>
                                {colAtCell.heightMode === "fixed"
                                  ? `${colAtCell.heightValue}${colAtCell.heightUnit}`
                                  : "均等"}
                              </span>
                              <button
                                className={styles.removeBtn}
                                aria-label="割り当て解除"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemove(colAtCell.id);
                                }}
                              >
                                ×
                              </button>
                            </div>
                          );
                        }
                        return (
                          <div
                            key={rIdx}
                            className={`${styles.cell} ${isPending ? styles.cellPending : ""}`}
                            onClick={() => handleCellClick(r, colNum)}
                          >
                            {pendingCell ? "← ここに配置" : "+"}
                          </div>
                        );
                      })}
                      <button
                        className={styles.addRowBtn}
                        onClick={() => {
                          const newRow = rows + 1;
                          setPendingCell({ row: newRow, col: colNum });
                          setSelectedCellKey(null);
                        }}
                      >
                        + 行を追加
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className={styles.unassigned}>
              <div className={styles.unassignedLabel}>未割当</div>
              {unassigned.map((col) => (
                <div
                  key={col.id}
                  className={`${styles.unassignedItem} ${pendingCell ? styles.unassignedItemActive : ""}`}
                  onClick={() => pendingCell && handleAssign(col.id)}
                >
                  <div className={styles.unassignedName}>{getLabel(col)}</div>
                </div>
              ))}
              {unassigned.length === 0 && (
                <div className={styles.emptyNotice}>なし</div>
              )}
              {pendingCell && (
                <div className={styles.pendingHint}>
                  クリックして列 {pendingCell.col} の行 {pendingCell.row} に配置
                </div>
              )}
            </div>
          </div>

          {selectedColumn && (
            <div className={styles.heightSettings}>
              <div className={styles.heightSettingsTitle}>
                高さ設定 — {getLabel(selectedColumn)}
              </div>
              <div className={styles.heightRow}>
                <label className={styles.radioLabel}>
                  <input
                    type="radio"
                    name="heightMode"
                    checked={selectedColumn.heightMode === "auto"}
                    onChange={() =>
                      handleHeightChange(selectedColumn.id, "auto")
                    }
                  />
                  均等（自動）
                </label>
                <label className={styles.radioLabel}>
                  <input
                    type="radio"
                    name="heightMode"
                    checked={selectedColumn.heightMode === "fixed"}
                    onChange={() =>
                      handleHeightChange(
                        selectedColumn.id,
                        "fixed",
                        selectedColumn.heightValue ?? 400,
                        selectedColumn.heightUnit ?? "px",
                      )
                    }
                  />
                  固定:
                </label>
                {selectedColumn.heightMode === "fixed" && (
                  <div className={styles.fixedInputGroup}>
                    <input
                      type="number"
                      className={styles.numberInput}
                      min={1}
                      value={selectedColumn.heightValue ?? 400}
                      onChange={(e) =>
                        handleHeightChange(
                          selectedColumn.id,
                          "fixed",
                          Number(e.target.value),
                          selectedColumn.heightUnit ?? "px",
                        )
                      }
                    />
                    <select
                      className={styles.unitSelect}
                      value={selectedColumn.heightUnit ?? "px"}
                      onChange={(e) =>
                        handleHeightChange(
                          selectedColumn.id,
                          "fixed",
                          selectedColumn.heightValue ?? 400,
                          e.target.value as "px" | "%",
                        )
                      }
                    >
                      <option value="px">px</option>
                      <option value="%">%</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
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

      <div className={styles.orderSection}>
        <div className={styles.orderLabel}>表示順序</div>
        <ul className={styles.orderList} data-testid="order-list">
          {groups.map((group, idx) => (
            <li key={group.gridCol} className={styles.orderItem}>
              <span className={styles.orderItemName}>
                {getGroupLabel(group)}
              </span>
              <div className={styles.orderBtns}>
                <button
                  className={styles.orderBtn}
                  aria-label="上へ"
                  disabled={idx === 0}
                  onClick={() => handleMoveGroupUp(idx)}
                >
                  ▲
                </button>
                <button
                  className={styles.orderBtn}
                  aria-label="下へ"
                  disabled={idx === groups.length - 1}
                  onClick={() => handleMoveGroupDown(idx)}
                >
                  ▼
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

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
