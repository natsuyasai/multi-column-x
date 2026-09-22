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