package com.natsuyasai.multicolumnx

/**
 * FileChooserParams.acceptTypes を Intent.EXTRA_MIME_TYPES 用の MIME 配列へ正規化する。
 *
 * - 空文字・空白のみの要素は除外する
 * - "." 始まりの拡張子は mimeResolver で MIME へ解決する（解決できなければ除外）
 * - 重複は最初の1件だけ残す（順序は入力順を維持）
 *
 * mimeResolver は android.webkit.MimeTypeMap への依存をテストから切り離すための注入点。
 */
fun normalizeAcceptTypes(
  acceptTypes: Array<String>,
  mimeResolver: (String) -> String?,
): Array<String> {
  val result = mutableListOf<String>()
  for (rawType in acceptTypes) {
    val type = rawType.trim()
    if (type.isEmpty()) continue

    val mimeType =
      if (type.startsWith(".")) {
        mimeResolver(type.substring(1)) ?: continue
      } else {
        type
      }

    if (!result.contains(mimeType)) {
      result.add(mimeType)
    }
  }
  return result.toTypedArray()
}

/**
 * ファイル選択結果のコールバックを ActivityResult が返るまで保持する。
 * UI スレッドからのみ操作する前提のため同期化はしない。
 */
class FileChooserCallbackHolder<T> {
  private var pending: ((T?) -> Unit)? = null

  /**
   * 新しいコールバックを保持する。
   * 保留中の前回コールバックが残っている場合は null で解決してから置き換える
   * （解決しないまま捨てると WebView 側が待ち続け、以降のファイル選択が無反応になる）。
   */
  fun set(callback: (T?) -> Unit) {
    pending?.invoke(null)
    pending = callback
  }

  /** 保持中のコールバックを取り出してクリアする。無ければ null。 */
  fun consume(): ((T?) -> Unit)? {
    val callback = pending
    pending = null
    return callback
  }
}