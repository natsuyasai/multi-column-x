// src/hooks/useMobileColumns.ts
// モバイル（Android）のアクティブカラム管理・スワイプナビゲーション・起動時復元
import { useCallback, useState } from "react";
import { STORAGE_KEYS } from "../constants/ipc";
import { mobileColumnLayout, resolveSwipeAreaHeight } from "../lib/gridLayout";
import { logError } from "../lib/log";
import {
  createColumnWebview,
  resizeColumnWebview,
  setColumnCookies,
} from "../services/columnWebview";
import { resolveColumnDataDirectory } from "../services/externalColumn";
import { useAppStore } from "../store/useAppStore";
import type { Column } from "../types";

export interface SwipeState {
  direction: "left" | "right";
  phase: "progress" | "switching";
}

/** 設定 ON && Profile API 対応（Android）を合成した2カラム有効判定 */
export function resolveTwoColumnEnabled(): boolean {
  const { globalSettings, profileApiSupported } = useAppStore.getState();
  return globalSettings.mobileTwoColumnEnabled && profileApiSupported;
}

export function useMobileColumns(dialogOpenRef: React.RefObject<boolean>) {
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

    const layout = mobileColumnLayout({
      columns: currentColumns,
      activeColumnId: id,
      twoColumnEnabled: resolveTwoColumnEnabled(),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      swipeAreaHeight,
    });
    // 非表示（hide）分は並列でよい。表示（show）分は Kotlin 側
    // activeColumnWebViewId（戻るボタン/ダブルタップ対象）が最後の
    // showColumnWebView で決まるため、アクティブカラムを必ず最後に送る。
    const hidden = currentColumns.filter((c) => layout[c.id].x < 0);
    const shown = currentColumns
      .filter((c) => layout[c.id].x >= 0)
      .sort((a, b) => (a.id === id ? 1 : b.id === id ? -1 : 0)); // active を末尾へ
    await Promise.all(
      hidden.map((col) =>
        resizeColumnWebview(col.id, layout[col.id]).catch(
          logError("setActiveColumn:resizeColumnWebview"),
        ),
      ),
    );
    for (const col of shown) {
      await resizeColumnWebview(col.id, layout[col.id]).catch(
        logError("setActiveColumn:resizeColumnWebview"),
      );
    }
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
      const layout = mobileColumnLayout({
        columns: sortedByOrder,
        activeColumnId: targetColumn?.id ?? null,
        twoColumnEnabled: resolveTwoColumnEnabled(),
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        swipeAreaHeight,
      });
      // 全カラムを並列作成して loadUrl を一斉に開始する。mobile の
      // create_column_webview は visible = args.x >= 0.0 で可視判定するため、
      // 表示ペア（1〜2枚）が visible で作成される。
      await Promise.all(
        sortedByOrder.map(async (column) => {
          const dataDirectory = await resolveColumnDataDirectory(
            column,
            currentAccounts,
          );
          if (dataDirectory === undefined) return;
          await createColumnWebview(
            column,
            dataDirectory,
            layout[column.id],
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
        // 表示ペアのみ resize する（アクティブを最後に送る。理由は setActiveColumn と同じ）。
        // 非表示カラムには従来どおり resize を送らず、onPause() を呼ばせないことで
        // バックグラウンド読み込みを継続させる。
        const shown = sortedByOrder
          .filter((col) => layout[col.id].x >= 0)
          .sort((a, b) =>
            a.id === targetColumn.id ? 1 : b.id === targetColumn.id ? -1 : 0,
          );
        for (const col of shown) {
          await resizeColumnWebview(col.id, layout[col.id]).catch(
            logError("restoreMobileColumns:resizeColumnWebview"),
          );
        }
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

  return {
    activeColumnId,
    setActiveColumnIdState,
    swipeState,
    setActiveColumn,
    navigateColumn,
    restoreMobileColumns,
  };
}
