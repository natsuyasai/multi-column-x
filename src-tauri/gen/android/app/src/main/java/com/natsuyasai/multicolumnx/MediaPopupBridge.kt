package com.natsuyasai.multicolumnx

/**
 * column WebView 内の JS（image_popup / video_long_press_menu）から addWebMessageListener 経由で
 * 届く [BridgeMessage.OpenMediaPopup] を、コールバックへ振り分けるハンドラ。
 *
 * Android の column WebView はネイティブ WebView のため Tauri IPC が存在せず、メディアの
 * ポップアップ表示要求を Rust に届ける経路としてこのハンドラを使う。JS からは
 * window.__mcxMediaPopupBridge.postMessage(JSON文字列) で呼び出される
 * （type: "openMediaPopup"）。送信元カラムは JS の申告ではなく、ここで保持する [columnId]
 * （Rust の registry キーと同じラベル）を使う。
 *
 * ポップアップ生成は非同期のため、ダブルタップで 2 枚開かないよう、同一 URL の要求は
 * [DUPLICATE_WINDOW_MS] 以内なら無視する。
 */
class MediaPopupBridge(
  private val columnId: String,
  private val onRequest: (columnId: String, url: String) -> Unit,
  private val clock: () -> Long = System::currentTimeMillis,
) {
  private var lastUrl: String? = null
  private var lastAcceptedAt = 0L

  fun handle(message: BridgeMessage) {
    if (message !is BridgeMessage.OpenMediaPopup) return
    val now = clock()
    if (message.url == lastUrl && now - lastAcceptedAt < DUPLICATE_WINDOW_MS) return
    lastUrl = message.url
    lastAcceptedAt = now
    onRequest(columnId, message.url)
  }

  companion object {
    const val DUPLICATE_WINDOW_MS = 1000L
  }
}