package com.natsuyasai.multicolumnx

/**
 * column WebView 内の JS（video_long_press_menu）から addWebMessageListener 経由で届く
 * [BridgeMessage] を、対応するコールバックへ振り分けるハンドラ。
 *
 * Android の column WebView はネイティブ WebView のため Tauri IPC が存在せず、
 * 動画ダウンロード要求を Rust に届ける経路としてこのハンドラを使う。
 * JS からは window.__mcxVideoDownloadBridge.postMessage(JSON文字列) で呼び出される
 * （type: "downloadVideo"）。
 *
 * addWebMessageListener のコールバックは UI スレッドから呼ばれる
 * （addJavascriptInterface の JavaBridge スレッドとは異なる）。
 */
class VideoDownloadRequestBridge(
  private val onDownloadRequest: (payloadJson: String) -> Unit,
) {
  fun handle(message: BridgeMessage) {
    if (message is BridgeMessage.DownloadVideo) {
      onDownloadRequest(message.payloadJson)
    }
  }
}