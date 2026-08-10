package com.natsuyasai.multicolumnx

import kotlin.math.abs

/**
 * スワイプバーのタッチ判定ロジック（純粋関数）。
 *
 * [SwipeBarOverlayView] から呼ばれる。MotionEvent や Android View に依存させず、
 * dx/dy の数値だけで判定できる形に切り出すことで、実機・エミュレータ無しの
 * 単体テストで境界値（しきい値ちょうど、しきい値未満、斜め方向優勢時）を検証できるようにする。
 *
 * 判定ロジックは React 版 `src/components/MobileSwipeBar/MobileSwipeBar.tsx` の
 * handleMove（進捗判定）/ handleEnd（確定判定）と同じ:
 * - |dx| がしきい値未満、または |dx| <= |dy|（縦移動が横移動以上＝斜め方向優勢）なら方向なし（null）
 * - それ以外は dx < 0 なら "left"、そうでなければ "right"
 */
object SwipeGestureResolver {
  /**
   * 確定スワイプ（[SwipeBarOverlayView] の onNavigate）の最小移動量（dp）。
   * MobileSwipeBar.tsx の MIN_SWIPE_PX と同じ数値をそのまま dp として使う。
   */
  const val MIN_SWIPE_DP = 40f

  /**
   * 進捗表示（[SwipeBarOverlayView] の onProgress）を始める最小移動量（dp）。
   * MobileSwipeBar.tsx の PROGRESS_MIN_PX と同じ数値をそのまま dp として使う。
   */
  const val PROGRESS_MIN_DP = 10f

  /**
   * 指の移動量 (dx, dy) としきい値（px）から、スワイプの方向を判定する。
   * しきい値未満、または斜め方向優勢（|dx| <= |dy|）の場合は null（方向なし）を返す。
   */
  fun resolveDirection(
    dx: Float,
    dy: Float,
    thresholdPx: Float,
  ): String? {
    if (abs(dx) < thresholdPx || abs(dx) <= abs(dy)) return null
    return if (dx < 0) "left" else "right"
  }
}