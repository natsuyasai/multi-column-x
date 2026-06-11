package com.natsuyasai.multicolumnx

import androidx.webkit.WebViewFeature
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
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

/** needsCookieFallback（ロード前の Cookie フォールバック要否判定）の純粋ロジックテスト。 */
class CookieFallbackDecisionTest {
  @Test
  fun `プロファイル適用済みならフォールバック不要`() {
    assertFalse(needsCookieFallback(profileApplied = true, accountId = "123"))
  }

  @Test
  fun `プロファイル未適用でaccountIdがあればフォールバックが必要`() {
    assertTrue(needsCookieFallback(profileApplied = false, accountId = "123"))
  }

  @Test
  fun `accountIdが空ならプロファイル未適用でもフォールバック不要`() {
    assertFalse(needsCookieFallback(profileApplied = false, accountId = ""))
  }
}

/** parseCookieString（"k=v; k2=v2" 形式の Cookie 文字列分解）の純粋ロジックテスト。 */
class CookieStringParseTest {
  @Test
  fun `セミコロン区切りのCookie文字列を個別のCookieに分解する`() {
    assertEquals(
      listOf("auth_token=abc", "ct0=def"),
      parseCookieString("auth_token=abc; ct0=def"),
    )
  }

  @Test
  fun `空文字列は空リストを返す`() {
    assertEquals(emptyList<String>(), parseCookieString(""))
  }

  @Test
  fun `空要素と前後の空白は除去される`() {
    assertEquals(
      listOf("a=1", "b=2"),
      parseCookieString(" a=1 ;; b=2 ; "),
    )
  }

  @Test
  fun `単一Cookieも分解できる`() {
    assertEquals(listOf("auth_token=abc"), parseCookieString("auth_token=abc"))
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