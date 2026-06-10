// src/hooks/useMobileColumns.ts
// モバイル（Android）のアクティブカラム管理・スワイプナビゲーション・起動時復元
import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "../store/useAppStore";
import type { Column } from "../types";
import {
  IPC_EVENTS,
  OFFSCREEN,
  STORAGE_KEYS,
  WEBVIEW_SCRIPTS,
} from "../constants/ipc";
import { MOBILE_TAB_BAR_HEIGHT } from "../lib/gridLayout";
import {
  createColumnWebview,
  evalInColumn,
  resizeColumnWebview,
  setColumnCookies,
} from "../services/columnWebview";

export interface SwipeState {
  direction: "left" | "right";
  phase: "progress" | "switching";
}

export function useMobileColumns(dialogOpenRef: React.RefObject<boolean>) {
  const isMobile = useAppStore((s) => s.isMobile);
  const [activeColumnId, setActiveColumnIdState] = useState<string | null>(
    null,
  );
  const [swipeState, setSwipeState] = useState<SwipeState | null>(null);

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
        await setColumnCookies(activeCol.accountId).catch(console.error);
      }
    }

    await Promise.all(
      currentColumns.map((col) => {
        const isActive = col.id === id;
        return resizeColumnWebview(col.id, {
          x: isActive ? 0 : OFFSCREEN.MOBILE_X,
          y: isActive ? MOBILE_TAB_BAR_HEIGHT : 0,
          width: window.innerWidth,
          height: window.innerHeight - MOBILE_TAB_BAR_HEIGHT,
        }).catch(console.error);
      }),
    );
  }, []);

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
          await createColumnWebview(column, account.dataDirectory, {
            x: isActive ? 0 : OFFSCREEN.MOBILE_X,
            y: 0,
            width: window.innerWidth,
            height: window.innerHeight - MOBILE_TAB_BAR_HEIGHT,
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
        await setColumnCookies(targetColumn.accountId).catch(console.error);
        // アクティブカラムのみ表示。非アクティブカラムには RESIZE を送らず
        // onPause() を呼ばせないことでバックグラウンド読み込みを継続させる。
        await resizeColumnWebview(targetColumn.id, {
          x: 0,
          y: MOBILE_TAB_BAR_HEIGHT,
          width: window.innerWidth,
          height: window.innerHeight - MOBILE_TAB_BAR_HEIGHT,
        }).catch(console.error);
      }
    },
    [],
  );

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
      evalInColumn(activeColumnId, WEBVIEW_SCRIPTS.SCROLL_TOP_AND_RELOAD);
    });
    return () => {
      unlistenProgress.then((fn) => fn());
      unlistenCancel.then((fn) => fn());
      unlistenNavigate.then((fn) => fn());
      unlistenDoubleTap.then((fn) => fn());
    };
  }, [isMobile, activeColumnId, setActiveColumn, dialogOpenRef]);

  return {
    activeColumnId,
    setActiveColumnIdState,
    swipeState,
    setActiveColumn,
    restoreMobileColumns,
  };
}
