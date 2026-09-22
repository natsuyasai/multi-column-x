package com.natsuyasai.multicolumnx

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** ApiRateLimitBridge（APIレート制限連携メッセージ → コールバック振り分け）のテスト。 */
class ApiRateLimitBridgeTest {
  private val calls = mutableListOf<Pair<String, String>>()
  private val bridge =
    ApiRateLimitBridge("col-1") { label, payloadJson -> calls.add(Pair(label, payloadJson)) }

  @Test
  fun `reportapiratelimitメッセージはlabelとpayloadをコールバックへ転送される`() {
    bridge.handle(BridgeMessage.ReportApiRateLimit("""{"limit":500}"""))

    assertEquals(listOf(Pair("col-1", """{"limit":500}""")), calls)
  }

  @Test
  fun `対象外のメッセージは無視される`() {
    bridge.handle(BridgeMessage.ClosePopup)

    assertTrue(calls.isEmpty())
  }
}