package com.natsuyasai.multicolumnx

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.ByteArrayInputStream

/**
 * ApkHashVerifier（SHA-256 ストリーミング計算 + 照合の純粋ロジック）のテスト。
 * 既知ベクトル（空データ / "abc"）で sha256Hex を検証し、verify はファイル入出力込みで検証する。
 */
class ApkHashVerifierTest {
  @get:Rule
  val tempFolder = TemporaryFolder()

  companion object {
    private const val EMPTY_SHA256 =
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    private const val ABC_SHA256 =
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
  }

  @Test
  fun `空データのsha256が既知ベクトルと一致する`() {
    val actual = ApkHashVerifier.sha256Hex(ByteArrayInputStream(ByteArray(0)))

    assertEquals(EMPTY_SHA256, actual)
  }

  @Test
  fun `abc文字列のsha256が既知ベクトルと一致する`() {
    val actual = ApkHashVerifier.sha256Hex(ByteArrayInputStream("abc".toByteArray()))

    assertEquals(ABC_SHA256, actual)
  }

  @Test
  fun `sha256Hexは常に64桁の小文字hexを返す`() {
    val actual = ApkHashVerifier.sha256Hex(ByteArrayInputStream(byteArrayOf(1, 2, 3, 4, 5)))

    assertEquals(64, actual.length)
    assertTrue(Regex("^[0-9a-f]{64}$").matches(actual))
  }

  @Test
  fun `verifyは正しいハッシュでtrueを返す`() {
    val file = tempFolder.newFile("abc.apk")
    file.writeBytes("abc".toByteArray())

    assertTrue(ApkHashVerifier.verify(file, ABC_SHA256))
  }

  @Test
  fun `verifyは大文字ハッシュでもtrueを返す`() {
    val file = tempFolder.newFile("abc-upper.apk")
    file.writeBytes("abc".toByteArray())

    assertTrue(ApkHashVerifier.verify(file, ABC_SHA256.uppercase()))
  }

  @Test
  fun `verifyは1バイト改変でfalseを返す`() {
    val file = tempFolder.newFile("tampered.apk")
    file.writeBytes("abc".toByteArray())

    assertFalse(ApkHashVerifier.verify(file, EMPTY_SHA256))
  }

  @Test
  fun `verifyは64桁hexでない期待値でfalseを返す`() {
    val file = tempFolder.newFile("invalid-hash.apk")
    file.writeBytes("abc".toByteArray())

    assertFalse(ApkHashVerifier.verify(file, "not-a-hash"))
  }

  @Test
  fun `verifyは前後空白付き期待値をtrimして判定する`() {
    val file = tempFolder.newFile("padded-hash.apk")
    file.writeBytes("abc".toByteArray())

    assertTrue(ApkHashVerifier.verify(file, "  $ABC_SHA256  "))
  }
}