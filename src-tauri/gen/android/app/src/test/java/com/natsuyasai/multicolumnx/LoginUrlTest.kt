package com.natsuyasai.multicolumnx

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** isLoginUrl（ログイン画面 URL 判定）の純粋ロジックテスト。 */
class LoginUrlTest {
  @Test
  fun `x_com_login_パスはログインURL判定でtrueを返す`() {
    assertTrue(isLoginUrl("https://x.com/login"))
  }

  @Test
  fun `x_com_i_flow_login_パスはログインURL判定でtrueを返す`() {
    assertTrue(isLoginUrl("https://x.com/i/flow/login"))
  }

  @Test
  fun `twitter_com_login_パスはログインURL判定でtrueを返す`() {
    assertTrue(isLoginUrl("https://twitter.com/login"))
  }

  @Test
  fun `x_com_home_はログインURLではない`() {
    assertFalse(isLoginUrl("https://x.com/home"))
  }

  @Test
  fun `空文字列はログインURLではない`() {
    assertFalse(isLoginUrl(""))
  }

  @Test
  fun `x_com_loginを含まないURLはログインURLではない`() {
    assertFalse(isLoginUrl("https://x.com/i/lists/123"))
  }

  @Test
  fun `ログイン文字列を部分的に含む外部URLはログインURLではない`() {
    assertFalse(isLoginUrl("https://example.com/login"))
  }
}