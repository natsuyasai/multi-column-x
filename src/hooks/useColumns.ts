// src/hooks/useColumns.ts
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { platform } from "@tauri-apps/plugin-os";
import { useAppStore } from "../store/useAppStore";
import type { Column } from "../types";
import {
  IPC_COMMANDS,
  IPC_EVENTS,
  OFFSCREEN,
  STORAGE_KEYS,
  WEBVIEW_LABELS,
  WEBVIEW_SCRIPTS,
} from "../constants/ipc";

import {
  HEADER_HEIGHT,
  SCROLLBAR_HEIGHT,
  MOBILE_TAB_BAR_HEIGHT,
  getTopBarHeight,
  calculateGridBounds,
  type ColumnBounds,
} from "../lib/gridLayout";

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
      localStorage.setItem(STORAGE_KEYS.ACTIVE_COLUMN_ID, id);
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
            x: isActive ? 0 : OFFSCREEN.MOBILE_X,
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
    const { columns: currentColumns, topBarExpanded } = useAppStore.getState();
    const topBarHeight = getTopBarHeight(topBarExpanded);

    const bounds = calculateGridBounds(currentColumns, {
      containerHeight,
      scrollLeft,
      headerHeight: HEADER_HEIGHT,
      scrollbarHeight: SCROLLBAR_HEIGHT,
      topBarHeight,
    });

    setColumnBounds(bounds);

    await Promise.all(
      Object.entries(bounds).map(([columnId, b]) =>
        invoke(IPC_COMMANDS.RESIZE_COLUMN_WEBVIEW, {
          bounds: { columnId, ...b },
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
        savedId = localStorage.getItem(STORAGE_KEYS.ACTIVE_COLUMN_ID);
      } catch {}
      const targetColumn =
        (savedId ? sortedByOrder.find((c) => c.id === savedId) : null) ??
        firstColumn;
      // 全カラムを並列作成して loadUrl を一斉に開始する
      await Promise.all(
        sortedByOrder.map(async (column) => {
          const account = currentAccounts.find(
            (a) => a.id === column.accountId,
          );
          if (!account) return;
          const isActive = column.id === targetColumn?.id;
          await invoke(IPC_COMMANDS.CREATE_COLUMN_WEBVIEW, {
            args: {
              column,
              dataDirectory: account.dataDirectory,
              x: isActive ? 0 : OFFSCREEN.MOBILE_X,
              y: 0,
              width: window.innerWidth,
              height: window.innerHeight - MOBILE_TAB_BAR_HEIGHT,
            },
          }).catch(console.error);
        }),
      );
      if (targetColumn) {
        // activeColumnId を保存（バックグラウンド復帰後の復元用）
        setActiveColumnIdState(targetColumn.id);
        try {
          localStorage.setItem(STORAGE_KEYS.ACTIVE_COLUMN_ID, targetColumn.id);
        } catch {}
        // Cookie 設定（認証に必要）
        await invoke(IPC_COMMANDS.SET_COLUMN_COOKIES, {
          accountId: targetColumn.accountId,
        }).catch(console.error);
        // アクティブカラムのみ表示。非アクティブカラムには RESIZE を送らず
        // onPause() を呼ばせないことでバックグラウンド読み込みを継続させる。
        await invoke(IPC_COMMANDS.RESIZE_COLUMN_WEBVIEW, {
          bounds: {
            columnId: targetColumn.id,
            x: 0,
            y: MOBILE_TAB_BAR_HEIGHT,
            width: window.innerWidth,
            height: window.innerHeight - MOBILE_TAB_BAR_HEIGHT,
          },
        }).catch(console.error);
      }
    },
    [],
  );

  const restoreDesktopColumns = useCallback(
    async (
      currentColumns: Column[],
      currentAccounts: ReturnType<typeof useAppStore.getState>["accounts"],
      containerHeight: number,
      scrollLeft: number,
      topBarHeight: number,
    ) => {
      const bounds = calculateGridBounds(currentColumns, {
        containerHeight,
        scrollLeft,
        headerHeight: HEADER_HEIGHT,
        scrollbarHeight: SCROLLBAR_HEIGHT,
        topBarHeight,
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
        await invoke(IPC_COMMANDS.CREATE_COLUMN_WEBVIEW, {
          args: {
            column,
            dataDirectory: account.dataDirectory,
            x: OFFSCREEN.MOBILE_X,
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

      await invoke(IPC_COMMANDS.CREATE_COLUMN_WEBVIEW, {
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
                x: OFFSCREEN.MOBILE_X,
                y: 0,
                width: window.innerWidth,
                height: window.innerHeight - MOBILE_TAB_BAR_HEIGHT,
              }
            : {
                columnId: col.id,
                x: OFFSCREEN.DESKTOP_X,
                y:
                  getTopBarHeight(useAppStore.getState().topBarExpanded) +
                  HEADER_HEIGHT,
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
    const unlistenDoubleTap = listen(IPC_EVENTS.COLUMN_DOUBLE_TAP, () => {
      if (dialogOpenRef.current) return;
      if (!activeColumnId) return;
      invoke(IPC_COMMANDS.EVAL_IN_WEBVIEW, {
        label: WEBVIEW_LABELS.column(activeColumnId),
        script: WEBVIEW_SCRIPTS.SCROLL_TOP_AND_RELOAD,
      }).catch(console.error);
    });
    return () => {
      unlistenProgress.then((fn) => fn());
      unlistenCancel.then((fn) => fn());
      unlistenNavigate.then((fn) => fn());
      unlistenDoubleTap.then((fn) => fn());
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
    const { columns: currentColumns, topBarExpanded } = useAppStore.getState();
    for (const column of currentColumns) {
      await invoke(IPC_COMMANDS.REMOVE_COLUMN_WEBVIEW, {
        columnId: column.id,
      }).catch(console.error);
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
