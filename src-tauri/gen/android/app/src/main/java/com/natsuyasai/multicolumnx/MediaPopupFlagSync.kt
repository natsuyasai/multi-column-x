package com.natsuyasai.multicolumnx

/** column 内 JS が読む複数カラム表示フラグのグローバルを設定するスクリプト。 */
fun mediaPopupFlagScript(active: Boolean): String = "window.__mcxMultiColumnActive=$active;"

/**
 * 複数カラム表示フラグ（メディアのポップアップ表示の有効条件）の唯一の保持者。
 * UI スレッドからのみ呼ぶこと（呼び出し側が直列化する）。
 *
 * 既存の文書へは [evaluateNow]、以後の文書ロード（リロード・再遷移）へは document-start script の
 * 差し替え（[installOnLoad] / [removeOnLoad]）で届ける。init script へ作成時の値を埋め込む方式だと、
 * リロードのたびに作成時の値が復活してしまうため、値は常にここが持つ。既定は無効（カラム内表示）。
 */
class MediaPopupFlagSync<H : Any>(
  private val installOnLoad: (columnId: String, script: String) -> H?,
  private val removeOnLoad: (handle: H) -> Unit,
  private val evaluateNow: (columnId: String, script: String) -> Unit,
) {
  var active: Boolean = false
    private set

  private val columns = LinkedHashSet<String>()
  private val handles = mutableMapOf<String, H>()

  /** 新規カラム: 現在値の document-start script を入れる（文書が無いので eval は不要）。 */
  fun registerColumn(id: String) {
    columns.add(id)
    replaceOnLoad(id)
  }

  private fun replaceOnLoad(id: String) {
    handles.remove(id)?.let(removeOnLoad)
    installOnLoad(id, mediaPopupFlagScript(active))?.let { handles[id] = it }
  }

  fun unregisterColumn(id: String) {
    handles.remove(id)?.let(removeOnLoad)
    columns.remove(id)
  }

  /** 値が変わったときだけ全カラムへ配布する。 */
  fun setActive(next: Boolean) {
    if (next == active) return
    active = next
    for (id in columns) {
      replaceOnLoad(id)
      evaluateNow(id, mediaPopupFlagScript(active))
    }
  }

  /** 表示時の保険（paused 中の eval が実行されない場合に備える）。 */
  fun reapply(id: String) {
    if (id in columns) evaluateNow(id, mediaPopupFlagScript(active))
  }
}