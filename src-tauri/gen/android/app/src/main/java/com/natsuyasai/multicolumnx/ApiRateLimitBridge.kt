package com.natsuyasai.multicolumnx

/**
 * column WebView 内の JS（api_rate_limit_monitor）から addWebMessageListener 経由で届く
 * [BridgeMessage] を、対応するコールバックへ振り分けるハンドラ。
 *
 * Android の column WebView はネイティブ WebView のため Tauri IPC が存在せず、
 * APIレート制限情報を Rust に届ける経路としてこのハンドラを使う。
 * JS からは window.__mcxApiRateLimitBridge.postMessage(JSON文字列) で呼び出される
 * （type: "reportApiRateLimit"）。
 *
 * addWebMessageListener のコールバックは UI スレッドから呼ばれる
 * （addJavascriptInterface の JavaBridge スレッドとは異なる）。
 */
class ApiRateLimitBridge(
  private val label: String,
  private val onReport: (label: String, payloadJson: String) -> Unit,
) {
  fun handle(message: BridgeMessage) {
    if (message is BridgeMessage.ReportApiRateLimit) {
      onReport(label, message.payloadJson)
    }
  }
}