package com.natsuyasai.multicolumnx

import android.webkit.JavascriptInterface

/**
 * ポップアップ WebView 内の JS（popup_toolbar）へ addJavascriptInterface で公開するブリッジ。
 *
 * Android のポップアップはネイティブ WebView のため Tauri IPC（window.__TAURI__）が存在せず、
 * アカウント切替セレクタの変更を Rust に届ける経路としてこのブリッジを使う。
 * JS からは window.__mcxPopupBridge.switchPopupSession(accountId, url) で呼び出される。
 * また、公式設定スナップショットの配布は window.__mcxPopupBridge.reportOfficialSettings(accountId, snapshot)
 * で呼び出される。
 * ポップアップを閉じる明示操作（例: 公式設定ページのツールバー終了ボタン）は
 * window.__mcxPopupBridge.closePopup() で呼び出される。
 *
 * メソッドは WebView の JavaBridge スレッドから呼ばれるため、コールバック先で
 * UI 操作を行う場合は呼び出し側でスレッドを切り替えること。
 */
class PopupSessionBridge(
  private val popupId: String,
  private val onSwitchSession: (popupId: String, accountId: String, url: String) -> Unit,
  private val onReportOfficialSettings: (accountId: String, snapshot: String) -> Unit,
  private val onClosePopup: (popupId: String) -> Unit,
) {
  @JavascriptInterface
  fun switchPopupSession(
    accountId: String,
    url: String,
  ) {
    if (accountId.isEmpty() || url.isEmpty()) return
    onSwitchSession(popupId, accountId, url)
  }

  @JavascriptInterface
  fun reportOfficialSettings(
    accountId: String,
    snapshot: String,
  ) {
    if (accountId.isEmpty() || snapshot.isEmpty()) return
    onReportOfficialSettings(accountId, snapshot)
  }

  @JavascriptInterface
  fun closePopup() {
    onClosePopup(popupId)
  }
}