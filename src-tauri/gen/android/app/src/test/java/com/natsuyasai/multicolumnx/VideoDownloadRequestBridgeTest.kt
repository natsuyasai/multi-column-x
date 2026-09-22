package com.natsuyasai.multicolumnx

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** VideoDownloadRequestBridge（動画ダウンロード連携メッセージ → コールバック振り分け）のテスト。 */
class VideoDownloadRequestBridgeTest {
  private val calls = mutableListOf<String>()
  private val bridge = VideoDownloadRequestBridge { payloadJson -> calls.add(payloadJson) }

  @Test
  fun `downloadvideoメッセージはpayloadをコールバックへ転送される`() {
    bridge.handle(BridgeMessage.DownloadVideo("""{"variants":[]}"""))

    assertEquals(listOf("""{"variants":[]}"""), calls)
  }

  @Test
  fun `対象外のメッセージは無視される`() {
    bridge.handle(BridgeMessage.ClosePopup)

    assertTrue(calls.isEmpty())
  }
}