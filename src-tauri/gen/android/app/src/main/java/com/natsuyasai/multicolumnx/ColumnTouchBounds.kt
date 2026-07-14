package com.natsuyasai.multicolumnx

/**
 * タッチ座標がカラム WebView の矩形範囲内かを判定する純粋関数。
 * MainActivity から座標系依存のロジックを分離し単体テスト可能にする。
 * 右端・下端は幅/高さ分ちょうどの座標を含まない（半開区間 [left, left+width) x [top, top+height)）。
 */
fun isPointWithinBounds(
  x: Float,
  y: Float,
  left: Int,
  top: Int,
  width: Int,
  height: Int,
): Boolean {
  return x >= left && x < left + width && y >= top && y < top + height
}