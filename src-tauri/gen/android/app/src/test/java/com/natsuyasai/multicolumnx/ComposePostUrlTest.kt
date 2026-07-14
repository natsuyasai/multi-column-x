package com.natsuyasai.multicolumnx

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** isComposePostUrl（コンポーズ新規作成ページ URL 判定）の純粋ロジックテスト。 */
class ComposePostUrlTest {
  @Test
  fun `compose_post_の完全一致URLはtrueを返す`() {
    assertTrue(isComposePostUrl("https://x.com/compose/post"))
  }

  @Test
  fun `クエリ付きのcompose_post_URLはtrueを返す`() {
    assertTrue(isComposePostUrl("https://x.com/compose/post?foo=1"))
  }

  @Test
  fun `ハッシュ付きのcompose_post_URLはtrueを返す`() {
    assertTrue(isComposePostUrl("https://x.com/compose/post#bar"))
  }

  @Test
  fun `home_はコンポーズURLではない`() {
    assertFalse(isComposePostUrl("https://x.com/home"))
  }

  @Test
  fun `compose_post_のサブパスはコンポーズURLではない`() {
    assertFalse(isComposePostUrl("https://x.com/compose/post/quote"))
  }

  @Test
  fun `twitter_com_ホストはコンポーズURLではない`() {
    assertFalse(isComposePostUrl("https://twitter.com/compose/post"))
  }

  @Test
  fun `httpスキームはコンポーズURLではない`() {
    assertFalse(isComposePostUrl("http://x.com/compose/post"))
  }

  @Test
  fun `nullはコンポーズURLではない`() {
    assertFalse(isComposePostUrl(null))
  }

  @Test
  fun `前方一致だけのcompose_postingはコンポーズURLではない`() {
    assertFalse(isComposePostUrl("https://x.com/compose/posting"))
  }
}