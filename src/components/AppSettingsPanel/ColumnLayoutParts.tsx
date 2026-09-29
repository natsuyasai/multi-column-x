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
import React from "react";
import { rowCountForCol } from "@/components/AppSettingsPanel/columnLayoutDraft";
import type { ColumnGroup } from "@/lib/columnOrder";
import type { Column } from "@/types";
import styles from "./ColumnLayoutTab.module.scss";

export interface CellKey {
  row: number;
  col: number;
}

interface GridPreviewProps {
  cols: number;
  draft: Column[];
  assigned: Column[];
  selectedCellKey: CellKey | null;
  pendingCell: CellKey | null;
  getLabel: (col: Column) => string;
  onCellClick: (row: number, col: number) => void;
  onRemove: (columnId: string) => void;
}

export const GridPreview: React.FC<GridPreviewProps> = ({
  cols,
  draft,
  assigned,
  selectedCellKey,
  pendingCell,
  getLabel,
  onCellClick,
  onRemove,
}) => {
  return (
    <div className={styles.gridPreview} data-testid="grid-preview">
      {Array.from({ length: cols }, (_, cIdx) => {
        const colNum = cIdx + 1;
        const rows = rowCountForCol(draft, colNum);
        return (
          <div key={cIdx} className={styles.gridColumn}>
            <div className={styles.gridColHeader}>列 {colNum}</div>
            <div className={styles.gridColCells}>
              {Array.from({ length: rows }, (_, rIdx) => {
                const r = rIdx + 1;
                const colAtCell =
                  assigned.find(
                    (col) => col.gridRow === r && col.gridCol === colNum,
                  ) ?? null;
                const isSelected =
                  selectedCellKey?.row === r && selectedCellKey?.col === colNum;
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
                      onClick={() => onCellClick(r, colNum)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          if (e.key === " ") e.preventDefault();
                          onCellClick(r, colNum);
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
                          onRemove(colAtCell.id);
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
                    onClick={() => onCellClick(r, colNum)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        if (e.key === " ") e.preventDefault();
                        onCellClick(r, colNum);
                      }
                    }}
                  >
                    {pendingCell ? "← ここに配置" : "+"}
                  </div>
                );
              })}
              <button
                className={styles.addRowBtn}
                onClick={() => onCellClick(rows + 1, colNum)}
              >
                + 行を追加
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

interface UnassignedListProps {
  unassigned: Column[];
  pendingCell: CellKey | null;
  getLabel: (col: Column) => string;
  onAssign: (columnId: string) => void;
}

export const UnassignedList: React.FC<UnassignedListProps> = ({
  unassigned,
  pendingCell,
  getLabel,
  onAssign,
}) => {
  return (
    <div className={styles.unassigned}>
      <div className={styles.unassignedLabel}>未割当</div>
      {unassigned.map((col) => (
        <button
          key={col.id}
          type="button"
          className={`${styles.unassignedItem} ${pendingCell ? styles.unassignedItemActive : ""}`}
          disabled={!pendingCell}
          onClick={() => pendingCell && onAssign(col.id)}
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
  );
};

interface HeightSettingsProps {
  column: Column;
  getLabel: (col: Column) => string;
  onHeightChange: (
    columnId: string,
    mode: "auto" | "fixed",
    value?: number,
    unit?: "px" | "%",
  ) => void;
}

export const HeightSettings: React.FC<HeightSettingsProps> = ({
  column,
  getLabel,
  onHeightChange,
}) => {
  return (
    <div className={styles.heightSettings}>
      <div className={styles.heightSettingsTitle}>
        高さ設定 — {getLabel(column)}
      </div>
      <div className={styles.heightRow}>
        <label className={styles.radioLabel}>
          <input
            type="radio"
            name="heightMode"
            checked={column.heightMode === "auto"}
            onChange={() => onHeightChange(column.id, "auto")}
          />
          均等（自動）
        </label>
        <label className={styles.radioLabel}>
          <input
            type="radio"
            name="heightMode"
            checked={column.heightMode === "fixed"}
            onChange={() =>
              onHeightChange(
                column.id,
                "fixed",
                column.heightValue ?? 400,
                column.heightUnit ?? "px",
              )
            }
          />
          固定:
        </label>
        {column.heightMode === "fixed" && (
          <div className={styles.fixedInputGroup}>
            <input
              type="number"
              className={styles.numberInput}
              min={1}
              value={column.heightValue ?? 400}
              onChange={(e) =>
                onHeightChange(
                  column.id,
                  "fixed",
                  Number(e.target.value),
                  column.heightUnit ?? "px",
                )
              }
            />
            <select
              className={styles.unitSelect}
              value={column.heightUnit ?? "px"}
              onChange={(e) =>
                onHeightChange(
                  column.id,
                  "fixed",
                  column.heightValue ?? 400,
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
  );
};

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

interface ColumnOrderListProps {
  groups: ColumnGroup[];
  isMobile: boolean;
  getGroupLabel: (group: ColumnGroup) => string;
  onMoveUp: (groupIdx: number) => void;
  onMoveDown: (groupIdx: number) => void;
  onDragEnd: (event: DragEndEvent) => void;
}

export const ColumnOrderList: React.FC<ColumnOrderListProps> = ({
  groups,
  isMobile,
  getGroupLabel,
  onMoveUp,
  onMoveDown,
  onDragEnd,
}) => {
  const sensors = useSensors(
    // 8px 動かすまでドラッグ開始しない → ▲▼ボタンのクリックと競合しない
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  return (
    <div className={styles.orderSection}>
      <div className={styles.orderLabel}>表示順序</div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragEnd={onDragEnd}
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
                onMoveUp={() => onMoveUp(idx)}
                onMoveDown={() => onMoveDown(idx)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
};
