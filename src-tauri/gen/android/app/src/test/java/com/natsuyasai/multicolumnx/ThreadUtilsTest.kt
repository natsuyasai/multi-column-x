package com.natsuyasai.multicolumnx

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.atomic.AtomicInteger

/**
 * runSyncOnThread（CountDownLatch + runner コールバックで action の完了を待つ純粋ロジック）のテスト。
 * runner を差し替えることで実行スレッドを制御し、フレームワーク非依存で検証する。
 */
class ThreadUtilsTest {
  @Test
  fun `runnerがRunnableを即時実行するとactionが1回実行される`() {
    val counter = AtomicInteger(0)

    runSyncOnThread(
      runner = { it.run() },
      action = { counter.incrementAndGet() },
    )

    assertEquals(1, counter.get())
  }

  @Test
  fun `action内で例外が投げられてもfinallyでlatchが下りてブロックせず返る`() {
    var thrown = false

    try {
      runSyncOnThread(
        runner = { it.run() },
        action = { throw RuntimeException("boom") },
      )
    } catch (e: RuntimeException) {
      // runner 即時実行のため例外は呼び出し元まで伝播する。
      // ここで捕捉できる時点で latch が下りメソッドが返っていることを確認できる。
      thrown = true
      assertEquals("boom", e.message)
    }

    assertTrue("action の例外が呼び出し元へ伝播するはず", thrown)
  }

  @Test
  fun `runnerを別スレッドで実行してもactionが実行されメソッドが返る`() {
    val counter = AtomicInteger(0)

    runSyncOnThread(
      runner = { Thread { it.run() }.start() },
      action = { counter.incrementAndGet() },
    )

    // latch.await で別スレッドの action 完了を待ってから返るため、必ず1回実行済み。
    assertEquals(1, counter.get())
  }
}