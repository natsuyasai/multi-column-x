// src/hooks/useColumnNavigation.ts
// カラムへのジャンプ・スクロールバー追従・手動更新（先頭スクロール＋リロード）を
// まとめたフック。「フォーカスカラム」の状態もここに閉じ込める。
import { useCallback, useState } from "react";
import { WEBVIEW_SCRIPTS } from "@/constants/ipc";
import type { ColumnBounds } from "@/lib/gridLayout";
import { evalInColumn } from "@/services/columnWebview";
import type { Column } from "@/types";

interface UseColumnNavigationArgs {
  columns: Column[];
  columnBounds: Record<string, ColumnBounds>;
  scrollbarRef: React.RefObject<HTMLDivElement | null>;
}

interface UseColumnNavigationResult {
  handleJumpToColumn: (columnId: string) => void;
  handleJumpToColumnByIndex: (index: number) => void;
  handleReload: (columnId: string) => Promise<void>;
  handleReloadFocusedColumn: () => void;
  handleDoubleTapColumn: (columnId: string) => void;
}

export function useColumnNavigation({
  columns,
  columnBounds,
  scrollbarRef,
}: UseColumnNavigationArgs): UseColumnNavigationResult {
  // 「フォーカスカラム」= 最後に 1-9 ジャンプ／TopBar クリックでジャンプしたカラム。
  // r キーでのリロード対象を決めるために使う（無ければ order 最小の先頭カラムにフォールバック）。
  const [lastFocusedColumnId, setLastFocusedColumnId] = useState<string | null>(
    null,
  );

  const handleJumpToColumn = useCallback(
    (columnId: string) => {
      setLastFocusedColumnId(columnId);
      const el = scrollbarRef.current;
      if (!el) return;
      const bounds = columnBounds[columnId];
      if (!bounds) return;
      const currentScroll = el.scrollLeft ?? 0;
      el.scrollLeft = currentScroll + bounds.x;
    },
    [columnBounds, scrollbarRef],
  );

  const handleJumpToColumnByIndex = useCallback(
    (index: number) => {
      const sorted = [...columns].sort((a, b) => a.order - b.order);
      const col = sorted[index];
      if (col) handleJumpToColumn(col.id);
    },
    [columns, handleJumpToColumn],
  );

  // 手動更新（ヘッダー・設定パネル・r キー）: スクロール位置にかかわらず先頭へ戻して更新する
  const handleReload = useCallback(async (columnId: string) => {
    await evalInColumn(columnId, WEBVIEW_SCRIPTS.SCROLL_TOP_AND_RELOAD);
  }, []);

  // タブバーのダブルタップ／カラムヘッダーの先頭スクロールボタン共通: 対象カラムを先頭スクロール＋リロードする
  const handleDoubleTapColumn = useCallback((columnId: string) => {
    evalInColumn(columnId, WEBVIEW_SCRIPTS.SCROLL_TOP_AND_RELOAD);
  }, []);

  // r キー用: フォーカスカラム（無ければ order 最小の先頭カラム）をリロードする
  const handleReloadFocusedColumn = useCallback(() => {
    const sorted = [...columns].sort((a, b) => a.order - b.order);
    const target =
      columns.find((c) => c.id === lastFocusedColumnId) ?? sorted[0];
    if (target) handleReload(target.id);
  }, [columns, lastFocusedColumnId, handleReload]);

  return {
    handleJumpToColumn,
    handleJumpToColumnByIndex,
    handleReload,
    handleReloadFocusedColumn,
    handleDoubleTapColumn,
  };
}
