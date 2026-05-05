// src/hooks/useColumns.ts
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../store/useAppStore";
import type { Column } from "../types";

export const HEADER_HEIGHT = 36; // ColumnHeader の高さ（px）
export const SCROLLBAR_HEIGHT = 12; // 下部スクロールバーの高さ（px）
export const SIDEBAR_COLLAPSED_WIDTH = 40; // サイドバー折りたたみ時の幅（px）
export const SIDEBAR_EXPANDED_WIDTH = 200; // サイドバー展開時の幅（px）
export const MOBILE_TAB_BAR_HEIGHT = 56; // モバイルタブバーの高さ（px）

export interface ColumnBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface GridBoundsOptions {
  containerHeight: number;
  scrollLeft: number;
  sidebarWidth: number;
  headerHeight: number;
  scrollbarHeight: number;
}

export function calculateGridBounds(
  columns: Column[],
  opts: GridBoundsOptions,
): Record<string, ColumnBounds> {
  const {
    containerHeight,
    scrollLeft,
    sidebarWidth,
    headerHeight,
    scrollbarHeight,
  } = opts;
  // 縦に積まれたカラムはそれぞれヘッダーを持つため、列ごとに可用高さが異なる
  const totalHeight = containerHeight - scrollbarHeight;

  // gridCol でグループ化
  const byCol = new Map<number, Column[]>();
  for (const col of columns) {
    if (!byCol.has(col.gridCol)) byCol.set(col.gridCol, []);
    byCol.get(col.gridCol)!.push(col);
  }

  // gridCol を昇順にソート
  const sortedCols = [...byCol.keys()].sort((a, b) => a - b);

  const result: Record<string, ColumnBounds> = {};
  let xOffset = sidebarWidth;

  for (const colNum of sortedCols) {
    const colGroup = byCol
      .get(colNum)!
      .slice()
      .sort((a, b) => a.gridRow - b.gridRow);

    // 各カラムにヘッダー分を引いた残りの高さがWebView領域
    const headersTotal = colGroup.length * headerHeight;
    const availableHeight = Math.max(0, totalHeight - headersTotal);

    // fixed WebView 高さの合計を計算
    let fixedTotal = 0;
    let autoCount = 0;
    for (const col of colGroup) {
      if (col.heightMode === "fixed" && col.heightValue != null) {
        if (col.heightUnit === "%") {
          fixedTotal += (availableHeight * col.heightValue) / 100;
        } else {
          fixedTotal += col.heightValue;
        }
      } else {
        autoCount++;
      }
    }
    const autoHeight =
      autoCount > 0 ? Math.max(0, availableHeight - fixedTotal) / autoCount : 0;

    // yOffset はヘッダー上端の絶対y座標（0始まり）
    let yOffset = 0;
    for (const col of colGroup) {
      let webviewHeight: number;
      if (col.heightMode === "fixed" && col.heightValue != null) {
        webviewHeight =
          col.heightUnit === "%"
            ? (availableHeight * col.heightValue) / 100
            : col.heightValue;
      } else {
        webviewHeight = autoHeight;
      }
      const webviewHeightRounded = Math.round(webviewHeight);
      // y = ヘッダー上端、bounds.height = WebView高さのみ（ヘッダー除く）
      result[col.id] = {
        x: xOffset - scrollLeft,
        y: Math.round(yOffset) + headerHeight,
        width: col.width,
        height: webviewHeightRounded,
      };
      yOffset += headerHeight + webviewHeight;
    }

    // 同じ gridCol 内の最大 width を使って x を進める
    const colWidth = Math.max(...colGroup.map((c) => c.width));
    xOffset += colWidth;
  }

  return result;
}

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
  const [columnBounds, setColumnBounds] = useState<
    Record<string, ColumnBounds>
  >({});
  const [activeColumnId, setActiveColumnIdState] = useState<string | null>(null);

  const setActiveColumn = useCallback(async (id: string) => {
    setActiveColumnIdState(id);
    const { columns: currentColumns } = useAppStore.getState();
    await Promise.all(
      currentColumns.map((col) => {
        const isActive = col.id === id;
        return invoke("resize_column_webview", {
          bounds: {
            columnId: col.id,
            x: isActive ? 0 : -99999,
            y: isActive ? MOBILE_TAB_BAR_HEIGHT : 0,
            width: window.innerWidth,
            height: window.innerHeight - MOBILE_TAB_BAR_HEIGHT,
          },
        }).catch(console.error);
      }),
    );
  }, []);

  // 全カラムのboundsを再計算して更新
  const recalculateAllBounds = useCallback(async () => {
    const { isMobile } = useAppStore.getState();
    if (isMobile) {
      if (activeColumnId) {
        await setActiveColumn(activeColumnId);
      }
      return;
    }

    if (!containerRef.current) return;
    const containerHeight = containerRef.current.clientHeight;
    const scrollLeft = scrollbarRef.current?.scrollLeft ?? 0;
    const { columns: currentColumns, sidebarExpanded } = useAppStore.getState();
    const sidebarWidth = sidebarExpanded
      ? SIDEBAR_EXPANDED_WIDTH
      : SIDEBAR_COLLAPSED_WIDTH;

    const bounds = calculateGridBounds(currentColumns, {
      containerHeight,
      scrollLeft,
      sidebarWidth,
      headerHeight: HEADER_HEIGHT,
      scrollbarHeight: SCROLLBAR_HEIGHT,
    });

    setColumnBounds(bounds);

    await Promise.all(
      Object.entries(bounds).map(([columnId, b]) =>
        invoke("resize_column_webview", {
          bounds: { columnId, ...b },
        }).catch(console.error),
      ),
    );
  }, [activeColumnId, setActiveColumn]);

  // 全カラムのWebViewを作成（起動時に呼ぶ）
  const restoreColumns = useCallback(async (sidebarWidth: number) => {
    if (!containerRef.current) return;
    const containerHeight = containerRef.current.clientHeight;
    const scrollLeft = scrollbarRef.current?.scrollLeft ?? 0;
    const {
      columns: currentColumns,
      accounts: currentAccounts,
      isMobile,
    } = useAppStore.getState();

    if (isMobile) {
      const sortedByOrder = [...currentColumns].sort((a, b) => a.order - b.order);
      const firstColumn = sortedByOrder[0];
      for (const column of sortedByOrder) {
        const account = currentAccounts.find((a) => a.id === column.accountId);
        if (!account) continue;
        const isFirst = column.id === firstColumn?.id;
        await invoke("create_column_webview", {
          args: {
            column,
            dataDirectory: account.dataDirectory,
            x: isFirst ? 0 : -99999,
            y: isFirst ? MOBILE_TAB_BAR_HEIGHT : 0,
            width: window.innerWidth,
            height: window.innerHeight - MOBILE_TAB_BAR_HEIGHT,
          },
        }).catch(console.error);
      }
      if (firstColumn) {
        setActiveColumnIdState(firstColumn.id);
      }
      return;
    }

    const bounds = calculateGridBounds(currentColumns, {
      containerHeight,
      scrollLeft,
      sidebarWidth,
      headerHeight: HEADER_HEIGHT,
      scrollbarHeight: SCROLLBAR_HEIGHT,
    });

    setColumnBounds(bounds);

    for (const column of currentColumns) {
      const account = currentAccounts.find((a) => a.id === column.accountId);
      if (!account) continue;
      const b = bounds[column.id];
      if (!b) continue;
      await invoke("create_column_webview", {
        args: {
          column,
          dataDirectory: account.dataDirectory,
          ...b,
        },
      }).catch(console.error);
    }
  }, []);

  // カラム追加
  const handleAddColumn = useCallback(
    async (column: Column) => {
      const account = accounts.find((a) => a.id === column.accountId);
      if (!account || !containerRef.current) return;

      addColumn(column);

      const { isMobile } = useAppStore.getState();
      if (isMobile) {
        await invoke("create_column_webview", {
          args: {
            column,
            dataDirectory: account.dataDirectory,
            x: -99999,
            y: 0,
            width: window.innerWidth,
            height: window.innerHeight - MOBILE_TAB_BAR_HEIGHT,
          },
        }).catch(console.error);
        if (activeColumnId === null) {
          await setActiveColumn(column.id);
        }
        return;
      }

      const containerHeight = containerRef.current.clientHeight;
      const scrollLeft = scrollbarRef.current?.scrollLeft ?? 0;
      const { sidebarExpanded, columns: updatedColumns } =
        useAppStore.getState();
      const sidebarWidth = sidebarExpanded
        ? SIDEBAR_EXPANDED_WIDTH
        : SIDEBAR_COLLAPSED_WIDTH;

      const bounds = calculateGridBounds(updatedColumns, {
        containerHeight,
        scrollLeft,
        sidebarWidth,
        headerHeight: HEADER_HEIGHT,
        scrollbarHeight: SCROLLBAR_HEIGHT,
      });

      setColumnBounds(bounds);
      const b = bounds[column.id];
      if (!b) return;

      await invoke("create_column_webview", {
        args: { column, dataDirectory: account.dataDirectory, ...b },
      });
    },
    [accounts, addColumn, activeColumnId, setActiveColumn],
  );

  // ダイアログ表示時に全カラムWebViewをオフスクリーンへ退避（native WebViewはz-indexを無視するため）
  const hideColumnWebviews = useCallback(async () => {
    const currentColumns = useAppStore.getState().columns;
    await Promise.all(
      currentColumns.map((col) =>
        invoke("resize_column_webview", {
          bounds: {
            columnId: col.id,
            x: -9999,
            y: HEADER_HEIGHT,
            width: col.width,
            height: 1,
          },
        }).catch(() => {}),
      ),
    );
  }, []);

  // カラム削除
  const handleRemoveColumn = useCallback(
    async (columnId: string) => {
      await invoke("remove_column_webview", { columnId });
      removeColumn(columnId);
      const { isMobile, columns: remainingColumns } = useAppStore.getState();
      if (isMobile) {
        if (activeColumnId === columnId) {
          const next = remainingColumns.find((c) => c.id !== columnId);
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
    [removeColumn, recalculateAllBounds, activeColumnId, setActiveColumn],
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

  // ウィンドウリサイズ時に全カラムを再配置
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        recalculateAllBounds();
      }, 100);
    };
    window.addEventListener("resize", handleResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", handleResize);
    };
  }, [recalculateAllBounds]);

  // 下部スクロールバー操作 → WebView 追従
  const handleScrollbarScroll = useCallback(() => {
    recalculateAllBounds();
  }, [recalculateAllBounds]);

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
    setActiveColumn,
  };
}
