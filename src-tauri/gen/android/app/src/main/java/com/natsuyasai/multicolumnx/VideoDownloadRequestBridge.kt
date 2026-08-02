package com.natsuyasai.multicolumnx

import android.webkit.JavascriptInterface

/**
 * column WebView 内の JS（video_long_press_menu）へ addJavascriptInterface で公開するブリッジ。
 *
 * Android の column WebView はネイティブ WebView のため Tauri IPC が存在せず、
 * 動画ダウンロード要求を Rust に届ける経路としてこのブリッジを使う。
 * JS からは window.__mcxVideoDownloadBridge.downloadVideo(payloadJson) で呼び出される。
 *
 * メソッドは WebView の JavaBridge スレッドから呼ばれる。
 */
class VideoDownloadRequestBridge(
  private val onDownloadRequest: (payloadJson: String) -> Unit,
) {
  @JavascriptInterface
  fun downloadVideo(payloadJson: String) {
    if (payloadJson.isEmpty()) return
    onDownloadRequest(payloadJson)
  }
}