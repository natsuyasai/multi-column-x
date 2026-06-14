// src/hooks/useMobileColumns.ts
// モバイル（Android）のアクティブカラム管理・スワイプナビゲーション・起動時復元
import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "../store/useAppStore";
import type { Column } from "../types";
import { IPC_EVENTS, STORAGE_KEYS, WEBVIEW_SCRIPTS } from "../constants/ipc";
import { mobileColumnBounds, resolveSwipeAreaHeight } from "../lib/gridLayout";
import { logError } from "../lib/log";
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
    const {
      columns: currentColumns,
      isMobile,
      globalSettings,
    } = useAppStore.getState();
    const swipeAreaHeight = resolveSwipeAreaHeight(globalSettings);

    // モバイル: resize_column_webview より先にアクティブカラムのクッキーを切り替える。
    // CookieManager は共有のため、WebView が表示される前に正しいアカウントを設定する必要がある。
    if (isMobile) {
      const activeCol = currentColumns.find((c) => c.id === id);
      if (activeCol) {
        await setColumnCookies(activeCol.accountId).catch(
          logError("setActiveColumn:setColumnCookies"),
        );
      }
    }

    await Promise.all(
      currentColumns.map((col) => {
        const bounds = mobileColumnBounds({
          isActive: col.id === id,
          swipeAreaHeight,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
        });
        return resizeColumnWebview(col.id, bounds).catch(
          logError("setActiveColumn:resizeColumnWebview"),
        );
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
      const { globalSettings } = useAppStore.getState();
      const swipeAreaHeight = resolveSwipeAreaHeight(globalSettings);
      // 全カラムを並列作成して loadUrl を一斉に開始する
      await Promise.all(
        sortedByOrder.map(async (column) => {
          const account = currentAccounts.find(
            (a) => a.id === column.accountId,
          );
          if (!account) return;
          const isActive = column.id === targetColumn?.id;
          await createColumnWebview(
            column,
            account.dataDirectory,
            mobileColumnBounds({
              isActive,
              swipeAreaHeight,
              viewportWidth: window.innerWidth,
              viewportHeight: window.innerHeight,
            }),
          ).catch(logError("restoreMobileColumns:createColumnWebview"));
        }),
      );
      if (targetColumn) {
        // activeColumnId を保存（バックグラウンド復帰後の復元用）
        setActiveColumnIdState(targetColumn.id);
        try {
          localStorage.setItem(STORAGE_KEYS.ACTIVE_COLUMN_ID, targetColumn.id);
        } catch {}
        // Cookie 設定（認証に必要）
        await setColumnCookies(targetColumn.accountId).catch(
          logError("restoreMobileColumns:setColumnCookies"),
        );
        // アクティブカラムのみ表示。非アクティブカラムには RESIZE を送らず
        // onPause() を呼ばせないことでバックグラウンド読み込みを継続させる。
        await resizeColumnWebview(
          targetColumn.id,
          mobileColumnBounds({
            isActive: true,
            swipeAreaHeight,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
          }),
        ).catch(logError("restoreMobileColumns:resizeColumnWebview"));
      }
    },
    [],
  );

  // 前後カラムへの切替（ネイティブジェスチャー経路・タブバーフリック経路の両方から呼ぶ）
  const navigateColumn = useCallback(
    (direction: "left" | "right") => {
      if (dialogOpenRef.current) return;
      const { columns: cols } = useAppStore.getState();
      const sorted = [...cols].sort((a, b) => a.order - b.order);
      const currentIdx = sorted.findIndex((c) => c.id === activeColumnId);
      if (currentIdx < 0) return;
      const targetIdx = direction === "left" ? currentIdx + 1 : currentIdx - 1;
      if (targetIdx < 0 || targetIdx >= sorted.length) return;
      setSwipeState({ direction, phase: "switching" });
      setTimeout(() => setSwipeState(null), 400);
      setActiveColumn(sorted[targetIdx].id);
    },
    [activeColumnId, setActiveColumn, dialogOpenRef],
  );

  // アクティブカラムのダブルタップ（先頭スクロール＋リロード）。
  // 横スワイプによるカラム切替は MobileSwipeBar（navigateColumn）が担うため、
  // ここではネイティブのダブルタップイベントのみを購読する。
  useEffect(() => {
    if (!isMobile) return;
    const unlistenDoubleTap = listen(IPC_EVENTS.COLUMN_DOUBLE_TAP, () => {
      if (dialogOpenRef.current) return;
      if (!activeColumnId) return;
      evalInColumn(activeColumnId, WEBVIEW_SCRIPTS.SCROLL_TOP_AND_RELOAD);
    });
    return () => {
      unlistenDoubleTap.then((fn) => fn());
    };
  }, [isMobile, activeColumnId, dialogOpenRef]);

  return {
    activeColumnId,
    setActiveColumnIdState,
    swipeState,
    setActiveColumn,
    navigateColumn,
    restoreMobileColumns,
  };
}
