// src/hooks/useColumns.ts
import { useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../store/useAppStore';
import type { Column } from '../types';

const HEADER_HEIGHT = 36;            // ColumnHeader の高さ（px）
const SCROLLBAR_HEIGHT = 12;         // 下部スクロールバーの高さ（px）
export const SIDEBAR_COLLAPSED_WIDTH = 40;  // サイドバー折りたたみ時の幅（px）
export const SIDEBAR_EXPANDED_WIDTH = 200;  // サイドバー展開時の幅（px）

export function useColumns() {
  const { columns, accounts, addColumn, removeColumn, updateColumn, moveColumn } = useAppStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);    // ヘッダースクロールコンテナ
  const scrollbarRef = useRef<HTMLDivElement>(null); // 下部スクロールバーコンテナ

  // カラムのWebViewのboundsを計算する（scrollLeft を x から引くことでスクロール連動）
  const calculateBounds = useCallback((
    columnIndex: number,
    allColumns: Column[],
    _containerWidth: number,
    containerHeight: number,
    scrollLeft: number = 0,
    sidebarWidth: number = 0,
  ) => {
    let x = sidebarWidth;
    for (let i = 0; i < columnIndex; i++) {
      x += allColumns[i].width;
    }
    return {
      x: x - scrollLeft,
      y: HEADER_HEIGHT,
      width: allColumns[columnIndex].width,
      height: containerHeight - HEADER_HEIGHT - SCROLLBAR_HEIGHT,
    };
  }, []);

  // 全カラムのWebViewを作成（起動時に呼ぶ）
  const restoreColumns = useCallback(async () => {
    if (!containerRef.current) return;
    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;
    const scrollLeft = scrollRef.current?.scrollLeft ?? 0;
    // loadSettings() 完了後に呼ばれるため、ストアから直接最新値を取得する
    const { columns: currentColumns, accounts: currentAccounts, sidebarExpanded } = useAppStore.getState();
    const sidebarWidth = sidebarExpanded ? SIDEBAR_EXPANDED_WIDTH : SIDEBAR_COLLAPSED_WIDTH;
    const sortedColumns = [...currentColumns].sort((a, b) => a.order - b.order);

    for (let i = 0; i < sortedColumns.length; i++) {
      const column = sortedColumns[i];
      const account = currentAccounts.find((a) => a.id === column.accountId);
      if (!account) continue;

      const bounds = calculateBounds(i, sortedColumns, containerWidth, containerHeight, scrollLeft, sidebarWidth);
      await invoke('create_column_webview', {
        args: {
          column,
          dataDirectory: account.dataDirectory,
          ...bounds,
        },
      }).catch(console.error);
    }
  }, [calculateBounds]);

  // 全カラムのboundsを再計算して更新
  const recalculateAllBounds = useCallback(async () => {
    if (!containerRef.current) return;
    const containerHeight = containerRef.current.clientHeight;
    const containerWidth = containerRef.current.clientWidth;
    const scrollLeft = scrollRef.current?.scrollLeft ?? 0;
    const { columns: currentColumns, sidebarExpanded } = useAppStore.getState();
    const sidebarWidth = sidebarExpanded ? SIDEBAR_EXPANDED_WIDTH : SIDEBAR_COLLAPSED_WIDTH;
    const sortedColumns = [...currentColumns].sort((a, b) => a.order - b.order);

    for (let i = 0; i < sortedColumns.length; i++) {
      const bounds = calculateBounds(i, sortedColumns, containerWidth, containerHeight, scrollLeft, sidebarWidth);
      await invoke('resize_column_webview', {
        bounds: { columnId: sortedColumns[i].id, ...bounds },
      }).catch(console.error);
    }
  }, [calculateBounds]);

  // カラム追加
  const handleAddColumn = useCallback(async (column: Column) => {
    const account = accounts.find((a) => a.id === column.accountId);
    if (!account || !containerRef.current) return;

    const orderedColumns = [...columns, { ...column, order: columns.length }];
    const containerHeight = containerRef.current.clientHeight;
    const containerWidth = containerRef.current.clientWidth;
    const scrollLeft = scrollRef.current?.scrollLeft ?? 0;
    const { sidebarExpanded } = useAppStore.getState();
    const sidebarWidth = sidebarExpanded ? SIDEBAR_EXPANDED_WIDTH : SIDEBAR_COLLAPSED_WIDTH;
    const bounds = calculateBounds(orderedColumns.length - 1, orderedColumns, containerWidth, containerHeight, scrollLeft, sidebarWidth);

    await invoke('create_column_webview', {
      args: {
        column: { ...column, order: columns.length },
        dataDirectory: account.dataDirectory,
        ...bounds,
      },
    });

    addColumn({ ...column, order: columns.length });
  }, [columns, accounts, addColumn, calculateBounds]);

  // ダイアログ表示時に全カラムWebViewをオフスクリーンへ退避（native WebViewはz-indexを無視するため）
  const hideColumnWebviews = useCallback(async () => {
    const currentColumns = useAppStore.getState().columns;
    await Promise.all(currentColumns.map(col =>
      invoke('resize_column_webview', {
        bounds: { columnId: col.id, x: -9999, y: HEADER_HEIGHT, width: col.width, height: 1 },
      }).catch(() => {})
    ));
  }, []);

  // カラム削除
  const handleRemoveColumn = useCallback(async (columnId: string) => {
    await invoke('remove_column_webview', { columnId });
    removeColumn(columnId);
    // 残りカラムのboundsを再計算
    await recalculateAllBounds();
  }, [removeColumn, recalculateAllBounds]);

  // カラム更新（設定変更）
  const handleUpdateColumn = useCallback((id: string, patch: Partial<Column>) => {
    updateColumn(id, patch);
  }, [updateColumn]);

  // カラム移動
  const handleMoveColumn = useCallback(async (columnId: string, direction: 'left' | 'right') => {
    moveColumn(columnId, direction);
    await recalculateAllBounds();
  }, [moveColumn, recalculateAllBounds]);

  // ウィンドウリサイズ時に全カラムを再配置
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { recalculateAllBounds(); }, 100);
    };
    window.addEventListener('resize', handleResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
    };
  }, [recalculateAllBounds]);

  // ヘッダースクロール → WebView 追従 + 下部スクロールバー同期
  const handleHeaderScroll = useCallback(() => {
    recalculateAllBounds();
    if (scrollbarRef.current && scrollRef.current) {
      scrollbarRef.current.scrollLeft = scrollRef.current.scrollLeft;
    }
  }, [recalculateAllBounds]);

  // 下部スクロールバー操作 → ヘッダースクロール同期 + WebView 追従
  const handleScrollbarScroll = useCallback(() => {
    if (scrollRef.current && scrollbarRef.current) {
      scrollRef.current.scrollLeft = scrollbarRef.current.scrollLeft;
    }
    recalculateAllBounds();
  }, [recalculateAllBounds]);

  return {
    columns,
    containerRef,
    scrollRef,
    scrollbarRef,
    restoreColumns,
    handleAddColumn,
    handleRemoveColumn,
    handleMoveColumn,
    handleUpdateColumn,
    recalculateAllBounds,
    hideColumnWebviews,
    handleHeaderScroll,
    handleScrollbarScroll,
  };
}
