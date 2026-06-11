package com.natsuyasai.multicolumnx

fun isInternalUrl(url: String): Boolean {
  return url.startsWith("https://x.com") ||
    url.startsWith("https://twitter.com") ||
    url.startsWith("http://localhost") ||
    url.startsWith("about:") ||
    url.startsWith("blob:")
}

/**
 * x.com / twitter.com のログイン画面 URL かどうかを判定する。
 * Cookie が利用できない状態でロードされたときのリカバリ判定に使う。
 */
fun isLoginUrl(url: String): Boolean {
  return url.contains("x.com/login") ||
    url.contains("x.com/i/flow/login") ||
    url.contains("twitter.com/login")
}