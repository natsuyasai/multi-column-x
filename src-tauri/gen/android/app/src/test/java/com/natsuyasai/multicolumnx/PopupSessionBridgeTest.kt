package com.natsuyasai.multicolumnx

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** PopupSessionBridge（ポップアップ JS → ネイティブのアカウント切替ブリッジ）のテスト。 */
class PopupSessionBridgeTest {
  private val calls = mutableListOf<Triple<String, String, String>>()

  private val bridge =
    PopupSessionBridge("popup-1") { popupId, accountId, url ->
      calls.add(Triple(popupId, accountId, url))
    }

  @Test
  fun `切替要求はポップアップIDを付けてコールバックへ転送される`() {
    bridge.switchPopupSession("acc2", "https://x.com/foo")

    assertEquals(listOf(Triple("popup-1", "acc2", "https://x.com/foo")), calls)
  }

  @Test
  fun `accountIdが空の場合は転送しない`() {
    bridge.switchPopupSession("", "https://x.com/foo")

    assertTrue(calls.isEmpty())
  }

  @Test
  fun `urlが空の場合は転送しない`() {
    bridge.switchPopupSession("acc2", "")

    assertTrue(calls.isEmpty())
  }
}