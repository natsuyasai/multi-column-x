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
  restrictToHorizontalAxis,
  restrictToParentElement,
} from "@dnd-kit/modifiers";
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import React from "react";
import {
  buildGroups,
  resolveGroupMove,
  type ColumnGroup,
} from "@/lib/columnOrder";
import type { Account, Column } from "@/types";
import CloseIcon from "../../assets/icons/close.svg?react";
import { columnDisplayName, getColumnIcon } from "./columnDisplay";
import styles from "./TopBar.module.scss";

type ColumnListVariant = "collapsed" | "expanded";

const DRAG_MODIFIERS = [restrictToHorizontalAxis, restrictToParentElement];

interface ColumnEntryProps {
  column: Column;
  /** order 昇順での位置。Ctrl+1〜9 のジャンプ先と一致させるためタイトルに使う */
  orderIndex: number;
  accounts: Account[];
  variant: ColumnListVariant;
  onJumpToColumn: (columnId: string) => void;
  onClose: (columnId: string) => void;
}

const ColumnEntry: React.FC<ColumnEntryProps> = ({
  column,
  orderIndex,
  accounts,
  variant,
  onJumpToColumn,
  onClose,
}) => {
  const name = columnDisplayName(column, accounts);
  const title = orderIndex < 9 ? `${name} (Ctrl+${orderIndex + 1})` : name;

  if (variant === "collapsed") {
    return (
      <button
        className={styles.btn}
        onClick={() => onJumpToColumn(column.id)}
        title={title}
      >
        {getColumnIcon(column.pageType)}
      </button>
    );
  }

  return (
    <div className={styles.columnItem}>
      <button
        className={`${styles.btn} ${styles.btnExpanded}`}
        onClick={() => onJumpToColumn(column.id)}
        title={title}
      >
        <span className={styles.icon}>{getColumnIcon(column.pageType)}</span>
        <span className={styles.label}>{name}</span>
      </button>
      <button
        className={styles.btn}
        onClick={() => onClose(column.id)}
        aria-label="カラムを閉じる"
        title="カラムを閉じる"
      >
        <CloseIcon width={14} height={14} data-testid="icon-close" />
      </button>
    </div>
  );
};

interface SortableGroupProps {
  group: ColumnGroup;
  orderIndexById: Map<string, number>;
  accounts: Account[];
  variant: ColumnListVariant;
  onJumpToColumn: (columnId: string) => void;
  onClose: (columnId: string) => void;
}

const SortableGroup: React.FC<SortableGroupProps> = ({
  group,
  orderIndexById,
  accounts,
  variant,
  onJumpToColumn,
  onClose,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id: group.columns[0].id });

  const classNames = [styles.columnGroup];
  if (isDragging) classNames.push(styles.columnGroupDragging);
  else if (isOver) classNames.push(styles.columnGroupOver);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={classNames.join(" ")}
      data-testid="topbar-column-group"
    >
      <button
        type="button"
        className={styles.dragHandle}
        aria-label="ドラッグして並び替え"
        title="ドラッグして並び替え"
        {...attributes}
        {...listeners}
      >
        ⋮
      </button>
      {group.columns.map((column) => (
        <ColumnEntry
          key={column.id}
          column={column}
          orderIndex={orderIndexById.get(column.id)!}
          accounts={accounts}
          variant={variant}
          onJumpToColumn={onJumpToColumn}
          onClose={onClose}
        />
      ))}
    </div>
  );
};

interface SortableColumnGroupsProps {
  variant: ColumnListVariant;
  columns: Column[];
  accounts: Account[];
  onJumpToColumn: (columnId: string) => void;
  onClose: (columnId: string) => void;
  onReorderColumnGroup: (fromIdx: number, toIdx: number) => void;
}

/**
 * カラムを gridCol ごとの列グループ（1 列 = 1 要素）として並べ、ドラッグで並び替えられるようにする。
 * グリッド未割当のカラムは並び替え対象外なので、グループの後ろにハンドル無しで表示する。
 */
export const SortableColumnGroups: React.FC<SortableColumnGroupsProps> = ({
  variant,
  columns,
  accounts,
  onJumpToColumn,
  onClose,
  onReorderColumnGroup,
}) => {
  const sensors = useSensors(
    // 8px 動かすまでドラッグ開始しない → 通常のクリックと競合しない
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const groups = buildGroups(columns);
  const groupedIds = new Set(
    groups.flatMap((group) => group.columns.map((c) => c.id)),
  );
  const byOrder = [...columns].sort((a, b) => a.order - b.order);
  const orderIndexById = new Map(byOrder.map((c, i) => [c.id, i]));
  const unassigned = byOrder.filter((c) => !groupedIds.has(c.id));

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return;
    const move = resolveGroupMove(columns, String(active.id), String(over.id));
    if (move) onReorderColumnGroup(move.fromIdx, move.toIdx);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={DRAG_MODIFIERS}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={groups.map((g) => g.columns[0].id)}
        strategy={horizontalListSortingStrategy}
      >
        {groups.map((group) => (
          <SortableGroup
            key={group.columns[0].id}
            group={group}
            orderIndexById={orderIndexById}
            accounts={accounts}
            variant={variant}
            onJumpToColumn={onJumpToColumn}
            onClose={onClose}
          />
        ))}
      </SortableContext>
      {unassigned.map((column) => (
        <ColumnEntry
          key={column.id}
          column={column}
          orderIndex={orderIndexById.get(column.id)!}
          accounts={accounts}
          variant={variant}
          onJumpToColumn={onJumpToColumn}
          onClose={onClose}
        />
      ))}
    </DndContext>
  );
};
