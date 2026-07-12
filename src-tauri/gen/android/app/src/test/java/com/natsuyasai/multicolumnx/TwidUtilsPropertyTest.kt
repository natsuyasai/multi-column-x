package com.natsuyasai.multicolumnx

import io.kotest.property.Arb
import io.kotest.property.arbitrary.long
import io.kotest.property.forAll
import kotlinx.coroutines.runBlocking
import org.junit.Test

/**
 * TwidUtils（parseTwidUserId / twidUserIdFromCookieString）の純粋ロジックに対する
 * プロパティベーステスト。kotest-property の forAll を JUnit4 の @Test 内から
 * runBlocking 経由で実行する（forAll は PropertyContext を返すため void 化のためブロックで破棄する）。
 */
class TwidUtilsPropertyTest {
  @Test
  fun `任意の非負整数を含むu等号形式とurlエンコード形式のtwid値から同じ数値idを復元できる`() {
    runBlocking {
      forAll(Arb.long(0L..Long.MAX_VALUE)) { n ->
        val expected = n.toString()
        parseTwidUserId("u=$n") == expected && parseTwidUserId("u%3D$n") == expected
      }
    }
  }

  @Test
  fun `twidペアの前後に任意のcookieペアを連結してもcookie文字列から同じ数値idを抽出できる`() {
    runBlocking {
      forAll(Arb.long(0L..Long.MAX_VALUE)) { n ->
        val expected = n.toString()
        val cookieString = "ct0=abc; twid=u%3D$n; lang=en"
        twidUserIdFromCookieString(cookieString) == expected
      }
    }
  }
}