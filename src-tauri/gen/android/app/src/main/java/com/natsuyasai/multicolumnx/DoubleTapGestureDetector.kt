package com.natsuyasai.multicolumnx

import android.util.Log
import android.view.MotionEvent

/**
 * アクティブカラム領域のダブルタップ検出器（先頭スクロール＋リロード用）。
 *
 * 指がほとんど動かないタップが規定時間・距離内に2回行われたら onDoubleTap を呼ぶ。
 * 横スワイプによるカラム切替は専用のフリック帯（React の MobileSwipeBar）が担うため、
 * ネイティブのジェスチャー検出はダブルタップのみを扱う。
 *
 * MotionEvent を渡すと状態遷移し、確定時にコールバックを呼ぶ。
 * now は単体テストで差し替えるための注入点。
 */
class DoubleTapGestureDetector(
  private val density: Float,
  private val callbacks: Callbacks,
  private val now: () -> Long = System::currentTimeMillis,
) {
  interface Callbacks {
    /** ダブルタップを検出した */
    fun onDoubleTap()

    /** ジェスチャーを無効化すべき状態か（ポップアップ表示中など） */
    fun isGestureBlocked(): Boolean
  }

  // 現在のタッチがタップか（指がほとんど動かなかったか）を判定するための状態
  private var startX = 0f
  private var startY = 0f
  private var moved = false

  // ダブルタップ検出用
  private var lastTapTime = 0L
  private var lastTapX = 0f
  private var lastTapY = 0f

  fun onTouchEvent(ev: MotionEvent) {
    val tapSlopPx = 30f * density // これを超えて動いたらタップではない

    when (ev.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        startX = ev.x
        startY = ev.y
        moved = false
      }
      MotionEvent.ACTION_MOVE -> {
        if (Math.abs(ev.x - startX) > tapSlopPx || Math.abs(ev.y - startY) > tapSlopPx) {
          moved = true
        }
      }
      MotionEvent.ACTION_UP -> {
        // タップ（指がほとんど動かなかった）かつ無効化中でない場合にダブルタップを検出する
        if (!moved && !callbacks.isGestureBlocked()) {
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
      }
      MotionEvent.ACTION_CANCEL -> {
        // キャンセルはタップとして扱わない
        moved = true
      }
    }
  }

  companion object {
    private const val TAG = "DoubleTapGestureDetector"
  }
}