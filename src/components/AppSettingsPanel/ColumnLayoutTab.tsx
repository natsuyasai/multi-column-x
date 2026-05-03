import React, { useState, useCallback } from "react";
import type { Column } from "../../types";
import styles from "./ColumnLayoutTab.module.scss";

interface ColumnLayoutTabProps {
  columns: Column[];
  onApply: (columns: Column[]) => void;
  onCancel: () => void;
}

interface CellKey {
  row: number;
  col: number;
}

export const ColumnLayoutTab: React.FC<ColumnLayoutTabProps> = ({
  columns,
  onApply,
  onCancel,
}) => {
  const [draft, setDraft] = useState<Column[]>(() =>
    columns.map((c) => ({ ...c }))
  );
  const [rows, setRows] = useState(() => Math.max(...columns.map((c) => c.gridRow), 1));
  const [cols, setCols] = useState(() => Math.max(...columns.map((c) => c.gridCol), 1));
  const [selectedCellKey, setSelectedCellKey] = useState<CellKey | null>(null);
  const [pendingCell, setPendingCell] = useState<CellKey | null>(null);

  const assigned = draft.filter((c) => c.gridRow >= 1 && c.gridCol >= 1 && c.gridRow <= rows && c.gridCol <= cols);
  const unassigned = draft.filter((c) => !(c.gridRow >= 1 && c.gridCol >= 1 && c.gridRow <= rows && c.gridCol <= cols));

  const selectedColumn = selectedCellKey
    ? assigned.find((c) => c.gridRow === selectedCellKey.row && c.gridCol === selectedCellKey.col) ?? null
    : null;

  const handleCellClick = useCallback((row: number, col: number) => {
    setDraft((prev) => {
      const colAtCell = prev.find((c) => c.gridRow === row && c.gridCol === col && c.gridRow >= 1 && c.gridCol >= 1) ?? null;
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

  const getColumnLabel = (col: Column) => col.label ?? col.pageType;

  return (
    <div className={styles.container}>
      <div className={styles.gridSizeRow}>
        <span>グリッドサイズ:</span>
        <span>行</span>
        <input
          type="number"
          className={styles.numberInput}
          min={1}
          value={rows}
          onChange={(e) => setRows(Math.max(1, Number(e.target.value)))}
        />
        <span>×</span>
        <span>列</span>
        <input
          type="number"
          className={styles.numberInput}
          min={1}
          value={cols}
          onChange={(e) => setCols(Math.max(1, Number(e.target.value)))}
        />
      </div>

      <div className={styles.body}>
        <div className={styles.gridPreview}>
          {Array.from({ length: rows }, (_, rIdx) => (
            <div key={rIdx} className={styles.gridRow}>
              {Array.from({ length: cols }, (_, cIdx) => {
                const r = rIdx + 1;
                const c = cIdx + 1;
                const colAtCell = assigned.find((col) => col.gridRow === r && col.gridCol === c) ?? null;
                const isSelected = selectedCellKey?.row === r && selectedCellKey?.col === c;
                const isPending = pendingCell?.row === r && pendingCell?.col === c;

                if (colAtCell) {
                  return (
                    <div
                      key={cIdx}
                      className={`${styles.cell} ${styles.cellAssigned} ${isSelected ? styles.cellSelected : ""}`}
                      onClick={() => handleCellClick(r, c)}
                    >
                      <span className={styles.cellLabel}>{r},{c}</span>
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
                    key={cIdx}
                    className={`${styles.cell} ${isPending ? styles.cellSelected : ""}`}
                    onClick={() => handleCellClick(r, c)}
                  >
                    +
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className={styles.unassigned}>
          <div className={styles.unassignedLabel}>未割当</div>
          {unassigned.map((col) => (
            <div
              key={col.id}
              className={`${styles.unassignedItem} ${pendingCell ? styles.unassignedItemSelected : ""}`}
              onClick={() => pendingCell && handleAssign(col.id)}
            >
              <div className={styles.unassignedName}>{getColumnLabel(col)}</div>
            </div>
          ))}
          {unassigned.length === 0 && (
            <div className={styles.emptyNotice}>なし</div>
          )}
        </div>
      </div>

      {selectedColumn && (
        <div className={styles.heightSettings}>
          <div className={styles.heightSettingsTitle}>高さ設定</div>
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
