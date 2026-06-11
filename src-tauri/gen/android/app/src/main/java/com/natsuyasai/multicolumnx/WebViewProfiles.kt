package com.natsuyasai.multicolumnx

import android.util.Log
import android.webkit.WebView
import androidx.webkit.Profile
import androidx.webkit.ProfileStore
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import java.io.File

/** アカウント ID から WebView Profile / Cookie 保存ディレクトリ共通のプロファイル名を生成する。 */
fun getCookieProfileName(accountId: String): String = "account-$accountId"

/** "k=v; k2=v2" 形式の Cookie 文字列を空白・空要素を除いた個別 Cookie のリストに分解する。 */
fun parseCookieString(cookieString: String): List<String> =
  cookieString
    .split(";")
    .map { it.trim() }
    .filter { it.isNotEmpty() }

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
   * プロファイル初回作成時は空セッションのため、filesDir 配下に AddAccount ログイン時の
   * Cookie スナップショット（x_cookies.txt）があればプロファイルへ移行する。
   *
   * @return 適用に成功したら true。失敗時は警告ログを残して false を返す。
   */
  fun apply(
    webView: WebView,
    accountId: String,
    contextName: String,
    filesDir: File? = null,
  ): Boolean =
    try {
      val profileName = getCookieProfileName(accountId)
      val store = ProfileStore.getInstance()
      // getOrCreateProfile より前に存在判定し、初回作成時のみ Cookie を移行する（冪等）。
      val isNewProfile = !store.allProfileNames.contains(profileName)
      val profile = store.getOrCreateProfile(profileName)
      WebViewCompat.setProfile(webView, profileName)
      profile.cookieManager.setAcceptThirdPartyCookies(webView, true)
      if (isNewProfile && filesDir != null) {
        migrateLegacyCookies(profile, accountId, filesDir)
      }
      true
    } catch (e: Exception) {
      Log.w(TAG, "Profile API unavailable for $contextName: ${e.message}")
      false
    }

  // AddAccount ログイン時に保存した Cookie スナップショットを新規プロファイルの
  // CookieManager へ流し込む。auth_token は長寿命のため概ねセッションを引き継げる。
  // 移行に失敗してもログイン画面から再ログインすれば回復するため、例外は警告に留める。
  private fun migrateLegacyCookies(
    profile: Profile,
    accountId: String,
    filesDir: File,
  ) {
    try {
      val cookieFile = File(filesDir, "accounts/${getCookieProfileName(accountId)}/x_cookies.txt")
      if (!cookieFile.exists()) return
      val cookies = parseCookieString(cookieFile.readText())
      if (cookies.isEmpty()) return

      val cookieManager = profile.cookieManager
      for (cookie in cookies) {
        cookieManager.setCookie("https://x.com", cookie)
        cookieManager.setCookie("https://twitter.com", cookie)
      }
      cookieManager.flush()
      Log.i(TAG, "migrateLegacyCookies: migrated ${cookies.size} cookies for $accountId")
    } catch (e: Exception) {
      Log.w(TAG, "migrateLegacyCookies: failed for $accountId: ${e.message}")
    }
  }
}