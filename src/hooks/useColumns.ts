// src/hooks/useColumns.ts
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { platform } from "@tauri-apps/plugin-os";
import { useAppStore } from "../store/useAppStore";
import type { Column } from "../types";
import { IPC_COMMANDS, IPC_EVENTS } from "../constants/ipc";

export const HEADER_HEIGHT = 36; // ColumnHeader の高さ（px）
export const SCROLLBAR_HEIGHT = 12; // 下部スクロールバーの高さ（px）
export const SIDEBAR_COLLAPSED_WIDTH = 40; // サイドバー折りたたみ時の幅（px）
export const SIDEBAR_EXPANDED_WIDTH = 200; // サイドバー展開時の幅（px）
export const MOBILE_TAB_BAR_HEIGHT = 56; // モバイルタブバーの高さ（px）

function getSidebarWidth(sidebarExpanded: boolean): number {
  return sidebarExpanded ? SIDEBAR_EXPANDED_WIDTH : SIDEBAR_COLLAPSED_WIDTH;
}

// Kotlin の WindowInsetsCompat から取得したシステムバーの高さ（dp）を返す。
// CSS env(safe-area-inset-*) は Android では notch 領域のみを表すため使用しない。
// 値が 0 の場合は Kotlin 側がまだ値を設定していない可能性があるためリトライする。
export async function getMobileInsets(): Promise<{
  top: number;
  bottom: number;
}> {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const result = await invoke<{ top: number; bottom: number }>(
        "get_mobile_insets",
      );
      console.log(
        `[getMobileInsets attempt=${attempt}]`,
        JSON.stringify(result),
        "innerHeight:",
        window.innerHeight,
        "innerWidth:",
        window.innerWidth,
      );
      if (result.top > 0 || result.bottom > 0) {
        return result;
      }
      if (attempt < 9) {
        await new Promise((r) => setTimeout(r, 100));
      }
    } catch (e) {
      console.error("[getMobileInsets] error:", e);
      break;
    }
  }
  console.warn("[getMobileInsets] all attempts returned {top:0,bottom:0}");
  return { top: 0, bottom: 0 };
}

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
    isMobile,
  } = useAppStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollbarRef = useRef<HTMLDivElement>(null); // 下部スクロールバーコンテナ
  const [columnBounds, setColumnBounds] = useState<
    Record<string, ColumnBounds>
  >({});
  const [activeColumnId, setActiveColumnIdState] = useState<string | null>(
    null,
  );
  const [swipeState, setSwipeState] = useState<{
    direction: "left" | "right";
    phase: "progress" | "switching";
  } | null>(null);
  // ダイアログが開いている間はリサイズによる WebView 再配置を抑制するためのフラグ
  const dialogOpenRef = useRef(false);

  const setActiveColumn = useCallback(async (id: string) => {
    setActiveColumnIdState(id);
    // バックグラウンド復帰後に React がリロードされても復元できるよう保存する
    try {
      localStorage.setItem("mcx_activeColumnId", id);
    } catch {}
    const { columns: currentColumns, isMobile } = useAppStore.getState();

    // モバイル: resize_column_webview より先にアクティブカラムのクッキーを切り替える。
    // CookieManager は共有のため、WebView が表示される前に正しいアカウントを設定する必要がある。
    if (isMobile) {
      const activeCol = currentColumns.find((c) => c.id === id);
      if (activeCol) {
        await invoke(IPC_COMMANDS.SET_COLUMN_COOKIES, {
          accountId: activeCol.accountId,
        }).catch(console.error);
      }
    }

    await Promise.all(
      currentColumns.map((col) => {
        const isActive = col.id === id;
        return invoke(IPC_COMMANDS.RESIZE_COLUMN_WEBVIEW, {
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
    const sidebarWidth = getSidebarWidth(sidebarExpanded);

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
        invoke(IPC_COMMANDS.RESIZE_COLUMN_WEBVIEW, {
          bounds: { columnId, ...b, sidebarWidth },
        }).catch(console.error),
      ),
    );
  }, [activeColumnId, setActiveColumn]);

  // 全カラムのWebViewを作成（起動時に呼ぶ）
  const restoreMobileColumns = useCallback(
    async (
      currentColumns: Column[],
      currentAccounts: ReturnType<typeof useAppStore.getState>["accounts"],
    ) => {
      const sortedByOrder = [...currentColumns].sort(
        (a, b) => a.order - b.order,
      );
      const firstColumn = sortedByOrder[0];
      // バックグラウンド復帰後の React リロード時に以前のアクティブカラムを復元する
      let savedId: string | null = null;
      try {
        savedId = localStorage.getItem("mcx_activeColumnId");
      } catch {}
      const targetColumn =
        (savedId ? sortedByOrder.find((c) => c.id === savedId) : null) ??
        firstColumn;
      for (const column of sortedByOrder) {
        const account = currentAccounts.find((a) => a.id === column.accountId);
        if (!account) continue;
        const isActive = column.id === targetColumn?.id;
        await invoke(IPC_COMMANDS.CREATE_COLUMN_WEBVIEW, {
          args: {
            column,
            dataDirectory: account.dataDirectory,
            x: isActive ? 0 : -99999,
            y: 0,
            width: window.innerWidth,
            height: window.innerHeight - MOBILE_TAB_BAR_HEIGHT,
          },
        }).catch(console.error);
      }
      if (targetColumn) {
        await setActiveColumn(targetColumn.id);
      }
    },
    [setActiveColumn],
  );

  const restoreDesktopColumns = useCallback(
    async (
      currentColumns: Column[],
      currentAccounts: ReturnType<typeof useAppStore.getState>["accounts"],
      containerHeight: number,
      scrollLeft: number,
      sidebarWidth: number,
    ) => {
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
        await invoke(IPC_COMMANDS.CREATE_COLUMN_WEBVIEW, {
          args: {
            column,
            dataDirectory: account.dataDirectory,
            ...b,
          },
        }).catch(console.error);
      }
    },
    [],
  );

  const restoreColumns = useCallback(
    async (sidebarWidth: number) => {
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
        sidebarWidth,
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
        await invoke(IPC_COMMANDS.CREATE_COLUMN_WEBVIEW, {
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
      const sidebarWidth = getSidebarWidth(sidebarExpanded);

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
      }).catch(console.error);
    },
    [accounts, addColumn, activeColumnId, setActiveColumn],
  );

  // ダイアログ表示時に全カラムWebViewをオフスクリーンへ退避（native WebViewはz-indexを無視するため）
  const hideColumnWebviews = useCallback(async () => {
    const { columns: currentColumns, isMobile } = useAppStore.getState();
    await Promise.all(
      currentColumns.map((col) =>
        invoke(IPC_COMMANDS.RESIZE_COLUMN_WEBVIEW, {
          bounds: isMobile
            ? {
                columnId: col.id,
                x: -99999,
                y: 0,
                width: window.innerWidth,
                height: window.innerHeight - MOBILE_TAB_BAR_HEIGHT,
              }
            : {
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
      await invoke(IPC_COMMANDS.REMOVE_COLUMN_WEBVIEW, { columnId }).catch(
        console.error,
      );
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

  // ウィンドウリサイズ時に全カラムを再配置（ダイアログ表示中は仮想キーボード起因のリサイズを無視）
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      if (dialogOpenRef.current) return;
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

  // Linux: カラム WebView は独立したウィンドウのため、メインウィンドウ移動時に位置を再計算する
  useEffect(() => {
    if (isMobile || platform() !== "linux") return;
    let unlisten: (() => void) | undefined;
    getCurrentWindow()
      .onMoved(() => {
        recalculateAllBounds();
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => {
      unlisten?.();
    };
  }, [isMobile, recalculateAllBounds]);

  // カラムスワイプナビゲーション（モバイルのみ: Android ネイティブジェスチャー → Tauri イベント経由）
  useEffect(() => {
    if (!isMobile) return;
    const unlistenProgress = listen<string>(
      IPC_EVENTS.COLUMN_SWIPE_PROGRESS,
      (e) => {
        if (dialogOpenRef.current) return;
        setSwipeState({
          direction: e.payload as "left" | "right",
          phase: "progress",
        });
      },
    );
    const unlistenCancel = listen(IPC_EVENTS.COLUMN_SWIPE_CANCEL, () => {
      setSwipeState(null);
    });
    const unlistenNavigate = listen<string>(
      IPC_EVENTS.COLUMN_SWIPE_NAVIGATE,
      (e) => {
        if (dialogOpenRef.current) return;
        const direction = e.payload as "left" | "right";
        const { columns: cols } = useAppStore.getState();
        const sorted = [...cols].sort((a, b) => a.order - b.order);
        const currentIdx = sorted.findIndex((c) => c.id === activeColumnId);
        if (currentIdx < 0) return;
        const targetIdx =
          direction === "left" ? currentIdx + 1 : currentIdx - 1;
        if (targetIdx < 0 || targetIdx >= sorted.length) return;
        setSwipeState({ direction, phase: "switching" });
        setTimeout(() => setSwipeState(null), 400);
        setActiveColumn(sorted[targetIdx].id);
      },
    );
    return () => {
      unlistenProgress.then((fn) => fn());
      unlistenCancel.then((fn) => fn());
      unlistenNavigate.then((fn) => fn());
    };
  }, [isMobile, activeColumnId, setActiveColumn]);

  // 下部スクロールバー操作 → WebView 追従
  const handleScrollbarScroll = useCallback(() => {
    recalculateAllBounds();
  }, [recalculateAllBounds]);

  const setDialogOpen = useCallback((open: boolean) => {
    dialogOpenRef.current = open;
  }, []);

  const recreateAllWebviews = useCallback(async () => {
    const { columns: currentColumns, sidebarExpanded } = useAppStore.getState();
    for (const column of currentColumns) {
      await invoke(IPC_COMMANDS.REMOVE_COLUMN_WEBVIEW, {
        columnId: column.id,
      }).catch(console.error);
    }
    await restoreColumns(getSidebarWidth(sidebarExpanded));
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
