package com.natsuyasai.multicolumnx

import java.io.InputStream
import java.io.OutputStream

/**
 * input を最大 maxBytes バイトまで output へコピーする。
 * maxBytes を超える入力だった場合は、超過を検出した時点で読み込みを打ち切って false を返す
 * （output には maxBytes を超えて書き込まない）。上限内に収まれば true。
 *
 * バックアップ復元の読込で、巨大なファイルを丸ごとコピーしてしまわないための打ち切り用。
 * Rust 側（commands/backup/file_io.rs の read_limited）でも同じ上限を再検査する。
 */
fun copyWithLimit(
  input: InputStream,
  output: OutputStream,
  maxBytes: Long,
): Boolean {
  val buffer = ByteArray(8 * 1024)
  var total = 0L
  while (true) {
    val read = input.read(buffer)
    if (read < 0) return true
    total += read
    if (total > maxBytes) return false
    output.write(buffer, 0, read)
  }
}