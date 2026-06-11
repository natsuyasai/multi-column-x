package com.natsuyasai.multicolumnx

import androidx.webkit.WebViewFeature
import org.junit.Assert.assertEquals
import org.junit.Test

/** getCookieProfileName（アカウント ID → プロファイル名変換）の純粋ロジックテスト。 */
class CookieProfileNameTest {
  @Test
  fun `accountIdからaccount-プレフィックス付きのプロファイル名が生成される`() {
    assertEquals("account-12345", getCookieProfileName("12345"))
  }

  @Test
  fun `空のaccountIdはaccount-プレフィックスのみになる`() {
    assertEquals("account-", getCookieProfileName(""))
  }
}

/** WebViewProfiles の feature 判定に使う定数のテスト。 */
class WebViewProfilesFeatureTest {
  @Test
  fun `feature判定にはandroidx_webkitに実在するMULTI_PROFILE定数を使う`() {
    // "PROFILE_URLS_AND_COOKIE_MANAGER" のような androidx.webkit に存在しない
    // feature 文字列は isFeatureSupported が RuntimeException を投げて常に false 判定になる。
    assertEquals(WebViewFeature.MULTI_PROFILE, WebViewProfiles.FEATURE)
  }
}