import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  restrictToParentElement,
  restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import React, { useState, useCallback, useMemo } from "react";
import {
  buildGroups,
  moveGroup,
  normalizeOrder,
  type ColumnGroup,
} from "../../lib/columnOrder";
import { getPageTypeLabel, type Account, type Column } from "../../types";
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

function getColumnLabel(col: Column, accounts: Account[]): string {
  const account = accounts.find((a) => a.id === col.accountId);
  return (
    col.label ?? `${account?.label ?? col.accountId} - ${getPageTypeLabel(col)}`
  );
}

interface SortableOrderItemProps {
  id: string;
  label: string;
  isFirst: boolean;
  isLast: boolean;
  isMobile: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

const SortableOrderItem: React.FC<SortableOrderItemProps> = ({
  id,
  label,
  isFirst,
  isLast,
  isMobile,
  onMoveUp,
  onMoveDown,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const btnClass = `${styles.orderBtn}${isMobile ? ` ${styles.orderBtnMobile}` : ""}`;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`${styles.orderItem}${isMobile ? ` ${styles.orderItemMobile}` : ""}${isDragging ? ` ${styles.orderItemDragging}` : ""}`}
    >
      <button
        type="button"
        className={`${styles.dragHandle}${isMobile ? ` ${styles.dragHandleMobile}` : ""}`}
        aria-label="ドラッグして並び替え"
        title="ドラッグして並び替え"
        {...attributes}
        {...listeners}
      >
        ≡
      </button>
      <span className={styles.orderItemName}>{label}</span>
      <div className={styles.orderBtns}>
        <button
          type="button"
          className={btnClass}
          aria-label="上へ"
          disabled={isFirst}
          onClick={onMoveUp}
        >
          ▲
        </button>
        <button
          type="button"
          className={btnClass}
          aria-label="下へ"
          disabled={isLast}
          onClick={onMoveDown}
        >
          ▼
        </button>
      </div>
    </li>
  );
};

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

  const sensors = useSensors(
    // 8px 動かすまでドラッグ開始しない → ▲▼ボタンのクリックと競合しない
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setDraft((prev) => {
      const gs = buildGroups(prev);
      const from = gs.findIndex((g) => g.columns[0].id === active.id);
      const to = gs.findIndex((g) => g.columns[0].id === over.id);
      if (from < 0 || to < 0) return prev;
      return moveGroup(prev, from, to);
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
    // ここは読み取り専用（prevをそのまま返す）なので updateDraft を通さない。
    // 通すと毎回新しい配列が生成され無駄な再レンダリングになる
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
      updateDraft((prev) =>
        prev.map((c) =>
          c.id === columnId
            ? { ...c, gridRow: pendingCell.row, gridCol: pendingCell.col }
            : c,
        ),
      );
      setPendingCell(null);
    },
    [pendingCell, updateDraft],
  );

  const handleRemove = useCallback(
    (columnId: string) => {
      updateDraft((prev) =>
        prev.map((c) =>
          c.id === columnId ? { ...c, gridRow: 0, gridCol: 0 } : c,
        ),
      );
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
      updateDraft((prev) =>
        prev.map((c) =>
          c.id === columnId
            ? { ...c, heightMode: mode, heightValue: value, heightUnit: unit }
            : c,
        ),
      );
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
                updateDraft((prev) =>
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
                              role="button"
                              tabIndex={0}
                              aria-label={`列${colNum}行${r}のセル`}
                              onClick={() => handleCellClick(r, colNum)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  if (e.key === " ") e.preventDefault();
                                  handleCellClick(r, colNum);
                                }
                              }}
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
                            role="button"
                            tabIndex={0}
                            aria-label={`列${colNum}行${r}のセル`}
                            onClick={() => handleCellClick(r, colNum)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                if (e.key === " ") e.preventDefault();
                                handleCellClick(r, colNum);
                              }
                            }}
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
                <button
                  key={col.id}
                  type="button"
                  className={`${styles.unassignedItem} ${pendingCell ? styles.unassignedItemActive : ""}`}
                  disabled={!pendingCell}
                  onClick={() => pendingCell && handleAssign(col.id)}
                >
                  <div className={styles.unassignedName}>{getLabel(col)}</div>
                </button>
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
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={groups.map((g) => g.columns[0].id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className={styles.orderList} data-testid="order-list">
              {groups.map((group, idx) => (
                <SortableOrderItem
                  key={group.columns[0].id}
                  id={group.columns[0].id}
                  label={getGroupLabel(group)}
                  isFirst={idx === 0}
                  isLast={idx === groups.length - 1}
                  isMobile={isMobile}
                  onMoveUp={() => handleMoveGroupUp(idx)}
                  onMoveDown={() => handleMoveGroupDown(idx)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
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
