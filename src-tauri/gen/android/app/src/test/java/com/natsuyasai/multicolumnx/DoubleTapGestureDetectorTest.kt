package com.natsuyasai.multicolumnx

import android.view.MotionEvent
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever

class DoubleTapGestureDetectorTest {
  private lateinit var callbacks: DoubleTapGestureDetector.Callbacks
  private var currentTime = 0L

  // density=1f でテストするため、しきい値は 30px（タップ判定）・50px（ダブルタップ距離）
  private fun newDetector(): DoubleTapGestureDetector =
    DoubleTapGestureDetector(
      density = 1f,
      callbacks = callbacks,
      now = { currentTime },
    )

  @Before
  fun setUp() {
    callbacks = mock { on { isGestureBlocked() } doReturn false }
    currentTime = 0L
  }

  private fun event(
    action: Int,
    evX: Float,
    evY: Float,
  ): MotionEvent =
    mock {
      on { actionMasked } doReturn action
      on { x } doReturn evX
      on { y } doReturn evY
    }

  private fun down(
    x: Float,
    y: Float,
  ) = event(MotionEvent.ACTION_DOWN, x, y)

  private fun move(
    x: Float,
    y: Float,
  ) = event(MotionEvent.ACTION_MOVE, x, y)

  private fun up(
    x: Float,
    y: Float,
  ) = event(MotionEvent.ACTION_UP, x, y)

  @Test
  fun `300ms以内の2回タップで onDoubleTap が発火する`() {
    val detector = newDetector()

    currentTime = 1000L
    detector.onTouchEvent(down(500f, 500f))
    detector.onTouchEvent(up(500f, 500f))
    currentTime = 1200L
    detector.onTouchEvent(down(505f, 505f))
    detector.onTouchEvent(up(505f, 505f))

    verify(callbacks).onDoubleTap()
  }

  @Test
  fun `タップ間隔が300msを超えると onDoubleTap は発火しない`() {
    val detector = newDetector()

    currentTime = 1000L
    detector.onTouchEvent(down(500f, 500f))
    detector.onTouchEvent(up(500f, 500f))
    currentTime = 2000L
    detector.onTouchEvent(down(500f, 500f))
    detector.onTouchEvent(up(500f, 500f))

    verify(callbacks, never()).onDoubleTap()
  }

  @Test
  fun `タップ位置が50pxを超えて離れていると onDoubleTap は発火しない`() {
    val detector = newDetector()

    currentTime = 1000L
    detector.onTouchEvent(down(500f, 500f))
    detector.onTouchEvent(up(500f, 500f))
    currentTime = 1200L
    detector.onTouchEvent(down(600f, 500f))
    detector.onTouchEvent(up(600f, 500f))

    verify(callbacks, never()).onDoubleTap()
  }

  @Test
  fun `指が大きく動いたタップはダブルタップとして扱わない`() {
    val detector = newDetector()

    currentTime = 1000L
    detector.onTouchEvent(down(500f, 500f))
    detector.onTouchEvent(up(500f, 500f))
    currentTime = 1200L
    detector.onTouchEvent(down(500f, 500f))
    detector.onTouchEvent(move(560f, 500f)) // 30px を超えて移動 → タップではない
    detector.onTouchEvent(up(560f, 500f))

    verify(callbacks, never()).onDoubleTap()
  }

  @Test
  fun `ダブルタップ成立後はリセットされ3回目のタップでは発火しない`() {
    val detector = newDetector()

    currentTime = 1000L
    detector.onTouchEvent(down(500f, 500f))
    detector.onTouchEvent(up(500f, 500f))
    currentTime = 1200L
    detector.onTouchEvent(down(500f, 500f))
    detector.onTouchEvent(up(500f, 500f)) // ここで1回発火
    currentTime = 1400L
    detector.onTouchEvent(down(500f, 500f))
    detector.onTouchEvent(up(500f, 500f)) // リセット済みのため発火しない

    verify(callbacks, times(1)).onDoubleTap()
  }

  @Test
  fun `isGestureBlocked が true の間はダブルタップが発火しない`() {
    whenever(callbacks.isGestureBlocked()).thenReturn(true)
    val detector = newDetector()

    currentTime = 1000L
    detector.onTouchEvent(down(500f, 500f))
    detector.onTouchEvent(up(500f, 500f))
    currentTime = 1200L
    detector.onTouchEvent(down(500f, 500f))
    detector.onTouchEvent(up(500f, 500f))

    verify(callbacks, never()).onDoubleTap()
  }

  @Test
  fun `ACTION_CANCELではダブルタップを検出しない`() {
    val detector = newDetector()

    currentTime = 1000L
    detector.onTouchEvent(down(500f, 500f))
    detector.onTouchEvent(event(MotionEvent.ACTION_CANCEL, 500f, 500f))
    currentTime = 1200L
    detector.onTouchEvent(down(500f, 500f))
    detector.onTouchEvent(event(MotionEvent.ACTION_CANCEL, 500f, 500f))

    verify(callbacks, never()).onDoubleTap()
  }
}