package com.natsuyasai.multicolumnx

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** SwipeGestureResolver（スワイプバーのタッチ判定）の境界値テスト。 */
class SwipeGestureResolverTest {
  @Test
  fun `右方向への移動がしきい値ちょうどなら右方向と判定される`() {
    assertEquals("right", SwipeGestureResolver.resolveDirection(dx = 40f, dy = 0f, thresholdPx = 40f))
  }

  @Test
  fun `左方向への移動がしきい値ちょうどなら左方向と判定される`() {
    assertEquals("left", SwipeGestureResolver.resolveDirection(dx = -40f, dy = 0f, thresholdPx = 40f))
  }

  @Test
  fun `移動量がしきい値未満なら方向なしと判定される`() {
    assertNull(SwipeGestureResolver.resolveDirection(dx = 39f, dy = 0f, thresholdPx = 40f))
  }

  @Test
  fun `進捗用しきい値ちょうどの移動なら方向と判定される`() {
    assertEquals(
      "right",
      SwipeGestureResolver.resolveDirection(
        dx = SwipeGestureResolver.PROGRESS_MIN_DP,
        dy = 0f,
        thresholdPx = SwipeGestureResolver.PROGRESS_MIN_DP,
      ),
    )
  }

  @Test
  fun `進捗用しきい値未満の移動なら方向なしと判定される`() {
    assertNull(
      SwipeGestureResolver.resolveDirection(
        dx = SwipeGestureResolver.PROGRESS_MIN_DP - 1f,
        dy = 0f,
        thresholdPx = SwipeGestureResolver.PROGRESS_MIN_DP,
      ),
    )
  }

  @Test
  fun `横移動と縦移動が同じ大きさの斜め方向なら方向なしと判定される`() {
    assertNull(SwipeGestureResolver.resolveDirection(dx = 40f, dy = 40f, thresholdPx = 40f))
  }

  @Test
  fun `縦移動が横移動より大きい斜め方向なら方向なしと判定される`() {
    assertNull(SwipeGestureResolver.resolveDirection(dx = 20f, dy = 100f, thresholdPx = 10f))
  }

  @Test
  fun `斜め方向でも横移動がわずかに優勢なら方向と判定される`() {
    assertEquals("right", SwipeGestureResolver.resolveDirection(dx = 41f, dy = 40f, thresholdPx = 40f))
  }

  // isTap のテスト
  @Test
  fun `dxとdyが両方ともタップしきい値未満ならタップと判定される`() {
    assertTrue(SwipeGestureResolver.isTap(dx = 5f, dy = 5f, tapSlopPx = 10f))
  }

  @Test
  fun `dxがタップしきい値ちょうどならタップと判定されない`() {
    assertFalse(SwipeGestureResolver.isTap(dx = 10f, dy = 5f, tapSlopPx = 10f))
  }

  @Test
  fun `dyがタップしきい値ちょうどならタップと判定されない`() {
    assertFalse(SwipeGestureResolver.isTap(dx = 5f, dy = 10f, tapSlopPx = 10f))
  }

  // isDoubleTap のテスト
  @Test
  fun `経過時間がダブルタップ閾値未満ならダブルタップと判定される`() {
    assertTrue(SwipeGestureResolver.isDoubleTap(nowMs = 200L, previousTapMs = 0L, maxGapMs = 300L))
  }

  @Test
  fun `経過時間がダブルタップ閾値ちょうどならダブルタップと判定されない`() {
    assertFalse(SwipeGestureResolver.isDoubleTap(nowMs = 300L, previousTapMs = 0L, maxGapMs = 300L))
  }

  @Test
  fun `経過時間がダブルタップ閾値を超過ならダブルタップと判定されない`() {
    assertFalse(SwipeGestureResolver.isDoubleTap(nowMs = 400L, previousTapMs = 0L, maxGapMs = 300L))
  }
}