package com.natsuyasai.multicolumnx

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream

/** copyWithLimit（バックアップ読込の上限付きコピー）の純粋ロジックテスト。 */
class BackupFileCopyTest {
  private fun copy(
    size: Int,
    limit: Long,
  ): Triple<Boolean, ByteArray, ByteArray> {
    val source = ByteArray(size) { (it % 251).toByte() }
    val out = ByteArrayOutputStream()
    val ok = copyWithLimit(ByteArrayInputStream(source), out, limit)
    return Triple(ok, out.toByteArray(), source)
  }

  @Test
  fun `上限ちょうどの入力は全てコピーされる`() {
    val (ok, copied, source) = copy(size = 20_000, limit = 20_000)

    assertTrue(ok)
    assertArrayEquals(source, copied)
  }

  @Test
  fun `上限より1バイト大きい入力は打ち切られて失敗を返す`() {
    val (ok, _, _) = copy(size = 20_001, limit = 20_000)

    assertFalse(ok)
  }

  @Test
  fun `上限を超える入力でも上限を超えてコピー先へ書き込まない`() {
    val (_, copied, _) = copy(size = 1_000_000, limit = 20_000)

    assertTrue(copied.size.toLong() <= 20_000)
  }

  @Test
  fun `空の入力は成功し何も書き込まない`() {
    val (ok, copied, _) = copy(size = 0, limit = 10)

    assertTrue(ok)
    assertEquals(0, copied.size)
  }
}