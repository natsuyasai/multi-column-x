package com.natsuyasai.multicolumnx

import android.util.Log
import android.webkit.WebView
import androidx.webkit.ProfileStore
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature

/** WebView Profile API（アカウントごとのセッション分離）のサポート判定と適用。 */
object WebViewProfiles {
  private const val TAG = "WebViewProfiles"
  private const val FEATURE = "PROFILE_URLS_AND_COOKIE_MANAGER"

  val isSupported: Boolean
    get() =
      try {
        WebViewFeature.isFeatureSupported(FEATURE)
      } catch (e: Exception) {
        false
      }

  /**
   * account-{accountId} プロファイルを作成して webView に適用する。
   *
   * @return 適用に成功したら true。失敗時は警告ログを残して false を返す。
   */
  fun apply(
    webView: WebView,
    accountId: String,
    contextName: String,
  ): Boolean =
    try {
      ProfileStore.getInstance().getOrCreateProfile("account-$accountId")
      WebViewCompat.setProfile(webView, "account-$accountId")
      true
    } catch (e: Exception) {
      Log.w(TAG, "Profile API unavailable for $contextName: ${e.message}")
      false
    }
}