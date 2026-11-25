package com.natsuyasai.multicolumnx

import io.kotest.property.Arb
import io.kotest.property.arbitrary.filter
import io.kotest.property.arbitrary.string
import io.kotest.property.forAll
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** BridgeOrigins（isAllowedBridgeOrigin / shouldExposeBridge）の単体テスト。 */
class BridgeOriginsTest {
  @Test
  fun `xドットcomは許可される`() {
    assertTrue(isAllowedBridgeOrigin("https://x.com"))
  }

  @Test
  fun `mobileドットxドットcomは許可される`() {
    assertTrue(isAllowedBridgeOrigin("https://mobile.x.com"))
  }

  @Test
  fun `twitterドットcomは許可される`() {
    assertTrue(isAllowedBridgeOrigin("https://twitter.com"))
  }

  @Test
  fun `twitterドットcomのサブドメインは許可される`() {
    assertTrue(isAllowedBridgeOrigin("https://mobile.twitter.com"))
  }

  @Test
  fun `無関係なオリジンは拒否される`() {
    assertFalse(isAllowedBridgeOrigin("https://example.com"))
  }

  @Test
  fun `httpスキームは拒否される`() {
    assertFalse(isAllowedBridgeOrigin("http://x.com"))
  }

  @Test
  fun `xドットcomをサフィックスに含む偽装ホストは拒否される`() {
    assertFalse(isAllowedBridgeOrigin("https://x.com.example.com"))
  }

  @Test
  fun `パースできない文字列は拒否される`() {
    assertFalse(isAllowedBridgeOrigin("not a uri"))
  }

  @Test
  fun `webmessagelistener対応端末では連携を公開する`() {
    assertTrue(shouldExposeBridge(true))
  }

  @Test
  fun `webmessagelistener非対応端末では連携を公開しない`() {
    assertFalse(shouldExposeBridge(false))
  }

  @Test
  fun `xドットcomの後に任意の文字列を連結した偽装ホストは常に拒否される`() {
    runBlocking {
      forAll(
        Arb.string(1, 12).filter { !it.contains("x.com") && !it.contains("twitter.com") },
      ) { suffix ->
        !isAllowedBridgeOrigin("https://x.com.$suffix")
      }
    }
  }
}

/** acceptBridgeMessage（メインフレームかつ X 系オリジンのみ受け入れる入口ゲート）のテスト。 */
class AcceptBridgeMessageTest {
  @Test
  fun `メインフレームかつxオリジンの要求は受け付ける`() {
    assertTrue(acceptBridgeMessage(true, "https://x.com"))
    assertTrue(acceptBridgeMessage(true, "https://mobile.x.com"))
  }

  @Test
  fun `メインフレーム以外からの要求は受け付けない`() {
    assertFalse(acceptBridgeMessage(false, "https://x.com"))
  }

  @Test
  fun `x以外のオリジンからの要求は受け付けない`() {
    assertFalse(acceptBridgeMessage(true, "https://x.com.evil.example"))
    assertFalse(acceptBridgeMessage(true, "http://x.com"))
    assertFalse(acceptBridgeMessage(true, "https://evil.example"))
  }
}