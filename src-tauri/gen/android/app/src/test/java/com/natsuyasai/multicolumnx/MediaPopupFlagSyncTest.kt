package com.natsuyasai.multicolumnx

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** MediaPopupFlagSync（複数カラム表示フラグの保持と各カラムへの配布）のテスト。 */
class MediaPopupFlagSyncTest {
  private val installs = mutableListOf<Pair<String, String>>()
  private val removed = mutableListOf<Int>()
  private val evals = mutableListOf<Pair<String, String>>()
  private var nextHandle = 0
  private var installReturnsNull = false
  private val sync =
    MediaPopupFlagSync<Int>(
      installOnLoad = { id, script ->
        installs.add(Pair(id, script))
        if (installReturnsNull) null else nextHandle++
      },
      removeOnLoad = { removed.add(it) },
      evaluateNow = { id, script -> evals.add(Pair(id, script)) },
    )

  @Test
  fun `フラグのスクリプトは有効無効をグローバル変数へ代入する`() {
    assertEquals("window.__mcxMultiColumnActive=true;", mediaPopupFlagScript(true))
    assertEquals("window.__mcxMultiColumnActive=false;", mediaPopupFlagScript(false))
  }

  @Test
  fun `既定は無効で新規カラムには無効のスクリプトが入る`() {
    sync.registerColumn("column-a")

    assertEquals(false, sync.active)
    assertEquals(listOf(Pair("column-a", mediaPopupFlagScript(false))), installs)
    assertTrue(evals.isEmpty())
  }

  @Test
  fun `1列から2列への切替で登録済みの全カラムが有効へ切り替わる`() {
    sync.registerColumn("column-a")
    sync.registerColumn("column-b")
    installs.clear()

    sync.setActive(true)

    assertEquals(true, sync.active)
    assertEquals(
      listOf(Pair("column-a", mediaPopupFlagScript(true)), Pair("column-b", mediaPopupFlagScript(true))),
      installs,
    )
    assertEquals(
      listOf(Pair("column-a", mediaPopupFlagScript(true)), Pair("column-b", mediaPopupFlagScript(true))),
      evals,
    )
    assertEquals(listOf(0, 1), removed)
  }

  @Test
  fun `同じ値の再設定では何も配布しない`() {
    sync.registerColumn("column-a")
    installs.clear()

    sync.setActive(false)

    assertTrue(installs.isEmpty())
    assertTrue(evals.isEmpty())
    assertTrue(removed.isEmpty())
  }

  @Test
  fun `2列から1列への切替で登録済みの全カラムが無効へ切り替わる`() {
    sync.registerColumn("column-a")
    sync.registerColumn("column-b")
    sync.setActive(true)
    installs.clear()
    evals.clear()
    removed.clear()

    sync.setActive(false)

    assertEquals(false, sync.active)
    assertEquals(
      listOf(Pair("column-a", mediaPopupFlagScript(false)), Pair("column-b", mediaPopupFlagScript(false))),
      installs,
    )
    assertEquals(
      listOf(Pair("column-a", mediaPopupFlagScript(false)), Pair("column-b", mediaPopupFlagScript(false))),
      evals,
    )
    assertEquals(2, removed.size)
  }

  @Test
  fun `後から登録したカラムにも現在値が反映される`() {
    sync.registerColumn("column-a")
    sync.setActive(true)
    installs.clear()

    sync.registerColumn("column-b")

    assertEquals(listOf(Pair("column-b", mediaPopupFlagScript(true))), installs)
  }

  @Test
  fun `カラム削除で登録が解除されhandleが解放され以後は配布されない`() {
    sync.registerColumn("column-a")
    sync.unregisterColumn("column-a")
    installs.clear()
    evals.clear()

    sync.setActive(true)

    assertEquals(listOf(0), removed)
    assertTrue(installs.isEmpty())
    assertTrue(evals.isEmpty())
  }

  @Test
  fun `reapplyは登録済みカラムにだけ現在値を評価する`() {
    sync.registerColumn("column-a")
    sync.setActive(true)
    evals.clear()

    sync.reapply("column-a")
    sync.reapply("column-unknown")

    assertEquals(listOf(Pair("column-a", mediaPopupFlagScript(true))), evals)
  }

  @Test
  fun `installonloadがnullを返しても落ちず評価は行われる`() {
    installReturnsNull = true
    sync.registerColumn("column-a")

    sync.setActive(true)

    assertEquals(listOf(Pair("column-a", mediaPopupFlagScript(true))), evals)
    assertTrue(removed.isEmpty())
  }
}