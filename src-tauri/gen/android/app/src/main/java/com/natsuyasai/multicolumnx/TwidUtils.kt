package com.natsuyasai.multicolumnx

/**
 * twid Cookie の値（"twid=" を剥がした後の部分）から数値ユーザーIDを抽出する。
 * "u%3D<id>"（URLエンコード生値）/ "u=<id>"（デコード後）のどちらの形式にも対応する。
 * "u=" 以降が1文字以上のASCII数字のみの場合に限り抽出した文字列を返し、それ以外は null。
 * Rust 側 `parse_twid_user_id`（src-tauri/src/commands/account.rs）と同一挙動。
 */
fun parseTwidUserId(twidValue: String): String? {
  val normalized = twidValue.replace("%3D", "=").replace("%3d", "=")
  val id = normalized.removePrefix("u=")
  if (id == normalized) {
    return null
  }
  return if (id.isNotEmpty() && id.all { it in '0'..'9' }) id else null
}

/**
 * Android の CookieManager.getCookie が返す "a=b; twid=u%3D123; c=d" 形式の
 * cookie 文字列から twid ペアを探し、数値ユーザーIDを抽出する。twid が無ければ null。
 */
fun twidUserIdFromCookieString(cookieString: String): String? {
  for (pair in cookieString.split(";")) {
    val trimmed = pair.trim()
    val separatorIndex = trimmed.indexOf('=')
    if (separatorIndex < 0) {
      continue
    }
    val name = trimmed.substring(0, separatorIndex)
    val value = trimmed.substring(separatorIndex + 1)
    if (name == "twid") {
      return parseTwidUserId(value)
    }
  }
  return null
}