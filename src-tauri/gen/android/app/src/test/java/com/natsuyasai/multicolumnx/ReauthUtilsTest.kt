package com.natsuyasai.multicolumnx

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** reauthTempProfileId（再認証用一時プロファイルID生成）の純粋ロジックテスト。 */
class ReauthTempProfileIdTest {
  @Test
  fun `reauth-tmp-プレフィックス付きのプロファイル名が生成される`() {
    assertEquals("reauth-tmp-abc", reauthTempProfileId("abc"))
  }

  @Test
  fun `戻り値はreauth-tmp-で始まる`() {
    assertTrue(reauthTempProfileId("some-uuid-value").startsWith("reauth-tmp-"))
  }
}

/** reauthSentinelName（再認証のcommit/mismatch判定）の純粋ロジックテスト。 */
class ReauthSentinelNameTest {
  @Test
  fun `xUserIdがnullならexpectedが何であってもmismatch`() {
    assertEquals("reauth_mismatch", reauthSentinelName(xUserId = null, expectedUserId = "123"))
  }

  @Test
  fun `xUserIdがnullでexpectedもnullならmismatch`() {
    assertEquals("reauth_mismatch", reauthSentinelName(xUserId = null, expectedUserId = null))
  }

  @Test
  fun `expectedがnullなら初回として扱いcomplete`() {
    assertEquals("reauth_complete", reauthSentinelName(xUserId = "123", expectedUserId = null))
  }

  @Test
  fun `expectedが空文字なら初回として扱いcomplete`() {
    assertEquals("reauth_complete", reauthSentinelName(xUserId = "123", expectedUserId = ""))
  }

  @Test
  fun `xUserIdとexpectedが一致すればcomplete`() {
    assertEquals("reauth_complete", reauthSentinelName(xUserId = "123", expectedUserId = "123"))
  }

  @Test
  fun `xUserIdとexpectedが不一致ならmismatch`() {
    assertEquals("reauth_mismatch", reauthSentinelName(xUserId = "999", expectedUserId = "123"))
  }
}