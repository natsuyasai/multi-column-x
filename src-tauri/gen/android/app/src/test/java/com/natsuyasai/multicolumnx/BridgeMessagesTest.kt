package com.natsuyasai.multicolumnx

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** BridgeMessages（parseBridgeMessage）の単体テスト。 */
class BridgeMessagesTest {
  @Test
  fun `switchpopupsessionを正しく解釈する`() {
    val message =
      parseBridgeMessage(
        """{"type":"switchPopupSession","accountId":"acc2","url":"https://x.com/foo"}""",
      )

    assertEquals(BridgeMessage.SwitchPopupSession("acc2", "https://x.com/foo"), message)
  }

  @Test
  fun `reportofficialsettingsを正しく解釈する`() {
    val message =
      parseBridgeMessage(
        """{"type":"reportOfficialSettings","accountId":"acc2","snapshot":"{\"theme\":\"dark\"}"}""",
      )

    assertEquals(
      BridgeMessage.ReportOfficialSettings("acc2", """{"theme":"dark"}"""),
      message,
    )
  }

  @Test
  fun `closepopupを正しく解釈する`() {
    val message = parseBridgeMessage("""{"type":"closePopup"}""")

    assertEquals(BridgeMessage.ClosePopup, message)
  }

  @Test
  fun `downloadvideoを正しく解釈する`() {
    val message =
      parseBridgeMessage("""{"type":"downloadVideo","payload":"{\"variants\":[]}"}""")

    assertEquals(BridgeMessage.DownloadVideo("""{"variants":[]}"""), message)
  }

  @Test
  fun `reportapiratelimitを正しく解釈する`() {
    val message =
      parseBridgeMessage("""{"type":"reportApiRateLimit","payload":"{\"limit\":500}"}""")

    assertEquals(BridgeMessage.ReportApiRateLimit("""{"limit":500}"""), message)
  }

  @Test
  fun `jsonとして解釈できない文字列はnullを返す`() {
    assertNull(parseBridgeMessage("not json"))
  }

  @Test
  fun `typeが欠落している場合はnullを返す`() {
    assertNull(parseBridgeMessage("""{"accountId":"acc2","url":"https://x.com"}"""))
  }

  @Test
  fun `typeが未知の値の場合はnullを返す`() {
    assertNull(parseBridgeMessage("""{"type":"unknown"}"""))
  }

  @Test
  fun `switchpopupsessionでaccountidが欠落している場合はnullを返す`() {
    assertNull(parseBridgeMessage("""{"type":"switchPopupSession","url":"https://x.com"}"""))
  }

  @Test
  fun `switchpopupsessionでurlが空文字の場合はnullを返す`() {
    assertNull(
      parseBridgeMessage("""{"type":"switchPopupSession","accountId":"acc2","url":""}"""),
    )
  }

  @Test
  fun `reportofficialsettingsでsnapshotが欠落している場合はnullを返す`() {
    assertNull(parseBridgeMessage("""{"type":"reportOfficialSettings","accountId":"acc2"}"""))
  }

  @Test
  fun `downloadvideoでpayloadが空文字の場合はnullを返す`() {
    assertNull(parseBridgeMessage("""{"type":"downloadVideo","payload":""}"""))
  }

  @Test
  fun `reportapiratelimitでpayloadが欠落している場合はnullを返す`() {
    assertNull(parseBridgeMessage("""{"type":"reportApiRateLimit"}"""))
  }
}