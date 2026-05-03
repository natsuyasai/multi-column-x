import React, { useState, useCallback } from "react";
import type { Account, Column } from "../../types";
import styles from "./ColumnLayoutTab.module.scss";

interface ColumnLayoutTabProps {
  columns: Column[];
  accounts: Account[];
  onApply: (columns: Column[]) => void;
  onCancel: () => void;
}

interface CellKey {
  row: number;
  col: number;
}

function getPageLabel(col: Column): string {
  switch (col.pageType) {
    case "home": return col.homeTabName ?? "ホーム";
    case "notifications": return "通知";
    case "search": return `検索: ${col.searchQuery ?? ""}`;
    case "list": return "リスト";
    case "custom": return "カスタム";
  }
}

export const ColumnLayoutTab: React.FC<ColumnLayoutTabProps> = ({
  columns,
  accounts,
  onApply,
  onCancel,
}) => {
  const [draft, setDraft] = useState<Column[]>(() =>
    columns.map((c) => ({ ...c }))
  );
  const [cols, setCols] = useState(() => Math.max(...columns.map((c) => c.gridCol).filter((g) => g >= 1), 1));
  const [selectedCellKey, setSelectedCellKey] = useState<CellKey | null>(null);
  const [pendingCell, setPendingCell] = useState<CellKey | null>(null);

  // 列ごとの行数（各列の最大gridRowを使用）
  const rowCountForCol = useCallback((colNum: number): number => {
    const assigned = draft.filter((c) => c.gridCol === colNum && c.gridRow >= 1 && c.gridCol >= 1);
    return Math.max(...assigned.map((c) => c.gridRow), 1);
  }, [draft]);

  const assigned = draft.filter((c) => c.gridRow >= 1 && c.gridCol >= 1 && c.gridCol <= cols);
  const unassigned = draft.filter((c) => !(c.gridRow >= 1 && c.gridCol >= 1 && c.gridCol <= cols));

  const selectedColumn = selectedCellKey
    ? assigned.find((c) => c.gridRow === selectedCellKey.row && c.gridCol === selectedCellKey.col) ?? null
    : null;

  const handleCellClick = useCallback((row: number, col: number) => {
    setDraft((prev) => {
      const colAtCell = prev.find(
        (c) => c.gridRow === row && c.gridCol === col && c.gridRow >= 1 && c.gridCol >= 1
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

  const handleAssign = useCallback((columnId: string) => {
    if (!pendingCell) return;
    setDraft((prev) =>
      prev.map((c) =>
        c.id === columnId
          ? { ...c, gridRow: pendingCell.row, gridCol: pendingCell.col }
          : c
      )
    );
    setPendingCell(null);
  }, [pendingCell]);

  const handleRemove = useCallback((columnId: string) => {
    setDraft((prev) =>
      prev.map((c) =>
        c.id === columnId ? { ...c, gridRow: 0, gridCol: 0 } : c
      )
    );
    setSelectedCellKey(null);
  }, []);

  const handleHeightChange = useCallback(
    (columnId: string, mode: "auto" | "fixed", value?: number, unit?: "px" | "%") => {
      setDraft((prev) =>
        prev.map((c) =>
          c.id === columnId
            ? { ...c, heightMode: mode, heightValue: value, heightUnit: unit }
            : c
        )
      );
    },
    []
  );

  const getColumnLabel = (col: Column) => {
    const account = accounts.find((a) => a.id === col.accountId);
    return col.label ?? `${account?.label ?? col.accountId} - ${getPageLabel(col)}`;
  };

  return (
    <div className={styles.container}>
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
            // 範囲外に出たカラムを未割当に戻す
            setDraft((prev) =>
              prev.map((c) => c.gridCol > newCols ? { ...c, gridRow: 0, gridCol: 0 } : c)
            );
            setSelectedCellKey(null);
            setPendingCell(null);
          }}
        />
      </div>

      <div className={styles.body}>
        <div className={styles.gridPreview}>
          {Array.from({ length: cols }, (_, cIdx) => {
            const colNum = cIdx + 1;
            const rows = rowCountForCol(colNum);
            return (
              <div key={cIdx} className={styles.gridColumn}>
                <div className={styles.gridColHeader}>列 {colNum}</div>
                <div className={styles.gridColCells}>
                  {Array.from({ length: rows }, (_, rIdx) => {
                    const r = rIdx + 1;
                    const colAtCell = assigned.find((col) => col.gridRow === r && col.gridCol === colNum) ?? null;
                    const isSelected = selectedCellKey?.row === r && selectedCellKey?.col === colNum;
                    const isPending = pendingCell?.row === r && pendingCell?.col === colNum;

                    if (colAtCell) {
                      return (
                        <div
                          key={rIdx}
                          className={`${styles.cell} ${styles.cellAssigned} ${isSelected ? styles.cellSelected : ""}`}
                          onClick={() => handleCellClick(r, colNum)}
                        >
                          <span className={styles.cellName}>{getColumnLabel(colAtCell)}</span>
                          <span className={styles.cellHeight}>
                            {colAtCell.heightMode === "fixed"
                              ? `${colAtCell.heightValue}${colAtCell.heightUnit}`
                              : "均等"}
                          </span>
                          <button
                            className={styles.removeBtn}
                            aria-label="割り当て解除"
                            onClick={(e) => { e.stopPropagation(); handleRemove(colAtCell.id); }}
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
                      // この列に新しい空行を追加（何もしない — グリッドは最大gridRowで自動伸長）
                      // 未割当カラムをここに割り当てるために pendingCell をセット
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
              <div className={styles.unassignedName}>{getColumnLabel(col)}</div>
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
            高さ設定 — {getColumnLabel(selectedColumn)}
          </div>
          <div className={styles.heightRow}>
            <label className={styles.radioLabel}>
              <input
                type="radio"
                name="heightMode"
                checked={selectedColumn.heightMode === "auto"}
                onChange={() => handleHeightChange(selectedColumn.id, "auto")}
              />
              均等（自動）
            </label>
            <label className={styles.radioLabel}>
              <input
                type="radio"
                name="heightMode"
                checked={selectedColumn.heightMode === "fixed"}
                onChange={() =>
                  handleHeightChange(selectedColumn.id, "fixed", selectedColumn.heightValue ?? 400, selectedColumn.heightUnit ?? "px")
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
                    handleHeightChange(selectedColumn.id, "fixed", Number(e.target.value), selectedColumn.heightUnit ?? "px")
                  }
                />
                <select
                  className={styles.unitSelect}
                  value={selectedColumn.heightUnit ?? "px"}
                  onChange={(e) =>
                    handleHeightChange(selectedColumn.id, "fixed", selectedColumn.heightValue ?? 400, e.target.value as "px" | "%")
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

      <div className={styles.actions}>
        <button className={styles.cancelBtn} onClick={onCancel}>キャンセル</button>
        <button className={styles.applyBtn} onClick={() => onApply(draft)}>適用</button>
      </div>
    </div>
  );
};
