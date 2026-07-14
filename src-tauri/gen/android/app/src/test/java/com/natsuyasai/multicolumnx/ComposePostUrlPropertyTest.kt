package com.natsuyasai.multicolumnx

import io.kotest.property.Arb
import io.kotest.property.arbitrary.string
import io.kotest.property.forAll
import kotlinx.coroutines.runBlocking
import org.junit.Test

/**
 * isComposePostUrl の純粋ロジックに対するプロパティベーステスト。
 *
 * 仕様（UrlUtils.kt のコメント参照）: 「origin が https://x.com かつ pathname が
 * /compose/post のときのみ true。クエリ・ハッシュの差異は無視」を、個別の具体例では
 * なく任意のクエリ・任意のハッシュ・プレフィックス不一致という広い入力域で検証する。
 * kotest-property の forAll を JUnit4 の @Test 内から runBlocking 経由で実行する。
 */
class ComposePostUrlPropertyTest {
  private val prefix = "https://x.com/compose/post"

  @Test
  fun `任意のクエリを付けてもtrueのまま`() {
    runBlocking {
      forAll(Arb.string()) { s ->
        isComposePostUrl("$prefix?$s")
      }
    }
  }

  @Test
  fun `任意のハッシュを付けてもtrueのまま`() {
    runBlocking {
      forAll(Arb.string()) { s ->
        isComposePostUrl("$prefix#$s")
      }
    }
  }

  @Test
  fun `プレフィックスで始まらない任意の文字列はfalse`() {
    runBlocking {
      forAll(Arb.string()) { s ->
        if (s.startsWith(prefix)) {
          true
        } else {
          !isComposePostUrl(s)
        }
      }
    }
  }

  @Test
  fun `プレフィックス直後がクエリでもハッシュでも空でもない文字列はfalse`() {
    runBlocking {
      forAll(Arb.string()) { rest ->
        if (rest.isEmpty() || rest.startsWith("?") || rest.startsWith("#")) {
          true
        } else {
          !isComposePostUrl(prefix + rest)
        }
      }
    }
  }
}