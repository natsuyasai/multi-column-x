package com.natsuyasai.multicolumnx

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** TwidUtils（parseTwidUserId / twidUserIdFromCookieString）の純粋ロジックテスト。 */
class TwidUtilsTest {
  @Test
  fun `urlエンコード済みtwidから数値idを抽出する`() {
    assertEquals("118318317", parseTwidUserId("u%3D118318317"))
  }

  @Test
  fun `urlデコード済みtwidから数値idを抽出する`() {
    assertEquals("118318317", parseTwidUserId("u=118318317"))
  }

  @Test
  fun `小文字エンコードのtwidからも数値idを抽出する`() {
    assertEquals("118318317", parseTwidUserId("u%3d118318317"))
  }

  @Test
  fun `idが空のtwidはnullを返す`() {
    assertNull(parseTwidUserId("u="))
  }

  @Test
  fun `idが数字以外を含むtwidはnullを返す`() {
    assertNull(parseTwidUserId("u=abc"))
  }

  @Test
  fun `uプレフィックスが無いtwidはnullを返す`() {
    assertNull(parseTwidUserId("118318317"))
  }

  @Test
  fun `空文字のtwidはnullを返す`() {
    assertNull(parseTwidUserId(""))
  }

  @Test
  fun `twidを含むcookie文字列から数値idを抽出する`() {
    assertEquals(
      "118318317",
      twidUserIdFromCookieString("ct0=abc; twid=u%3D118318317; lang=en"),
    )
  }

  @Test
  fun `twidが無いcookie文字列はnullを返す`() {
    assertNull(twidUserIdFromCookieString("ct0=abc; lang=en"))
  }
}