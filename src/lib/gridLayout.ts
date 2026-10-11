// src/lib/gridLayout.ts
// カラムのグリッド配置に関する純粋な座標計算（Tauri 非依存）
import { OFFSCREEN } from "../constants/ipc";
import type { Column } from "../types";
import { remToPx } from "./uiScale";

// レイアウト高さは rem 値で持つ（SCSS 側の同名寸法と同じ rem 値に保つこと）。
// ネイティブ WebView の bounds へ渡す px は get*Height() が remToPx 経由で返す。
export const HEADER_HEIGHT_REM = 2.25; // ColumnHeader の高さ
export const SCROLLBAR_HEIGHT_REM = 0.75; // 下部スクロールバーの高さ
export const MOBILE_TAB_BAR_HEIGHT_REM = 3.5; // モバイルタブバーの高さ
export const TOPBAR_COLLAPSED_HEIGHT_REM = 2; // TopBar 折りたたみ時の高さ
export const TOPBAR_EXPANDED_HEIGHT_REM = 4; // TopBar 展開時の高さ（2行レイアウト）

export function getHeaderHeight(): number {
  return remToPx(HEADER_HEIGHT_REM);
}

export function getScrollbarHeight(): number {
  return remToPx(SCROLLBAR_HEIGHT_REM);
}

export function getMobileTabBarHeight(): number {
  return remToPx(MOBILE_TAB_BAR_HEIGHT_REM);
}

export function getTopBarHeight(topBarExpanded: boolean): number {
  return remToPx(
    topBarExpanded ? TOPBAR_EXPANDED_HEIGHT_REM : TOPBAR_COLLAPSED_HEIGHT_REM,
  );
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

/** 複数カラム表示時の 1 列あたりの最小幅（dp）。これを下回る列数は自動で減らす */
export const MOBILE_MIN_COLUMN_WIDTH = 300;
export const MOBILE_COLUMN_COUNT_MIN = 2;
export const MOBILE_COLUMN_COUNT_MAX = 6;

/** 列数設定を 2〜6 の整数へ丸める（非整数/NaN は 2、小数は切り捨て） */
export function clampMobileColumnCount(n: number): number {
  if (typeof n !== "number" || !Number.isFinite(n))
    return MOBILE_COLUMN_COUNT_MIN;
  return Math.min(
    MOBILE_COLUMN_COUNT_MAX,
    Math.max(MOBILE_COLUMN_COUNT_MIN, Math.floor(n)),
  );
}

interface MobileColumnLayoutInput {
  /** order 順ソート不要（関数内でソートする） */
  columns: Pick<Column, "id" | "order">[];
  /** null なら全カラム非表示（hideColumnWebviews 用途） */
  activeColumnId: string | null;
  /** 設定 ON && Profile API 対応 を呼び出し側で合成して渡す */
  twoColumnEnabled: boolean;
  /** 複数カラム表示の列数設定（2〜6 に丸められる。未設定は 2 扱い） */
  columnCount: number;
  viewportWidth: number;
  viewportHeight: number;
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
    columnCount,
    viewportWidth,
    viewportHeight,
  } = input;

  const height = viewportHeight - getMobileTabBarHeight();
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

  // 有効列数: 設定値・1列最小幅に収まる列数・登録カラム数の最小値
  const visibleCount = Math.min(
    clampMobileColumnCount(columnCount),
    Math.floor(viewportWidth / MOBILE_MIN_COLUMN_WIDTH),
    sorted.length,
  );
  const multiColumnActive =
    twoColumnEnabled &&
    viewportWidth >= MOBILE_TWO_COLUMN_MIN_WIDTH &&
    visibleCount >= 2;

  if (!multiColumnActive) {
    result[activeColumnId] = {
      x: 0,
      y: 0,
      width: viewportWidth,
      height,
    };
    return result;
  }

  // 窓の先頭 index を決める。末尾付近がアクティブなら左へずらして N 列を保つ。
  const startIdx = Math.min(activeIdx, sorted.length - visibleCount);
  const baseWidth = Math.floor(viewportWidth / visibleCount);
  for (let i = 0; i < visibleCount; i++) {
    const isLast = i === visibleCount - 1;
    result[sorted[startIdx + i].id] = {
      x: i * baseWidth,
      y: 0,
      width: isLast ? viewportWidth - baseWidth * i : baseWidth,
      height,
    };
  }

  return result;
}
