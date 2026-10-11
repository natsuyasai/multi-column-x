package com.natsuyasai.multicolumnx

import io.kotest.property.Arb
import io.kotest.property.arbitrary.long
import io.kotest.property.forAll
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Test

class VideoDownloadProgressTextTest {
  @Test
  fun `合計サイズが0以下のときは接頭辞のみを返す`() {
    assertEquals("File 1/2", buildProgressText("File 1/2", 500L, 0L))
    assertEquals("File 1/2", buildProgressText("File 1/2", 500L, -1L))
  }

  @Test
  fun `合計サイズが正のときはパーセントを付ける`() {
    assertEquals("File 1/2 (42%)", buildProgressText("File 1/2", 42L, 100L))
    assertEquals("ファイル 2/3 (50%)", buildProgressText("ファイル 2/3", 1L, 2L))
  }

  @Test
  fun `現在値が0のときは0パーセントになる`() {
    assertEquals("File 1/1 (0%)", buildProgressText("File 1/1", 0L, 100L))
  }

  @Test
  fun `現在値が合計を超えても100パーセントに丸める`() {
    assertEquals("File 1/1 (100%)", buildProgressText("File 1/1", 250L, 100L))
  }

  @Test
  fun `現在値が負でも0パーセントに丸める`() {
    assertEquals("File 1/1 (0%)", buildProgressText("File 1/1", -10L, 100L))
  }

  @Test
  fun `任意の入力で戻り値は接頭辞で始まりパーセントは0から100に収まる`() {
    runBlocking {
      forAll(Arb.long(-1_000_000L..1_000_000L), Arb.long(-1_000_000L..1_000_000L)) { current, total ->
        val text = buildProgressText("P", current, total)
        if (total <= 0) {
          text == "P"
        } else {
          val percent = Regex("""^P \((\d+)%\)$""").matchEntire(text)?.groupValues?.get(1)?.toInt()
          percent != null && percent in 0..100
        }
      }
    }
  }
}