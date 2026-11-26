package com.natsuyasai.multicolumnx

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** MediaPopupBridge（メディアのポップアップ要求 → コールバック振り分け）のテスト。 */
class MediaPopupBridgeTest {
  private val calls = mutableListOf<Pair<String, String>>()
  private var now = 10_000L
  private val bridge =
    MediaPopupBridge("column-a", { id, url -> calls.add(Pair(id, url)) }, { now })

  private val url = "https://x.com/u/status/1/photo/1"

  @Test
  fun `ポップアップ要求は送信元カラムのidとurlがコールバックへ転送される`() {
    bridge.handle(BridgeMessage.OpenMediaPopup(url))

    assertEquals(listOf(Pair("column-a", url)), calls)
  }

  @Test
  fun `対象外のメッセージは無視される`() {
    bridge.handle(BridgeMessage.ClosePopup)

    assertTrue(calls.isEmpty())
  }

  @Test
  fun `同じカラムから同じ画像や動画の要求が1秒以内に続いたときはポップアップを1つだけ開く`() {
    bridge.handle(BridgeMessage.OpenMediaPopup(url))
    now += 500
    bridge.handle(BridgeMessage.OpenMediaPopup(url))

    assertEquals(1, calls.size)
  }

  @Test
  fun `同じurlでも1秒経過後の要求は改めて開く`() {
    bridge.handle(BridgeMessage.OpenMediaPopup(url))
    now += 1000
    bridge.handle(BridgeMessage.OpenMediaPopup(url))

    assertEquals(2, calls.size)
  }

  @Test
  fun `1秒未満の999ミリ秒後の要求はまだ無視される`() {
    bridge.handle(BridgeMessage.OpenMediaPopup(url))
    now += 999
    bridge.handle(BridgeMessage.OpenMediaPopup(url))

    assertEquals(1, calls.size)
  }

  @Test
  fun `1秒以内でもurlが異なる要求は開く`() {
    bridge.handle(BridgeMessage.OpenMediaPopup(url))
    now += 100
    bridge.handle(BridgeMessage.OpenMediaPopup("https://x.com/u/status/1/photo/2"))

    assertEquals(2, calls.size)
  }

  @Test
  fun `無視された要求は抑止期間を延長しない`() {
    bridge.handle(BridgeMessage.OpenMediaPopup(url))
    now += 600
    bridge.handle(BridgeMessage.OpenMediaPopup(url))
    now += 600
    bridge.handle(BridgeMessage.OpenMediaPopup(url))

    assertEquals(2, calls.size)
  }
}