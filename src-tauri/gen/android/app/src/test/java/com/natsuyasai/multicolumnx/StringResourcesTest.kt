package com.natsuyasai.multicolumnx

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.w3c.dom.Element
import java.io.File
import javax.xml.parsers.DocumentBuilderFactory

class StringResourcesTest {
  private val japanese = Regex("[\u3040-\u30FF\u3400-\u9FFF\uFF00-\uFFEF]")
  private val formatSpecifier = Regex("""%(\d+\$)?[-#+ 0,(]*\d*(\.\d+)?[a-zA-Z%]""")

  private fun resFile(dir: String): File = File("src/main/res/$dir/strings.xml")

  private fun load(dir: String): Map<String, String> {
    val file = resFile(dir)
    assertTrue("${file.path} が見つかりません", file.exists())
    val doc = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(file)
    val nodes = doc.getElementsByTagName("string")
    return (0 until nodes.length)
      .map { nodes.item(it) as Element }
      .associate { it.getAttribute("name") to it.textContent }
  }

  private val default by lazy { load("values") }
  private val ja by lazy { load("values-ja") }

  private fun specifiers(text: String): List<String> = formatSpecifier.findAll(text).map { it.value }.sorted().toList()

  @Test
  fun `既定と日本語のキー集合が一致する_ただしアプリ名とタイトルは既定のみ`() {
    val commonKeys = default.keys - setOf("app_name", "main_activity_title")
    assertEquals(commonKeys, ja.keys)
  }

  @Test
  fun `既定と日本語で書式指定子が一致する`() {
    for ((key, jaText) in ja) {
      assertEquals("書式指定子が不一致: $key", specifiers(default.getValue(key)), specifiers(jaText))
    }
  }

  @Test
  fun `既定側の文字列リソースに日本語が含まれない`() {
    for ((key, text) in default) {
      assertTrue("既定側に日本語があります: $key", !japanese.containsMatchIn(text))
    }
  }

  @Test
  fun `日本語の動画ダウンロード文言が現行文言と一致する`() {
    val expected =
      mapOf(
        "video_download_notification_title" to "動画をダウンロード中",
        "video_download_preparing" to "ダウンロードを準備しています",
        "video_download_progress_file" to "ファイル %1\$d/%2\$d",
        "video_download_channel_name" to "動画ダウンロード",
        "video_download_channel_description" to "動画ダウンロードの進捗を表示します",
      )
    assertEquals(expected, ja.filterKeys { it in expected.keys })
    assertEquals(expected.keys, ja.keys)
  }

  @Test
  fun `通知サービスのコメント以外に日本語の直書きがない`() {
    val file = File("src/main/java/com/natsuyasai/multicolumnx/VideoDownloadForegroundService.kt")
    assertTrue("${file.path} が見つかりません", file.exists())
    val offending =
      file.readLines().filter { line ->
        val code = line.substringBefore("//")
        japanese.containsMatchIn(code) && !line.trim().startsWith("*") && !line.trim().startsWith("/*")
      }
    assertTrue("日本語の直書き: $offending", offending.isEmpty())
  }
}