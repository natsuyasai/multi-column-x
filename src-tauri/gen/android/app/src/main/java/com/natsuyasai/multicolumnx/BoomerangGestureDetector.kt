package com.natsuyasai.multicolumnx

import android.util.Log
import android.view.MotionEvent
import android.view.VelocityTracker

/**
 * 「逆引き → 前進」ブーメランジェスチャーとダブルタップの検出器。
 *
 * 右カラムへ移動したい場合: 左に引いてから右へリリース（reverseDir="left" → navigate "right"）
 * 左カラムへ移動したい場合: 右に引いてから左へリリース（reverseDir="right" → navigate "left"）
 * 縦スクロールや単純な横スワイプとは区別される。
 *
 * MotionEvent を渡すと状態遷移し、確定時にコールバックを呼ぶ。
 * velocityTrackerProvider / now は単体テストで差し替えるための注入点。
 */
class BoomerangGestureDetector(
  private val density: Float,
  private val callbacks: Callbacks,
  private val velocityTrackerProvider: () -> VelocityTracker = { VelocityTracker.obtain() },
  private val now: () -> Long = System::currentTimeMillis,
) {
  interface Callbacks {
    /** ジェスチャーが progress 状態に入った（navDir: "left" | "right"） */
    fun onSwipeProgress(navDir: String)

    /** ジェスチャーが確定した */
    fun onSwipeNavigate(navDir: String)

    /** progress 後にキャンセルされた */
    fun onSwipeCancel()

    /** ダブルタップを検出した */
    fun onDoubleTap()

    /** ジェスチャーを無効化すべき状態か（ポップアップ表示中など） */
    fun isGestureBlocked(): Boolean
  }

  private enum class Phase { IDLE, REVERSE, FORWARD, CANCELLED }

  private var phase = Phase.IDLE
  private var startX = 0f
  private var startY = 0f
  private var extremeX = 0f // 逆方向移動の最端点X
  private var reverseDir: String? = null // 最初の引き方向: "left" or "right"
  private var velocityTracker: VelocityTracker? = null

  // ダブルタップ検出用
  private var lastTapTime = 0L
  private var lastTapX = 0f
  private var lastTapY = 0f

  fun onTouchEvent(ev: MotionEvent) {
    val minReversePx = 30f * density // 逆引きの最小距離
    val minForwardPx = 30f * density // 最端点からの最小前進距離
    val minVelocityPx = 300f

    velocityTracker?.addMovement(ev)

    when (ev.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        velocityTracker?.recycle()
        velocityTracker = velocityTrackerProvider()
        velocityTracker?.addMovement(ev)
        phase = Phase.IDLE
        startX = ev.x
        startY = ev.y
        extremeX = ev.x
        reverseDir = null
      }
      MotionEvent.ACTION_MOVE -> {
        if (callbacks.isGestureBlocked()) {
          phase = Phase.CANCELLED
        } else {
          when (phase) {
            Phase.IDLE -> {
              val dx = ev.x - startX
              val dy = ev.y - startY
              when {
                // 水平方向に十分移動したら REVERSE フェーズへ
                Math.abs(dx) > minReversePx && Math.abs(dx) > Math.abs(dy) * 1.5f -> {
                  phase = Phase.REVERSE
                  reverseDir = if (dx < 0) "left" else "right"
                  extremeX = ev.x
                }
                // 最初から縦方向に動いたらキャンセル（スクロール）
                Math.abs(dy) > minReversePx && Math.abs(dy) > Math.abs(dx) * 1.5f -> {
                  phase = Phase.CANCELLED
                }
              }
            }
            Phase.REVERSE -> {
              // 逆引き方向の最端点を更新
              when (reverseDir) {
                "left" -> if (ev.x < extremeX) extremeX = ev.x
                "right" -> if (ev.x > extremeX) extremeX = ev.x
              }
              // 最端点から逆方向（前進方向）へ minForwardPx 以上戻ったら FORWARD フェーズへ
              val dxFromExtreme = ev.x - extremeX
              val enteredForward =
                when (reverseDir) {
                  "left" -> dxFromExtreme > minForwardPx // 左引き後、右へ折り返した
                  "right" -> dxFromExtreme < -minForwardPx // 右引き後、左へ折り返した
                  else -> false
                }
              if (enteredForward) {
                phase = Phase.FORWARD
                val dir = reverseDir ?: return
                val navDir = if (dir == "left") "right" else "left"
                Log.d(TAG, "boomerang-gesture: progress navDir=$navDir")
                callbacks.onSwipeProgress(navDir)
              }
            }
            Phase.FORWARD -> { /* 速度は ACTION_UP で判定 */ }
            Phase.CANCELLED -> {}
          }
        }
      }
      MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
        if (phase == Phase.FORWARD) {
          velocityTracker?.computeCurrentVelocity(1000)
          val vx = velocityTracker?.xVelocity ?: 0f
          val dir = reverseDir
          // 前進方向（逆引きの逆）への速度が十分あれば切り替え
          val hasForwardVelocity =
            when (dir) {
              "left" -> vx > minVelocityPx // 左引き → 右への速度
              "right" -> vx < -minVelocityPx // 右引き → 左への速度
              else -> false
            }
          if (hasForwardVelocity && dir != null) {
            val navDir = if (dir == "left") "right" else "left"
            Log.d(TAG, "boomerang-gesture: navigate navDir=$navDir vx=$vx")
            callbacks.onSwipeNavigate(navDir)
          } else {
            callbacks.onSwipeCancel()
          }
        } else if (ev.actionMasked == MotionEvent.ACTION_UP && phase == Phase.IDLE &&
          !callbacks.isGestureBlocked()
        ) {
          // タップ（指がほとんど動かなかった）の場合にダブルタップを検出する
          val doubleTapMaxMs = 300L
          val doubleTapMaxPx = 50f * density
          val currentTime = now()
          val dx = ev.x - lastTapX
          val dy = ev.y - lastTapY
          val distSq = dx * dx + dy * dy
          if (currentTime - lastTapTime < doubleTapMaxMs && distSq < doubleTapMaxPx * doubleTapMaxPx) {
            Log.d(TAG, "double-tap detected")
            callbacks.onDoubleTap()
            lastTapTime = 0L
          } else {
            lastTapTime = currentTime
            lastTapX = ev.x
            lastTapY = ev.y
          }
        }
        // REVERSE フェーズで離した場合は progress 未発行のためキャンセル不要
        velocityTracker?.recycle()
        velocityTracker = null
        phase = Phase.IDLE
        reverseDir = null
      }
    }
  }

  companion object {
    private const val TAG = "BoomerangGestureDetector"
  }
}