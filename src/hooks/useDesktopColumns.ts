// src/hooks/useDesktopColumns.ts
// デスクトップのグリッド bounds 管理・リサイズ追従・起動時復元
import { useCallback, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { platform } from "@tauri-apps/plugin-os";
import { useAppStore } from "../store/useAppStore";
import type { Column } from "../types";
import {
  HEADER_HEIGHT,
  SCROLLBAR_HEIGHT,
  getTopBarHeight,
  calculateGridBounds,
  type ColumnBounds,
} from "../lib/gridLayout";
import {
  createColumnWebview,
  resizeColumnWebview,
} from "../services/columnWebview";

interface DesktopColumnsArgs {
  containerRef: React.RefObject<HTMLDivElement | null>;
  scrollbarRef: React.RefObject<HTMLDivElement | null>;
  /** ダイアログが開いている間はリサイズによる WebView 再配置を抑制する */
  dialogOpenRef: React.RefObject<boolean>;
  /** モバイル時の再計算はアクティブカラムの再配置に委譲する */
  activeColumnId: string | null;
  setActiveColumn: (id: string) => Promise<void>;
}

export function useDesktopColumns({
  containerRef,
  scrollbarRef,
  dialogOpenRef,
  activeColumnId,
  setActiveColumn,
}: DesktopColumnsArgs) {
  const isMobile = useAppStore((s) => s.isMobile);
  const [columnBounds, setColumnBounds] = useState<
    Record<string, ColumnBounds>
  >({});

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
        resizeColumnWebview(columnId, b).catch(console.error),
      ),
    );
  }, [activeColumnId, setActiveColumn, containerRef, scrollbarRef]);

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
        await createColumnWebview(column, account.dataDirectory, b).catch(
          console.error,
        );
      }
    },
    [],
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
  }, [recalculateAllBounds, dialogOpenRef]);

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

  // 下部スクロールバー操作 → WebView 追従
  const handleScrollbarScroll = useCallback(() => {
    recalculateAllBounds();
  }, [recalculateAllBounds]);

  return {
    columnBounds,
    setColumnBounds,
    recalculateAllBounds,
    restoreDesktopColumns,
    handleScrollbarScroll,
  };
}
