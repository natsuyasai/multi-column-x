package com.natsuyasai.multicolumnx

import android.util.Log
import android.webkit.WebView
import androidx.webkit.ProfileStore
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature

/** アカウント ID から WebView Profile / Cookie 保存ディレクトリ共通のプロファイル名を生成する。 */
fun getCookieProfileName(accountId: String): String = "account-$accountId"

/** WebView Profile API（アカウントごとのセッション分離）のサポート判定と適用。 */
object WebViewProfiles {
  private const val TAG = "WebViewProfiles"

  // androidx.webkit に存在しない feature 文字列を渡すと isFeatureSupported が
  // RuntimeException を投げて常に false 判定になるため、必ず定数を参照する。
  internal val FEATURE = WebViewFeature.MULTI_PROFILE

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
   * setProfile は「WebView を使用する前」に呼ぶ必要があるため、呼び出し側は WebView 生成直後
   * （settings 変更や Cookie 操作の前）にこのメソッドを呼ぶこと。
   * サードパーティ Cookie 許可（api.x.com の 401 対策）はデフォルトの CookieManager ではなく
   * プロファイル自身の CookieManager に対して設定する。
   *
   * @return 適用に成功したら true。失敗時は警告ログを残して false を返す。
   */
  fun apply(
    webView: WebView,
    accountId: String,
    contextName: String,
  ): Boolean =
    try {
      val profileName = getCookieProfileName(accountId)
      val profile = ProfileStore.getInstance().getOrCreateProfile(profileName)
      WebViewCompat.setProfile(webView, profileName)
      profile.cookieManager.setAcceptThirdPartyCookies(webView, true)
      true
    } catch (e: Exception) {
      Log.w(TAG, "Profile API unavailable for $contextName: ${e.message}")
      false
    }
}