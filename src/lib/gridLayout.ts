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

interface MobileColumnBoundsInput {
  isActive: boolean;
  swipeAreaHeight: number;
  viewportWidth: number;
  viewportHeight: number;
}

/**
 * モバイル column WebView の配置を算出する純粋関数。
 * 下部に タブバー(56px) + スワイプ帯(swipeAreaHeight) を確保し、
 * 非アクティブは画面外(x=OFFSCREEN.MOBILE_X)へ退避する。
 */
export function mobileColumnBounds(input: MobileColumnBoundsInput): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const reservedBottom = MOBILE_TAB_BAR_HEIGHT + input.swipeAreaHeight;
  return {
    x: input.isActive ? 0 : OFFSCREEN.MOBILE_X,
    y: 0,
    width: input.viewportWidth,
    height: input.viewportHeight - reservedBottom,
  };
}
