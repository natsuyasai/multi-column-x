package com.natsuyasai.multicolumnx

import io.kotest.property.Arb
import io.kotest.property.arbitrary.boolean
import io.kotest.property.arbitrary.list
import io.kotest.property.forAll
import kotlinx.coroutines.runBlocking
import org.junit.Test

class MediaPopupFlagSyncPropertyTest {
  @Test
  fun `任意の切替列の後でも全登録カラムの最後のスクリプトは現在値と一致する`() {
    runBlocking {
      forAll(Arb.list(Arb.boolean(), 0..20)) { changes ->
        val last = mutableMapOf<String, String>()
        val sync =
          MediaPopupFlagSync<Int>(
            installOnLoad = { id, script ->
              last[id] = script
              0
            },
            removeOnLoad = {},
            evaluateNow = { _, _ -> },
          )
        sync.registerColumn("column-a")
        changes.forEach { sync.setActive(it) }
        sync.registerColumn("column-b")
        last.values.all { it == mediaPopupFlagScript(sync.active) } && last.size == 2
      }
    }
  }
}