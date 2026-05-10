package com.natsuyasai.multicolumnx

import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

fun runSyncOnThread(runner: (Runnable) -> Unit, action: () -> Unit) {
    val latch = CountDownLatch(1)
    runner(Runnable {
        try {
            action()
        } finally {
            latch.countDown()
        }
    })
    latch.await(5, TimeUnit.SECONDS)
}
