package com.natsuyasai.multicolumnx

import android.webkit.JavascriptInterface

/**
 * column WebView 内の JS（api_rate_limit_monitor）へ addJavascriptInterface で公開するブリッジ。
 *
 * Android の column WebView はネイティブ WebView のため Tauri IPC が存在せず、
 * APIレート制限情報を Rust に届ける経路としてこのブリッジを使う。
 * JS からは window.__mcxApiRateLimitBridge.report(payloadJson) で呼び出される。
 *
 * メソッドは WebView の JavaBridge スレッドから呼ばれる。
 */
class ApiRateLimitBridge(
  private val label: String,
  private val onReport: (label: String, payloadJson: String) -> Unit,
) {
  @JavascriptInterface
  fun report(payloadJson: String) {
    if (payloadJson.isEmpty()) return
    onReport(label, payloadJson)
  }
}