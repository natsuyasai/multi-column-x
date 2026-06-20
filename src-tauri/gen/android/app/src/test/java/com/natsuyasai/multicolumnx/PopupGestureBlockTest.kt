package com.natsuyasai.multicolumnx

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * PopupGestureBlock（ポップアップ表示中のジェスチャーブロック + 3秒タイムアウトリセット）の
 * 純粋ロジックテスト。now を差し替えて時間経過を再現する。
 */
class PopupGestureBlockTest {
  private var currentTime = 0L

  private fun newBlock(): PopupGestureBlock = PopupGestureBlock(timeoutMs = 3000L, now = { currentTime })

  @Test
  fun `ポップアップが無いときはブロックしない`() {
    val block = newBlock()

    assertFalse(block.isBlocked())
  }

  @Test
  fun `ポップアップが開くとブロックする`() {
    val block = newBlock()

    currentTime = 1000L
    block.onPopupCountChanged(1)

    assertTrue(block.isBlocked())
  }

  @Test
  fun `ブロック開始から3秒未満はブロックを継続する`() {
    val block = newBlock()

    currentTime = 1000L
    block.onPopupCountChanged(1)
    currentTime = 1000L + 2999L

    assertTrue(block.isBlocked())
  }

  @Test
  fun `ブロック開始から3秒経過するとジェスチャー判定をリセットしブロックを解除する`() {
    val block = newBlock()

    currentTime = 1000L
    block.onPopupCountChanged(1)
    currentTime = 1000L + 3000L

    assertFalse(block.isBlocked())
  }

  @Test
  fun `ポップアップが全て閉じるとブロックを解除する`() {
    val block = newBlock()

    currentTime = 1000L
    block.onPopupCountChanged(1)
    block.onPopupCountChanged(0)

    assertFalse(block.isBlocked())
  }

  @Test
  fun `ポップアップが複数開いてもブロック開始時刻は最初の1つ目から数える`() {
    val block = newBlock()

    currentTime = 1000L
    block.onPopupCountChanged(1)
    currentTime = 2000L
    block.onPopupCountChanged(2) // 2つ目が開いてもタイマーは1つ目開始時刻のまま
    currentTime = 1000L + 3000L

    assertFalse(block.isBlocked())
  }

  @Test
  fun `タイムアウトでリセット後にポップアップを閉じて再度開くとブロックが再開する`() {
    val block = newBlock()

    currentTime = 1000L
    block.onPopupCountChanged(1)
    currentTime = 1000L + 3000L
    assertFalse(block.isBlocked()) // タイムアウトでリセット済み

    block.onPopupCountChanged(0) // ポップアップを閉じる
    currentTime = 10000L
    block.onPopupCountChanged(1) // 再度開く

    assertTrue(block.isBlocked())
  }
}