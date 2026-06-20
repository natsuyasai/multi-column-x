package com.natsuyasai.multicolumnx

/**
 * ポップアップ表示中のネイティブジェスチャー無効化（ブロック）を管理する。
 *
 * ポップアップが開くとブロックを開始し、全て閉じると解除する。
 * ただし何らかの理由でポップアップが閉じられず判定待ちが完了しない場合、
 * ブロック開始から timeoutMs を超えるとジェスチャー判定をリセット（ブロック解除扱い）し、
 * 全ジェスチャーが永久に受け付けられなくなる状態を防ぐ。
 *
 * now は単体テストで時間経過を差し替えるための注入点。
 */
class PopupGestureBlock(
  private val timeoutMs: Long = DEFAULT_TIMEOUT_MS,
  private val now: () -> Long = System::currentTimeMillis,
) {
  // ブロック開始時刻。ポップアップが無い間は null。
  private var blockedSince: Long? = null

  /**
   * ポップアップ数の変化を通知する。
   * 0 → 1以上 でブロックを開始し、0 でブロックを解除する。
   * 既にブロック中であれば開始時刻は最初の1つ目のまま維持する。
   */
  fun onPopupCountChanged(popupCount: Int) {
    blockedSince = if (popupCount > 0) blockedSince ?: now() else null
  }

  /**
   * ジェスチャーをブロックすべきか。
   * ブロック中でも開始から timeoutMs 以上経過していれば false を返す（判定リセット）。
   */
  fun isBlocked(): Boolean {
    val since = blockedSince ?: return false
    return now() - since < timeoutMs
  }

  companion object {
    private const val DEFAULT_TIMEOUT_MS = 3000L
  }
}