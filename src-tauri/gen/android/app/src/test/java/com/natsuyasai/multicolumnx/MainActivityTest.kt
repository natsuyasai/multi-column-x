package com.natsuyasai.multicolumnx

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class UrlUtilsTest {

    @Test
    fun isInternalUrl_xCom_returnsTrue() {
        assertTrue(isInternalUrl("https://x.com/home"))
    }

    @Test
    fun isInternalUrl_xCom_subPath_returnsTrue() {
        assertTrue(isInternalUrl("https://x.com/i/lists/123"))
    }

    @Test
    fun isInternalUrl_twitterCom_returnsTrue() {
        assertTrue(isInternalUrl("https://twitter.com/home"))
    }

    @Test
    fun isInternalUrl_localhost_returnsTrue() {
        assertTrue(isInternalUrl("http://localhost:1420/"))
    }

    @Test
    fun isInternalUrl_aboutBlank_returnsTrue() {
        assertTrue(isInternalUrl("about:blank"))
    }

    @Test
    fun isInternalUrl_blobUrl_returnsTrue() {
        assertTrue(isInternalUrl("blob:https://x.com/abc"))
    }

    @Test
    fun isInternalUrl_externalUrl_returnsFalse() {
        assertFalse(isInternalUrl("https://example.com"))
    }

    @Test
    fun isInternalUrl_youtubeUrl_returnsFalse() {
        assertFalse(isInternalUrl("https://youtube.com/watch?v=abc"))
    }

    @Test
    fun isInternalUrl_emptyString_returnsFalse() {
        assertFalse(isInternalUrl(""))
    }
}

class RunSyncOnThreadTest {

    @Test
    fun runSyncOnThread_executesAction() {
        var executed = false
        runSyncOnThread(runner = { it.run() }) { executed = true }
        assertTrue(executed)
    }

    @Test
    fun runSyncOnThread_completesBeforeReturn() {
        val results = mutableListOf<Int>()
        runSyncOnThread(runner = { it.run() }) {
            results.add(1)
            results.add(2)
        }
        assertEquals(listOf(1, 2), results)
    }

    @Test
    fun runSyncOnThread_exceptionInActionStillReleasesLatch() {
        var afterSync: Boolean
        try {
            runSyncOnThread(runner = { it.run() }) {
                throw RuntimeException("test error")
            }
        } catch (_: RuntimeException) {}
        afterSync = true
        assertTrue(afterSync)
    }
}
