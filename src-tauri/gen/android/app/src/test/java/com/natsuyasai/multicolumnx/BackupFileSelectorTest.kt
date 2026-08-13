package com.natsuyasai.multicolumnx

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

/**
 * BackupFileSelector（Auto Backup 対象ファイル選定の純粋ロジック）のテスト。
 * WebView プロファイルディレクトリ（Default, Profile 1, ...）は個数が可変なため、
 * ディレクトリ名の完全一致で除外判定を行う設計になっている点を重点的に検証する。
 */
class BackupFileSelectorTest {
  @get:Rule
  val tempFolder = TemporaryFolder()

  // root からの相対パス（"/" 区切り）でネストしたファイルを作成する。
  private fun File.createNestedFile(relativePath: String): File {
    val file = File(this, relativePath)
    file.parentFile?.mkdirs()
    file.writeText("dummy")
    return file
  }

  private fun BackupFileSelector.selectRelativePaths(root: File): Set<String> =
    selectFiles(root).map { it.relativeTo(root).path.replace(File.separatorChar, '/') }.toSet()

  @Test
  fun `通常ファイルとディレクトリはすべて選択されること`() {
    val root = tempFolder.newFolder("root")
    root.createNestedFile("a.txt")
    root.createNestedFile("subdir/b.txt")

    val actual = BackupFileSelector.selectRelativePaths(root)

    assertEquals(setOf("a.txt", "subdir/b.txt"), actual)
  }

  @Test
  fun `トップレベルのcache・code_cache・no_backup配下のファイルは選択されないこと`() {
    val root = tempFolder.newFolder("root")
    root.createNestedFile("cache/x.txt")
    root.createNestedFile("code_cache/y.txt")
    root.createNestedFile("no_backup/z.txt")
    root.createNestedFile("kept.txt")

    val actual = BackupFileSelector.selectRelativePaths(root)

    assertEquals(setOf("kept.txt"), actual)
  }

  @Test
  fun `深さに関わらずサービスワーカーディレクトリ配下は除外されること`() {
    val root = tempFolder.newFolder("root")
    // 個数が可変なプロファイルディレクトリ（Default, Profile 1, ...）を模擬する。
    root.createNestedFile("app_webview/Default/Service Worker/data.db")
    root.createNestedFile("app_webview/Profile 1/Service Worker/data.db")
    root.createNestedFile("app_webview/Default/Cookies")

    val actual = BackupFileSelector.selectRelativePaths(root)

    assertEquals(setOf("app_webview/Default/Cookies"), actual)
  }

  @Test
  fun `共有辞書ディレクトリ配下も除外されること`() {
    val root = tempFolder.newFolder("root")
    root.createNestedFile("app_webview/Default/Shared Dictionary/dict.bin")
    root.createNestedFile("app_webview/Profile 2/Shared Dictionary/dict.bin")
    root.createNestedFile("app_webview/Default/Cookies")

    val actual = BackupFileSelector.selectRelativePaths(root)

    assertEquals(setOf("app_webview/Default/Cookies"), actual)
  }

  @Test
  fun `トップレベル以外の偶然のcacheディレクトリは除外されないこと`() {
    val root = tempFolder.newFolder("root")
    root.createNestedFile("app_webview/Default/cache/data.db")

    val actual = BackupFileSelector.selectRelativePaths(root)

    assertEquals(setOf("app_webview/Default/cache/data.db"), actual)
  }

  @Test
  fun `空ディレクトリやネストが深いディレクトリでも例外なく動作すること`() {
    val root = tempFolder.newFolder("root")
    File(root, "empty_dir").mkdirs()
    root.createNestedFile("a/b/c/d/e/f/deep.txt")

    val actual = BackupFileSelector.selectRelativePaths(root)

    assertEquals(setOf("a/b/c/d/e/f/deep.txt"), actual)
  }

  @Test
  fun `存在しないディレクトリを渡しても例外なく空リストを返すこと`() {
    val nonExistent = File(tempFolder.root, "does_not_exist")

    val actual = BackupFileSelector.selectFiles(nonExistent)

    assertTrue(actual.isEmpty())
    assertFalse(nonExistent.exists())
  }
}