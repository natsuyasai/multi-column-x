// src/hooks/useColumns.ts
// モバイル/デスクトップ実装（useMobileColumns / useDesktopColumns）を組み合わせるファサード
import { useCallback, useRef } from "react";
import { useAppStore } from "../store/useAppStore";
import type { Column } from "../types";
import { OFFSCREEN } from "../constants/ipc";
import {
  HEADER_HEIGHT,
  SCROLLBAR_HEIGHT,
  MOBILE_TAB_BAR_HEIGHT,
  getTopBarHeight,
  calculateGridBounds,
} from "../lib/gridLayout";
import {
  createColumnWebview,
  removeColumnWebview,
  resizeColumnWebview,
} from "../services/columnWebview";
import { useMobileColumns } from "./useMobileColumns";
import { useDesktopColumns } from "./useDesktopColumns";

// グリッド座標計算は src/lib/gridLayout.ts へ移動した。既存 import 互換のため re-export する。
export {
  HEADER_HEIGHT,
  SCROLLBAR_HEIGHT,
  MOBILE_TAB_BAR_HEIGHT,
  TOPBAR_COLLAPSED_HEIGHT,
  TOPBAR_EXPANDED_HEIGHT,
  getTopBarHeight,
  calculateGridBounds,
} from "../lib/gridLayout";
export type { ColumnBounds } from "../lib/gridLayout";

export function useColumns() {
  const {
    columns,
    accounts,
    addColumn,
    removeColumn,
    updateColumn,
    moveColumn,
  } = useAppStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollbarRef = useRef<HTMLDivElement>(null); // 下部スクロールバーコンテナ
  // ダイアログが開いている間はリサイズによる WebView 再配置を抑制するためのフラグ
  const dialogOpenRef = useRef(false);

  const {
    activeColumnId,
    setActiveColumnIdState,
    swipeState,
    setActiveColumn,
    restoreMobileColumns,
  } = useMobileColumns(dialogOpenRef);

  const {
    columnBounds,
    setColumnBounds,
    recalculateAllBounds,
    restoreDesktopColumns,
    handleScrollbarScroll,
  } = useDesktopColumns({
    containerRef,
    scrollbarRef,
    dialogOpenRef,
    activeColumnId,
    setActiveColumn,
  });

  const restoreColumns = useCallback(
    async (topBarHeight: number) => {
      if (!containerRef.current) return;
      const containerHeight = containerRef.current.clientHeight;
      const scrollLeft = scrollbarRef.current?.scrollLeft ?? 0;
      const {
        columns: currentColumns,
        accounts: currentAccounts,
        isMobile,
      } = useAppStore.getState();

      if (isMobile) {
        await restoreMobileColumns(currentColumns, currentAccounts);
        return;
      }

      await restoreDesktopColumns(
        currentColumns,
        currentAccounts,
        containerHeight,
        scrollLeft,
        topBarHeight,
      );
    },
    [restoreMobileColumns, restoreDesktopColumns],
  );

  // カラム追加
  const handleAddColumn = useCallback(
    async (column: Column) => {
      const account = accounts.find((a) => a.id === column.accountId);
      if (!account || !containerRef.current) return;

      addColumn(column);

      const { isMobile } = useAppStore.getState();
      if (isMobile) {
        await createColumnWebview(column, account.dataDirectory, {
          x: OFFSCREEN.MOBILE_X,
          y: 0,
          width: window.innerWidth,
          height: window.innerHeight - MOBILE_TAB_BAR_HEIGHT,
        }).catch(console.error);
        if (activeColumnId === null) {
          await setActiveColumn(column.id);
        }
        return;
      }

      const containerHeight = containerRef.current.clientHeight;
      const scrollLeft = scrollbarRef.current?.scrollLeft ?? 0;
      const { topBarExpanded, columns: updatedColumns } =
        useAppStore.getState();
      const topBarHeight = getTopBarHeight(topBarExpanded);

      const bounds = calculateGridBounds(updatedColumns, {
        containerHeight,
        scrollLeft,
        headerHeight: HEADER_HEIGHT,
        scrollbarHeight: SCROLLBAR_HEIGHT,
        topBarHeight,
      });

      setColumnBounds(bounds);
      const b = bounds[column.id];
      if (!b) return;

      await createColumnWebview(column, account.dataDirectory, b).catch(
        console.error,
      );
    },
    [accounts, addColumn, activeColumnId, setActiveColumn, setColumnBounds],
  );

  // ダイアログ表示時に全カラムWebViewをオフスクリーンへ退避（native WebViewはz-indexを無視するため）
  const hideColumnWebviews = useCallback(async () => {
    const { columns: currentColumns, isMobile } = useAppStore.getState();
    await Promise.all(
      currentColumns.map((col) =>
        resizeColumnWebview(
          col.id,
          isMobile
            ? {
                x: OFFSCREEN.MOBILE_X,
                y: 0,
                width: window.innerWidth,
                height: window.innerHeight - MOBILE_TAB_BAR_HEIGHT,
              }
            : {
                x: OFFSCREEN.DESKTOP_X,
                y:
                  getTopBarHeight(useAppStore.getState().topBarExpanded) +
                  HEADER_HEIGHT,
                width: col.width,
                height: 1,
              },
        ).catch(() => {}),
      ),
    );
  }, []);

  // カラム削除
  const handleRemoveColumn = useCallback(
    async (columnId: string) => {
      await removeColumnWebview(columnId).catch(console.error);
      removeColumn(columnId);
      const { isMobile, columns: remainingColumns } = useAppStore.getState();
      if (isMobile) {
        if (activeColumnId === columnId) {
          const next = [...remainingColumns].sort(
            (a, b) => a.order - b.order,
          )[0];
          if (next) {
            await setActiveColumn(next.id);
          } else {
            setActiveColumnIdState(null);
          }
        }
        return;
      }
      await recalculateAllBounds();
    },
    [
      removeColumn,
      recalculateAllBounds,
      activeColumnId,
      setActiveColumn,
      setActiveColumnIdState,
    ],
  );

  // カラム更新（設定変更）
  const handleUpdateColumn = useCallback(
    (id: string, patch: Partial<Column>) => {
      updateColumn(id, patch);
    },
    [updateColumn],
  );

  // カラム移動
  const handleMoveColumn = useCallback(
    async (columnId: string, direction: "left" | "right") => {
      moveColumn(columnId, direction);
      await recalculateAllBounds();
    },
    [moveColumn, recalculateAllBounds],
  );

  const setDialogOpen = useCallback((open: boolean) => {
    dialogOpenRef.current = open;
  }, []);

  const recreateAllWebviews = useCallback(async () => {
    const { columns: currentColumns, topBarExpanded } = useAppStore.getState();
    for (const column of currentColumns) {
      await removeColumnWebview(column.id).catch(console.error);
    }
    await restoreColumns(getTopBarHeight(topBarExpanded));
  }, [restoreColumns]);

  return {
    columns,
    columnBounds,
    containerRef,
    scrollbarRef,
    restoreColumns,
    handleAddColumn,
    handleRemoveColumn,
    handleMoveColumn,
    handleUpdateColumn,
    recalculateAllBounds,
    hideColumnWebviews,
    handleScrollbarScroll,
    activeColumnId,
    swipeState,
    setActiveColumn,
    setDialogOpen,
    recreateAllWebviews,
  };
}
