package com.natsuyasai.multicolumnx

import java.net.URI
import java.util.Locale

/**
 * addWebMessageListener の allowedOriginRules に渡す許可オリジンルール。
 *
 * WebView 内部でこのルールに一致しない送信元からの postMessage は listener に届かない
 * （androidx.webkit のネイティブ側フィルタ）。加えて [isAllowedBridgeOrigin] でコールバック内でも
 * 二重チェックする。
 */
val BRIDGE_ALLOWED_ORIGIN_RULES: Set<String> =
  setOf(
    "https://x.com",
    "https://*.x.com",
    "https://twitter.com",
    "https://*.twitter.com",
  )

/**
 * addWebMessageListener の sourceOrigin をコールバック内で二重チェックする関数。
 *
 * scheme が https で、host が x.com / twitter.com そのもの、またはそれらのサブドメインである
 * 場合のみ true を返す。"https://x.com.example.com" のような偽装ホスト（サフィックス一致のみで
 * 判定すると誤って許可してしまうケース）は拒否する。
 */
fun isAllowedBridgeOrigin(origin: String): Boolean {
  val uri = runCatching { URI(origin) }.getOrNull() ?: return false
  if (!uri.scheme.equals("https", ignoreCase = true)) return false
  val host = uri.host?.lowercase(Locale.ROOT) ?: return false
  return isXOrTwitterHost(host)
}

private fun isXOrTwitterHost(host: String): Boolean =
  host == "x.com" || host.endsWith(".x.com") ||
    host == "twitter.com" || host.endsWith(".twitter.com")

/**
 * WEB_MESSAGE_LISTENER 機能の対応可否から、ネイティブブリッジを公開すべきかを判定する。
 *
 * 端末の WebView（WebViewFeature.isFeatureSupported）が対応していない場合は
 * ブリッジを一切公開しない（安全側に倒す）。判定ロジックを純粋関数として切り出すことで、
 * WebViewFeature（フレームワーク依存で JVM 単体テストから直接呼べない）に依存せず
 * ゲーティングの判断だけを単体テストで固定できるようにしている。
 */
fun shouldExposeBridge(isWebMessageListenerSupported: Boolean): Boolean = isWebMessageListenerSupported