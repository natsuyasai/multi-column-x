package com.natsuyasai.multicolumnx

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ArgbEvaluator
import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView

/**
 * モバイル(Android)のスワイプバーをネイティブ View として描画するオーバーレイ。
 *
 * カラム WebView の CSS z-index は Android では効かないため、[MainActivity] が
 * カラム WebView の `addView` 後（＝最前面）にこの View を重ねることで
 * 「スワイプ領域をカラムより手前に表示」「View.alpha でカラムを透過」を実現する
 * （詳細は tmp/plans/2026-08-11-mobile-swipe-bar-native-overlay/plan.md 参照）。
 *
 * タッチ判定の dx/dy 計算は [SwipeGestureResolver]（純粋関数、Android 非依存）に切り出している。
 *
 * - `progress`（指の移動方向の強調表示）はこの View がローカルで即座に描画する
 *   （往復レイテンシを避けるため。React 側の swipeState 更新とは独立して先に描画してよい）。
 * - `switching`（遷移確定フラッシュ）はここでは自前判定せず、[flashSwitching] を外部
 *   （[MainActivity.setSwipeBarFlash]）から呼ばれたときのみ再生する。React 側の
 *   `navigateColumn` には早期return（ダイアログ表示中、先頭/末尾カラムでこれ以上進めない場合）
 *   があり、その場合は遷移していないので光ってはいけない。そのため ACTION_UP で
 *   [onNavigate] を呼ぶ時点でこの View 自身が無条件にフラッシュしてはいけない。
 */
class SwipeBarOverlayView(
  context: Context,
  private val onNavigate: (String) -> Unit,
  private val onDoubleTap: () -> Unit,
) : FrameLayout(context) {
  /** progress方向の変化を外部（AppBridge.onSwipeProgress 経由で Rust/React）へ通知するコールバック。 */
  var onProgress: ((String?) -> Unit)? = null

  private val density = resources.displayMetrics.density
  private val minSwipePx = SwipeGestureResolver.MIN_SWIPE_DP * density
  private val progressMinPx = SwipeGestureResolver.PROGRESS_MIN_DP * density

  private var touchActive = false
  private var touchStartX = 0f
  private var touchStartY = 0f
  private var currentProgressDirection: String? = null
  private var lastTapUpTimeMs = 0L

  private var surfaceHoverColor = DARK_SURFACE_HOVER
  private var textTertiaryColor = DARK_TEXT_TERTIARY
  private val accentColor = ACCENT

  private val argbEvaluator = ArgbEvaluator()
  private var flashAnimator: ValueAnimator? = null

  private val leftHint =
    TextView(context).apply {
      text = "‹"
      textSize = HINT_TEXT_SIZE_SP
      setTypeface(typeface, Typeface.BOLD)
    }

  private val rightHint =
    TextView(context).apply {
      text = "›"
      textSize = HINT_TEXT_SIZE_SP
      setTypeface(typeface, Typeface.BOLD)
    }

  private val topBorder =
    View(context).apply {
      layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, (1 * density).toInt(), Gravity.TOP)
    }

  init {
    val gapPx = (GRIP_GAP_DP * density).toInt()
    val content =
      LinearLayout(context).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER
      }
    content.addView(leftHint)
    (leftHint.layoutParams as LinearLayout.LayoutParams).marginEnd = gapPx
    content.addView(rightHint)

    addView(content, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT, Gravity.CENTER))
    addView(topBorder)

    setDarkTheme(true)
  }

  override fun onInterceptTouchEvent(ev: MotionEvent): Boolean = true

  override fun onTouchEvent(event: MotionEvent): Boolean {
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        touchActive = true
        touchStartX = event.x
        touchStartY = event.y
      }
      MotionEvent.ACTION_MOVE -> {
        if (!touchActive) return true
        val dx = event.x - touchStartX
        val dy = event.y - touchStartY
        updateProgress(SwipeGestureResolver.resolveDirection(dx, dy, progressMinPx))
      }
      MotionEvent.ACTION_UP -> {
        if (touchActive) {
          val dx = event.x - touchStartX
          val dy = event.y - touchStartY
          resetTouchState()
          if (SwipeGestureResolver.isTap(dx, dy, progressMinPx)) {
            val now = System.currentTimeMillis()
            if (SwipeGestureResolver.isDoubleTap(now, lastTapUpTimeMs, SwipeGestureResolver.DOUBLE_TAP_MAX_MS)) {
              // 3回目の素早いタップが誤ってダブルタップ扱いにならないようリセットする
              // （TabItem.tsx の DOUBLE_TAP_MAX_MS 判定と同じ対策）
              lastTapUpTimeMs = 0L
              onDoubleTap()
            } else {
              lastTapUpTimeMs = now
            }
          } else {
            val direction = SwipeGestureResolver.resolveDirection(dx, dy, minSwipePx)
            if (direction != null) onNavigate(direction)
          }
        }
      }
      MotionEvent.ACTION_CANCEL -> resetTouchState()
    }
    return true
  }

  /** 背景色・文字色・進捗強調色をテーマに合わせて切り替える。 */
  fun setDarkTheme(dark: Boolean) {
    surfaceHoverColor = if (dark) DARK_SURFACE_HOVER else LIGHT_SURFACE_HOVER
    textTertiaryColor = if (dark) DARK_TEXT_TERTIARY else LIGHT_TEXT_TERTIARY
    val borderColor = if (dark) DARK_BORDER_SUBTLE else LIGHT_BORDER_SUBTLE

    setBackgroundColor(surfaceHoverColor)
    topBorder.setBackgroundColor(borderColor)
    applyProgressVisual(currentProgressDirection)
  }

  /**
   * スワイプによるカラム遷移が実際に確定したときの視覚フラッシュ演出を再生する。
   * 外部（[MainActivity.setSwipeBarFlash]）から呼ばれたときのみ実行し、この View 自身の
   * ジェスチャー完了処理（[onTouchEvent] の ACTION_UP）からは呼ばない。
   * MobileSwipeBar.module.scss の `swipeBarFlash` keyframes（0.4秒で背景色→透明）と同等。
   */
  fun flashSwitching(direction: String) {
    flashAnimator?.cancel()
    applyProgressVisual(direction)

    val animator =
      ValueAnimator.ofFloat(0f, 1f).apply {
        duration = FLASH_DURATION_MS
        addUpdateListener { anim ->
          val fraction = anim.animatedValue as Float
          val color = argbEvaluator.evaluate(fraction, surfaceHoverColor, Color.TRANSPARENT) as Int
          setBackgroundColor(color)
        }
        addListener(
          object : AnimatorListenerAdapter() {
            override fun onAnimationEnd(animation: Animator) {
              setBackgroundColor(surfaceHoverColor)
              applyProgressVisual(currentProgressDirection)
            }
          },
        )
      }
    flashAnimator = animator
    animator.start()
  }

  private fun updateProgress(direction: String?) {
    if (direction == currentProgressDirection) return
    currentProgressDirection = direction
    applyProgressVisual(direction)
    onProgress?.invoke(direction)
  }

  private fun resetTouchState() {
    touchActive = false
    updateProgress(null)
  }

  // progressLeft(direction="left") は右側の矢印(›)を、progressRight(direction="right") は
  // 左側の矢印(‹)を強調する（MobileSwipeBar.module.scss の .progressLeft/.progressRight と同じ対応）。
  private fun applyProgressVisual(direction: String?) {
    val highlightRight = direction == "left"
    val highlightLeft = direction == "right"
    rightHint.setTextColor(if (highlightRight) accentColor else textTertiaryColor)
    rightHint.alpha = if (highlightRight) 1f else HINT_DEFAULT_ALPHA
    leftHint.setTextColor(if (highlightLeft) accentColor else textTertiaryColor)
    leftHint.alpha = if (highlightLeft) 1f else HINT_DEFAULT_ALPHA
  }

  companion object {
    private const val FLASH_DURATION_MS = 400L
    private const val HINT_DEFAULT_ALPHA = 0.7f
    private const val HINT_TEXT_SIZE_SP = 13f
    private const val GRIP_GAP_DP = 10f

    // src/index.css の :root[data-theme="dark"] から採取。
    private val DARK_SURFACE_HOVER = Color.parseColor("#333333")
    private val DARK_BORDER_SUBTLE = Color.parseColor("#222222")
    private val DARK_TEXT_TERTIARY = Color.parseColor("#999999")

    // src/index.css の :root[data-theme="light"] から採取。
    private val LIGHT_SURFACE_HOVER = Color.parseColor("#E1E8ED")
    private val LIGHT_BORDER_SUBTLE = Color.parseColor("#EFF3F4")
    private val LIGHT_TEXT_TERTIARY = Color.parseColor("#8899A6")

    // --mcx-accent はライト/ダーク共通。
    private val ACCENT = Color.parseColor("#1D9BF0")
  }
}