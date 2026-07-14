package com.natsuyasai.multicolumnx

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ColumnTouchBoundsTest {
  // 矩形: left=100, top=200, width=300, height=400 → 右端400, 下端600
  private val left = 100
  private val top = 200
  private val width = 300
  private val height = 400

  private fun withinBounds(
    x: Float,
    y: Float,
  ) = isPointWithinBounds(x, y, left, top, width, height)

  @Test
  fun `矩形の中心座標は内側と判定される`() {
    assertTrue(withinBounds(250f, 400f))
  }

  @Test
  fun `左端ちょうどの座標は内側と判定される`() {
    assertTrue(withinBounds(left.toFloat(), 400f))
  }

  @Test
  fun `上端ちょうどの座標は内側と判定される`() {
    assertTrue(withinBounds(250f, top.toFloat()))
  }

  @Test
  fun `右端ちょうどの座標は外側と判定される`() {
    assertFalse(withinBounds((left + width).toFloat(), 400f))
  }

  @Test
  fun `下端ちょうどの座標は外側と判定される`() {
    assertFalse(withinBounds(250f, (top + height).toFloat()))
  }

  @Test
  fun `左端より外側の座標は外側と判定される`() {
    assertFalse(withinBounds((left - 1).toFloat(), 400f))
  }

  @Test
  fun `右端より外側の座標は外側と判定される`() {
    assertFalse(withinBounds((left + width + 1).toFloat(), 400f))
  }

  @Test
  fun `上端より外側の座標は外側と判定される`() {
    assertFalse(withinBounds(250f, (top - 1).toFloat()))
  }

  @Test
  fun `下端より外側の座標は外側と判定される`() {
    assertFalse(withinBounds(250f, (top + height + 1).toFloat()))
  }
}