package com.natsuyasai.multicolumnx

import java.io.File

/**
 * Auto Backup 対象ファイルを選定する純粋ロジック。
 *
 * WebView のプロファイルディレクトリ（Default, Profile 1, Profile 2, ...）は個数が可変で
 * XML の宣言的バックアップルールではワイルドカード指定ができないため、
 * ディレクトリ名の完全一致で除外判定を行う。
 */
object BackupFileSelector {
  // トップレベルのみで除外するディレクトリ名（OS標準のキャッシュ領域と同義のもの）
  private val excludedTopLevelDirNames = setOf("cache", "code_cache", "no_backup")

  // 深さを問わず除外するディレクトリ名（WebView Service Worker 等の再生成可能キャッシュ）
  private val excludedAnyDepthDirNames = setOf("Service Worker", "Shared Dictionary")

  fun selectFiles(root: File): List<File> {
    val result = mutableListOf<File>()
    collect(root, depth = 0, result)
    return result
  }

  private fun collect(
    dir: File,
    depth: Int,
    result: MutableList<File>,
  ) {
    val entries = dir.listFiles() ?: return
    for (entry in entries) {
      when {
        entry.isDirectory -> {
          if (isExcludedDir(entry.name, depth)) continue
          collect(entry, depth + 1, result)
        }
        entry.isFile -> result.add(entry)
      }
    }
  }

  private fun isExcludedDir(
    name: String,
    depth: Int,
  ): Boolean {
    if (depth == 0 && name in excludedTopLevelDirNames) return true
    if (name in excludedAnyDepthDirNames) return true
    return false
  }
}