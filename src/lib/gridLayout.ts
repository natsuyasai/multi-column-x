// src/lib/gridLayout.ts
// カラムのグリッド配置に関する純粋な座標計算（Tauri 非依存）
import { OFFSCREEN } from "../constants/ipc";
import type { Column } from "../types";

export const HEADER_HEIGHT = 36; // ColumnHeader の高さ（px）
export const SCROLLBAR_HEIGHT = 12; // 下部スクロールバーの高さ（px）
export const MOBILE_TAB_BAR_HEIGHT = 56; // モバイルタブバーの高さ（px）
export const TOPBAR_COLLAPSED_HEIGHT = 32; // TopBar 折りたたみ時の高さ（px）
export const TOPBAR_EXPANDED_HEIGHT = 64; // TopBar 展開時の高さ（px、2行レイアウト）

export function getTopBarHeight(topBarExpanded: boolean): number {
  return topBarExpanded ? TOPBAR_EXPANDED_HEIGHT : TOPBAR_COLLAPSED_HEIGHT;
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
  headerHeight: number;
  scrollbarHeight: number;
  /** 横方向ツールバーの高さ（省略時は 0）。bounds.y のオフセットに使う。 */
  topBarHeight?: number;
}

export function calculateGridBounds(
  columns: Column[],
  opts: GridBoundsOptions,
): Record<string, ColumnBounds> {
  const {
    containerHeight,
    scrollLeft,
    headerHeight,
    scrollbarHeight,
    topBarHeight = 0,
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
  let xOffset = 0;

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
        y: topBarHeight + Math.round(yOffset) + headerHeight,
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

interface SwipeAreaSettings {
  mobileSwipeAreaEnabled: boolean;
  mobileSwipeAreaHeight: number;
}

/** スワイプ帯が有効なら高さ、無効なら0を返す。 */
export function resolveSwipeAreaHeight(s: SwipeAreaSettings): number {
  return s.mobileSwipeAreaEnabled ? s.mobileSwipeAreaHeight : 0;
}

/** 2カラム表示に切り替える最小ビューポート幅（CSS px ≒ dp。Android sw600dp タブレット基準） */
export const MOBILE_TWO_COLUMN_MIN_WIDTH = 600;

interface MobileColumnLayoutInput {
  /** order 順ソート不要（関数内でソートする） */
  columns: Pick<Column, "id" | "order">[];
  /** null なら全カラム非表示（hideColumnWebviews 用途） */
  activeColumnId: string | null;
  /** 設定 ON && Profile API 対応 を呼び出し側で合成して渡す */
  twoColumnEnabled: boolean;
  viewportWidth: number;
  viewportHeight: number;
  swipeAreaHeight: number;
}

/**
 * モバイルの全カラム WebView 配置を一元決定する純粋関数。
 * 戻り値は Record<columnId, ColumnBounds>。非表示カラムは x=OFFSCREEN.MOBILE_X。
 */
export function mobileColumnLayout(
  input: MobileColumnLayoutInput,
): Record<string, ColumnBounds> {
  const {
    columns,
    activeColumnId,
    twoColumnEnabled,
    viewportWidth,
    viewportHeight,
    swipeAreaHeight,
  } = input;

  const height = viewportHeight - (MOBILE_TAB_BAR_HEIGHT + swipeAreaHeight);
  const offscreenBounds = (): ColumnBounds => ({
    x: OFFSCREEN.MOBILE_X,
    y: 0,
    width: viewportWidth,
    height,
  });

  const result: Record<string, ColumnBounds> = {};
  for (const col of columns) {
    result[col.id] = offscreenBounds();
  }

  if (activeColumnId == null) {
    return result;
  }

  const sorted = [...columns].sort((a, b) => a.order - b.order);
  const activeIdx = sorted.findIndex((c) => c.id === activeColumnId);
  if (activeIdx === -1) {
    // フォールバックせず安全側（全カラム非表示のまま）
    return result;
  }

  const twoColumnActive =
    twoColumnEnabled &&
    viewportWidth >= MOBILE_TWO_COLUMN_MIN_WIDTH &&
    sorted.length >= 2;

  if (!twoColumnActive) {
    result[activeColumnId] = {
      x: 0,
      y: 0,
      width: viewportWidth,
      height,
    };
    return result;
  }

  // ペア窓の先頭 index を決める。末尾要素がアクティブならクランプして左隣とペアにする。
  const pairStartIdx = Math.min(activeIdx, sorted.length - 2);
  const leftWidth = Math.floor(viewportWidth / 2);
  const rightWidth = viewportWidth - leftWidth;

  const leftCol = sorted[pairStartIdx];
  const rightCol = sorted[pairStartIdx + 1];

  result[leftCol.id] = { x: 0, y: 0, width: leftWidth, height };
  result[rightCol.id] = { x: leftWidth, y: 0, width: rightWidth, height };

  return result;
}
