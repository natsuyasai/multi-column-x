package com.natsuyasai.multicolumnx

import java.io.File
import java.io.InputStream
import java.security.MessageDigest

/** APK 自己更新時の SHA-256 照合。純粋ロジックとして分離し単体テスト可能にする。 */
object ApkHashVerifier {
  /** InputStream を SHA-256 でストリーミング集計し、小文字 64 桁 hex を返す。 */
  fun sha256Hex(input: InputStream): String {
    val digest = MessageDigest.getInstance("SHA-256")
    val buffer = ByteArray(8192)
    while (true) {
      val read = input.read(buffer)
      if (read < 0) break
      digest.update(buffer, 0, read)
    }
    return digest.digest().joinToString("") { "%02x".format(it) }
  }

  /** file の SHA-256 が expectedSha256（64桁hex・大小無視）と一致すれば true。 */
  fun verify(
    file: File,
    expectedSha256: String,
  ): Boolean {
    val expected = expectedSha256.trim()
    if (!Regex("^[0-9a-fA-F]{64}$").matches(expected)) return false
    return file.inputStream().use { sha256Hex(it) }.equals(expected, ignoreCase = true)
  }
}