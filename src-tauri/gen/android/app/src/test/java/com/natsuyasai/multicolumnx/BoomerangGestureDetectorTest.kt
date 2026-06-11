package com.natsuyasai.multicolumnx

import android.view.MotionEvent
import android.view.VelocityTracker
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever

class BoomerangGestureDetectorTest {
  private lateinit var callbacks: BoomerangGestureDetector.Callbacks
  private lateinit var velocityTracker: VelocityTracker
  private var currentTime = 0L

  // density=1f でテストするため、しきい値は 30px（逆引き/前進）・50px（ダブルタップ）・300px/s（速度）
  private fun newDetector(): BoomerangGestureDetector =
    BoomerangGestureDetector(
      density = 1f,
      callbacks = callbacks,
      velocityTrackerProvider = { velocityTracker },
      now = { currentTime },
    )

  @Before
  fun setUp() {
    callbacks = mock { on { isGestureBlocked() } doReturn false }
    velocityTracker = mock()
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
  fun `左引きから右リリースで onSwipeProgress と onSwipeNavigate right が発火する`() {
    whenever(velocityTracker.xVelocity).thenReturn(500f)
    val detector = newDetector()

    detector.onTouchEvent(down(500f, 500f))
    detector.onTouchEvent(move(400f, 500f)) // 左へ100px → REVERSE("left")
    detector.onTouchEvent(move(450f, 500f)) // 最端点から右へ50px → FORWARD
    detector.onTouchEvent(up(450f, 500f)) // 右方向へ速度500px/s → navigate

    verify(callbacks).onSwipeProgress("right")
    verify(callbacks).onSwipeNavigate("right")
    verify(callbacks, never()).onSwipeCancel()
  }

  @Test
  fun `右引きから左リリースで onSwipeNavigate left が発火する`() {
    whenever(velocityTracker.xVelocity).thenReturn(-500f)
    val detector = newDetector()

    detector.onTouchEvent(down(500f, 500f))
    detector.onTouchEvent(move(600f, 500f)) // 右へ100px → REVERSE("right")
    detector.onTouchEvent(move(550f, 500f)) // 最端点から左へ50px → FORWARD
    detector.onTouchEvent(up(550f, 500f)) // 左方向へ速度500px/s → navigate

    verify(callbacks).onSwipeProgress("left")
    verify(callbacks).onSwipeNavigate("left")
  }

  @Test
  fun `前進方向の速度が不足する場合は onSwipeCancel が発火する`() {
    whenever(velocityTracker.xVelocity).thenReturn(100f) // 300px/s 未満
    val detector = newDetector()

    detector.onTouchEvent(down(500f, 500f))
    detector.onTouchEvent(move(400f, 500f))
    detector.onTouchEvent(move(450f, 500f)) // FORWARD（progress 発火済み）
    detector.onTouchEvent(up(450f, 500f))

    verify(callbacks).onSwipeProgress("right")
    verify(callbacks, never()).onSwipeNavigate("right")
    verify(callbacks).onSwipeCancel()
  }

  @Test
  fun `縦方向の移動はキャンセルされ何も発火しない`() {
    val detector = newDetector()

    detector.onTouchEvent(down(500f, 500f))
    detector.onTouchEvent(move(500f, 600f)) // 縦へ100px → CANCELLED
    detector.onTouchEvent(move(400f, 600f)) // 以降の横移動は無視される
    detector.onTouchEvent(up(400f, 600f))

    verify(callbacks, never()).onSwipeProgress("left")
    verify(callbacks, never()).onSwipeProgress("right")
    verify(callbacks, never()).onSwipeNavigate("left")
    verify(callbacks, never()).onSwipeNavigate("right")
    verify(callbacks, never()).onSwipeCancel()
  }

  @Test
  fun `REVERSEフェーズで離した場合は progress 未発行のため onSwipeCancel を呼ばない`() {
    val detector = newDetector()

    detector.onTouchEvent(down(500f, 500f))
    detector.onTouchEvent(move(400f, 500f)) // REVERSE のまま
    detector.onTouchEvent(up(400f, 500f))

    verify(callbacks, never()).onSwipeCancel()
    verify(callbacks, never()).onSwipeNavigate("right")
  }

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
  fun `isGestureBlocked が true の間はスワイプもダブルタップも発火しない`() {
    whenever(callbacks.isGestureBlocked()).thenReturn(true)
    whenever(velocityTracker.xVelocity).thenReturn(500f)
    val detector = newDetector()

    // スワイプ操作 → MOVE で CANCELLED になる
    detector.onTouchEvent(down(500f, 500f))
    detector.onTouchEvent(move(400f, 500f))
    detector.onTouchEvent(move(450f, 500f))
    detector.onTouchEvent(up(450f, 500f))

    // ダブルタップ操作
    currentTime = 1000L
    detector.onTouchEvent(down(500f, 500f))
    detector.onTouchEvent(up(500f, 500f))
    currentTime = 1200L
    detector.onTouchEvent(down(500f, 500f))
    detector.onTouchEvent(up(500f, 500f))

    verify(callbacks, never()).onSwipeProgress("right")
    verify(callbacks, never()).onSwipeNavigate("right")
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