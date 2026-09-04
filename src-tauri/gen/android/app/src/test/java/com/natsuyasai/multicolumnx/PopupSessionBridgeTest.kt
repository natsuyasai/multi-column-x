package com.natsuyasai.multicolumnx

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** PopupSessionBridge（ポップアップ JS → ネイティブのアカウント切替ブリッジ）のテスト。 */
class PopupSessionBridgeTest {
  private val switchSessionCalls = mutableListOf<Triple<String, String, String>>()
  private val reportOfficialSettingsCalls = mutableListOf<Pair<String, String>>()

  private val bridge =
    PopupSessionBridge(
      "popup-1",
      { popupId, accountId, url -> switchSessionCalls.add(Triple(popupId, accountId, url)) },
      { accountId, snapshot -> reportOfficialSettingsCalls.add(Pair(accountId, snapshot)) },
    )

  @Test
  fun `切替要求はポップアップIDを付けてコールバックへ転送される`() {
    bridge.switchPopupSession("acc2", "https://x.com/foo")

    assertEquals(listOf(Triple("popup-1", "acc2", "https://x.com/foo")), switchSessionCalls)
  }

  @Test
  fun `accountIdが空の場合は転送しない`() {
    bridge.switchPopupSession("", "https://x.com/foo")

    assertTrue(switchSessionCalls.isEmpty())
  }

  @Test
  fun `urlが空の場合は転送しない`() {
    bridge.switchPopupSession("acc2", "")

    assertTrue(switchSessionCalls.isEmpty())
  }

  @Test
  fun `公式設定スナップショット報告は accountId と snapshot をコールバックへ転送される`() {
    bridge.reportOfficialSettings("acc2", """{"theme":"dark"}""")

    assertEquals(listOf(Pair("acc2", """{"theme":"dark"}""")), reportOfficialSettingsCalls)
  }

  @Test
  fun `accountIdが空の場合は公式設定スナップショット報告を転送しない`() {
    bridge.reportOfficialSettings("", """{"theme":"dark"}""")

    assertTrue(reportOfficialSettingsCalls.isEmpty())
  }

  @Test
  fun `snapshotが空の場合は公式設定スナップショット報告を転送しない`() {
    bridge.reportOfficialSettings("acc2", "")

    assertTrue(reportOfficialSettingsCalls.isEmpty())
  }
}