package com.natsuyasai.multicolumnx

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class NormalizeAcceptTypesTest {
  @Test
  fun `mimeタイプのみの配列はそのまま返る`() {
    val result = normalizeAcceptTypes(arrayOf("image/jpeg", "image/png")) { null }
    assertEquals(listOf("image/jpeg", "image/png"), result.toList())
  }

  @Test
  fun `空文字と空白のみの要素は除外される`() {
    val result = normalizeAcceptTypes(arrayOf("", "  ")) { null }
    assertEquals(emptyList<String>(), result.toList())
  }

  @Test
  fun `拡張子はresolverでmimeへ解決される`() {
    val result = normalizeAcceptTypes(arrayOf(".gif")) { ext -> if (ext == "gif") "image/gif" else null }
    assertEquals(listOf("image/gif"), result.toList())
  }

  @Test
  fun `resolverがnullを返す拡張子は除外される`() {
    val result = normalizeAcceptTypes(arrayOf(".unknown")) { null }
    assertEquals(emptyList<String>(), result.toList())
  }

  @Test
  fun `重複するmimeタイプは最初の1件だけ残る`() {
    val result = normalizeAcceptTypes(arrayOf("image/jpeg", "image/jpeg")) { null }
    assertEquals(listOf("image/jpeg"), result.toList())
  }

  @Test
  fun `mimeと解決後の拡張子が重複する場合も1件に集約される`() {
    val result =
      normalizeAcceptTypes(arrayOf("image/png", ".png")) { ext -> if (ext == "png") "image/png" else null }
    assertEquals(listOf("image/png"), result.toList())
  }

  @Test
  fun `拡張子は先頭のドットを除いた文字列がresolverへ渡される`() {
    var receivedArg: String? = null
    normalizeAcceptTypes(arrayOf(".gif")) { ext ->
      receivedArg = ext
      "image/gif"
    }
    assertEquals("gif", receivedArg)
  }
}

class FileChooserCallbackHolderTest {
  @Test
  fun `setした後consumeすると同じコールバックが返る`() {
    val holder = FileChooserCallbackHolder<String>()
    var received: String? = "not called"
    val callback: (String?) -> Unit = { received = it }
    holder.set(callback)
    val consumed = holder.consume()
    assertEquals(callback, consumed)
    consumed?.invoke("value")
    assertEquals("value", received)
  }

  @Test
  fun `consume後にもう一度consumeするとnullが返る`() {
    val holder = FileChooserCallbackHolder<String>()
    holder.set { }
    holder.consume()
    assertNull(holder.consume())
  }

  @Test
  fun `何もsetしていない状態のconsumeはnull`() {
    val holder = FileChooserCallbackHolder<String>()
    assertNull(holder.consume())
  }

  @Test
  fun `保留中にsetを呼ぶと前のコールバックがnull付きで1回呼ばれる`() {
    val holder = FileChooserCallbackHolder<String>()
    var previousCallCount = 0
    var previousReceivedValue: String? = "not called"
    holder.set { value ->
      previousCallCount++
      previousReceivedValue = value
    }
    holder.set { }
    assertEquals(1, previousCallCount)
    assertNull(previousReceivedValue)
  }

  @Test
  fun `保留中にsetを呼んだ後consumeすると新しい方のコールバックが返る`() {
    val holder = FileChooserCallbackHolder<String>()
    holder.set { }
    var newCalled = false
    val newCallback: (String?) -> Unit = { newCalled = true }
    holder.set(newCallback)
    val consumed = holder.consume()
    assertEquals(newCallback, consumed)
    consumed?.invoke(null)
    assertEquals(true, newCalled)
  }
}

class PickChooserUrisTest {
  @Test
  fun `clipItemCountが0ならparsedをそのまま返す`() {
    val parsed = arrayOf<String?>("parsed1", "parsed2")
    val result = pickChooserUris(clipItemCount = 0, clipItemAt = { null }, parsed = parsed)
    assertEquals(parsed.toList(), result?.toList())
  }

  @Test
  fun `clipItemCountが0でparsedがnullならnullを返す`() {
    val result = pickChooserUris<String>(clipItemCount = 0, clipItemAt = { null }, parsed = null)
    assertNull(result)
  }

  @Test
  fun `clipItemCountが1でclipItemAtがuriを返す場合はその1件を返しparsedは使わない`() {
    val result =
      pickChooserUris(
        clipItemCount = 1,
        clipItemAt = { "clip0" },
        parsed = arrayOf("unused"),
      )
    assertEquals(listOf("clip0"), result?.toList())
  }

  @Test
  fun `clipItemCountが3なら3件すべてを入力順で返す`() {
    val result =
      pickChooserUris(
        clipItemCount = 3,
        clipItemAt = { i -> "clip$i" },
        parsed = null,
      )
    assertEquals(listOf("clip0", "clip1", "clip2"), result?.toList())
  }

  @Test
  fun `clipItemAtがnullを返す要素は結果から除外される`() {
    val result =
      pickChooserUris(
        clipItemCount = 2,
        clipItemAt = { i -> if (i == 0) "clip0" else null },
        parsed = arrayOf("unused"),
      )
    assertEquals(listOf("clip0"), result?.toList())
  }

  @Test
  fun `clipItemCountが正でも取得できた要素が0件ならparsedにフォールバックする`() {
    val parsed = arrayOf<String?>("parsed1")
    val result =
      pickChooserUris(
        clipItemCount = 2,
        clipItemAt = { null },
        parsed = parsed,
      )
    assertEquals(parsed.toList(), result?.toList())
  }

  @Test
  fun `clipItemCountが負値でも例外を投げずparsedを返す`() {
    val parsed = arrayOf<String?>("parsed1")
    val result =
      pickChooserUris(
        clipItemCount = -1,
        clipItemAt = { "shouldNotBeCalled" },
        parsed = parsed,
      )
    assertEquals(parsed.toList(), result?.toList())
  }
}