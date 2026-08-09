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
 * ファイル選択結果の Uri 配列を決める。
 *
 * FileChooserParams.parseResult は intent.getData() しか見ないため、
 * Google フォトなど clipData にだけ結果を入れて返すプロバイダの選択を取りこぼす。
 * clipData がある場合はそちらを優先する。
 *
 * @param clipItemCount clipData の itemCount（clipData が無い場合は 0）
 * @param clipItemAt clipData の i 番目の Uri を返す（取得できない場合は null）
 * @param parsed FileChooserParams.parseResult の結果
 *
 * JVM 上の Array<T> は Java 配列と同様に実行時にも要素の型を保持する（List とは異なり消去されない）。
 * 呼び出し側（例: ValueCallback<Array<Uri?>?>）は実際に Uri[] を要求するため、
 * ここで Object[] を作って返すと呼び出し先で ClassCastException になる。
 * 実行時型を正しい T[] にするため reified inline 関数にしている。
 */
inline fun <reified T> pickChooserUris(
  clipItemCount: Int,
  clipItemAt: (Int) -> T?,
  parsed: Array<T?>?,
): Array<T?>? {
  // clipItemCount が 0 以下（clipData 無し、または不正な負値）なら parseResult の結果に委ねる。
  if (clipItemCount <= 0) return parsed

  val collected = mutableListOf<T?>()
  for (i in 0 until clipItemCount) {
    val item = clipItemAt(i)
    if (item != null) collected.add(item)
  }

  // clipData はあっても Uri を1件も取得できなかった場合は parseResult へフォールバックする。
  if (collected.isEmpty()) return parsed

  val result = arrayOfNulls<T>(collected.size)
  for (i in collected.indices) {
    result[i] = collected[i]
  }
  return result
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