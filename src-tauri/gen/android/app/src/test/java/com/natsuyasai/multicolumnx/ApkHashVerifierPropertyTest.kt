package com.natsuyasai.multicolumnx

import io.kotest.property.Arb
import io.kotest.property.arbitrary.byte
import io.kotest.property.arbitrary.byteArray
import io.kotest.property.arbitrary.int
import io.kotest.property.forAll
import kotlinx.coroutines.runBlocking
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.ByteArrayInputStream

/**
 * ApkHashVerifier（SHA-256 ストリーミング計算 + 照合の純粋ロジック）に対する
 * プロパティベーステスト。kotest-property の forAll を JUnit4 の @Test 内から
 * runBlocking 経由で実行する（forAll は PropertyContext を返すため void 化のためブロックで破棄する）。
 */
class ApkHashVerifierPropertyTest {
  @get:Rule
  val tempFolder = TemporaryFolder()

  @Test
  fun `sha256Hexは任意のバイト列に対して常に小文字64桁hexを返す`() {
    runBlocking {
      forAll(Arb.byteArray(Arb.int(0..1024), Arb.byte())) { bytes ->
        val actual = ApkHashVerifier.sha256Hex(ByteArrayInputStream(bytes))
        actual.length == 64 && Regex("^[0-9a-f]{64}$").matches(actual)
      }
    }
  }

  @Test
  fun `verifyは任意のバイト列の正しいsha256を渡すとtrueを返す`() {
    runBlocking {
      forAll(Arb.byteArray(Arb.int(0..1024), Arb.byte())) { bytes ->
        val file = tempFolder.newFile()
        file.writeBytes(bytes)
        val correctHash = ApkHashVerifier.sha256Hex(ByteArrayInputStream(bytes))
        ApkHashVerifier.verify(file, correctHash)
      }
    }
  }

  @Test
  fun `verifyは正しいsha256の先頭1文字を別のhex文字に変えるとfalseを返す`() {
    runBlocking {
      forAll(Arb.byteArray(Arb.int(0..1024), Arb.byte())) { bytes ->
        val file = tempFolder.newFile()
        file.writeBytes(bytes)
        val correctHash = ApkHashVerifier.sha256Hex(ByteArrayInputStream(bytes))
        val firstChar = correctHash[0]
        // 先頭文字と異なる16進数字を選ぶ（必ず異なるhexに置き換えるため巡回シフト）
        val hexDigits = "0123456789abcdef"
        val differentChar = hexDigits[(hexDigits.indexOf(firstChar) + 1) % hexDigits.length]
        val tamperedHash = differentChar + correctHash.substring(1)
        !ApkHashVerifier.verify(file, tamperedHash)
      }
    }
  }
}