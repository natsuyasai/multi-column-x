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

/**
 * コンポーズ新規作成ページ（https://x.com/compose/post）を表示中かどうかを判定する。
 * クエリ・ハッシュの差異は無視し、origin と pathname の一致のみを見る。
 */
fun isComposePostUrl(url: String?): Boolean {
  if (url == null) return false
  val prefix = "https://x.com/compose/post"
  if (!url.startsWith(prefix)) return false
  val rest = url.substring(prefix.length)
  return rest.isEmpty() || rest.startsWith("?") || rest.startsWith("#")
}