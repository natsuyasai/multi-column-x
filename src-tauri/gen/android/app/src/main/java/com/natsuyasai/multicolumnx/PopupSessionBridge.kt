package com.natsuyasai.multicolumnx

/**
 * ポップアップ WebView 内の JS（popup_toolbar）から addWebMessageListener 経由で届く
 * [BridgeMessage] を、対応するコールバックへ振り分けるハンドラ。
 *
 * Android のポップアップはネイティブ WebView のため Tauri IPC（window.__TAURI__）が存在せず、
 * アカウント切替セレクタの変更を Rust に届ける経路としてこのハンドラを使う。
 * JS からは window.__mcxPopupBridge.postMessage(JSON文字列) で呼び出される
 * （type: "switchPopupSession" / "reportOfficialSettings" / "closePopup"）。
 *
 * addWebMessageListener のコールバックは UI スレッドから呼ばれる
 * （addJavascriptInterface の JavaBridge スレッドとは異なる）。
 */
class PopupSessionBridge(
  private val popupId: String,
  private val onSwitchSession: (popupId: String, accountId: String, url: String) -> Unit,
  private val onReportOfficialSettings: (accountId: String, snapshot: String) -> Unit,
  private val onClosePopup: (popupId: String) -> Unit,
) {
  fun handle(message: BridgeMessage) {
    when (message) {
      is BridgeMessage.SwitchPopupSession ->
        onSwitchSession(popupId, message.accountId, message.url)
      is BridgeMessage.ReportOfficialSettings ->
        onReportOfficialSettings(message.accountId, message.snapshot)
      BridgeMessage.ClosePopup -> onClosePopup(popupId)
      else -> Unit
    }
  }
}