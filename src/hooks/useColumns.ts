// src/hooks/useColumns.ts
import { useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../store/useAppStore';
import type { Column } from '../types';

const HEADER_HEIGHT = 36; // ColumnHeaderの高さ（px）

export function useColumns() {
  const { columns, accounts, addColumn, removeColumn, updateColumn } = useAppStore();
  const containerRef = useRef<HTMLDivElement>(null);

  // カラムのWebViewのboundsを計算する
  const calculateBounds = useCallback((
    columnIndex: number,
    allColumns: Column[],
    _containerWidth: number,
    containerHeight: number
  ) => {
    let x = 0;
    for (let i = 0; i < columnIndex; i++) {
      x += allColumns[i].width;
    }
    return {
      x,
      y: HEADER_HEIGHT,
      width: allColumns[columnIndex].width,
      height: containerHeight - HEADER_HEIGHT,
    };
  }, []);

  // 全カラムのWebViewを作成（起動時に呼ぶ）
  const restoreColumns = useCallback(async () => {
    if (!containerRef.current) return;
    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;
    const sortedColumns = [...columns].sort((a, b) => a.order - b.order);

    for (let i = 0; i < sortedColumns.length; i++) {
      const column = sortedColumns[i];
      const account = accounts.find((a) => a.id === column.accountId);
      if (!account) continue;

      const bounds = calculateBounds(i, sortedColumns, containerWidth, containerHeight);
      await invoke('create_column_webview', {
        args: {
          column,
          dataDirectory: account.dataDirectory,
          ...bounds,
        },
      }).catch(console.error);
    }
  }, [columns, accounts, calculateBounds]);

  // 全カラムのboundsを再計算して更新
  const recalculateAllBounds = useCallback(async () => {
    if (!containerRef.current) return;
    const containerHeight = containerRef.current.clientHeight;
    const containerWidth = containerRef.current.clientWidth;
    const currentColumns = useAppStore.getState().columns;
    const sortedColumns = [...currentColumns].sort((a, b) => a.order - b.order);

    for (let i = 0; i < sortedColumns.length; i++) {
      const bounds = calculateBounds(i, sortedColumns, containerWidth, containerHeight);
      await invoke('resize_column_webview', {
        bounds: { columnId: sortedColumns[i].id, ...bounds },
      }).catch(console.error);
    }
  }, [calculateBounds]); // No longer depends on `columns`

  // カラム追加
  const handleAddColumn = useCallback(async (column: Column) => {
    const account = accounts.find((a) => a.id === column.accountId);
    if (!account || !containerRef.current) return;

    const orderedColumns = [...columns, { ...column, order: columns.length }];
    const containerHeight = containerRef.current.clientHeight;
    const containerWidth = containerRef.current.clientWidth;
    const bounds = calculateBounds(orderedColumns.length - 1, orderedColumns, containerWidth, containerHeight);

    await invoke('create_column_webview', {
      args: {
        column: { ...column, order: columns.length },
        dataDirectory: account.dataDirectory,
        ...bounds,
      },
    });

    addColumn({ ...column, order: columns.length });
  }, [columns, accounts, addColumn, calculateBounds]);

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

  return {
    columns,
    containerRef,
    restoreColumns,
    handleAddColumn,
    handleRemoveColumn,
    handleUpdateColumn,
    recalculateAllBounds,
  };
}
