package com.natsuyasai.multicolumnx

import io.kotest.property.Arb
import io.kotest.property.arbitrary.element
import io.kotest.property.arbitrary.string
import io.kotest.property.forAll
import kotlinx.coroutines.runBlocking
import org.junit.Test

/**
 * UrlUtils（isLoginUrl / isInternalUrl）の純粋ロジックに対するプロパティベーステスト。
 * kotest-property の forAll を JUnit4 の @Test 内から runBlocking 経由で実行する。
 * （forAll は PropertyContext を返すため、@Test メソッドは void になるようブロック本体で破棄する）
 */
class UrlUtilsPropertyTest {
  private val loginMarkers =
    listOf("x.com/login", "x.com/i/flow/login", "twitter.com/login")

  @Test
  fun `ログインマーカーを含む文字列は前後に任意文字列を連結してもログインURL判定がtrueのまま`() {
    runBlocking {
      forAll(Arb.string(), Arb.string(), Arb.element(loginMarkers)) { pre, suf, marker ->
        isLoginUrl(pre + marker + suf)
      }
    }
  }

  @Test
  fun `外部ドメインで始まるURLはどんな後続文字列でも内部URLではない`() {
    runBlocking {
      forAll(Arb.string()) { suffix ->
        !isInternalUrl("https://evil.example/$suffix")
      }
    }
  }

  @Test
  fun `許可プレフィックスで始まるURLはどんな後続文字列でも内部URLである`() {
    val prefixes =
      listOf("https://x.com", "https://twitter.com", "http://localhost", "about:", "blob:")
    runBlocking {
      forAll(Arb.string(), Arb.element(prefixes)) { suffix, prefix ->
        isInternalUrl(prefix + suffix)
      }
    }
  }
}