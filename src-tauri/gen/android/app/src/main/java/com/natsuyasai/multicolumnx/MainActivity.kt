package com.natsuyasai.multicolumnx

import android.content.Intent
import android.os.Bundle
import android.util.Log
import android.view.View
import android.webkit.CookieManager
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.ProfileStore
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class MainActivity : TauriActivity() {
  private val columnWebViews = ConcurrentHashMap<String, WebView>()

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    AppBridge.initContext(this)

    val density = resources.displayMetrics.density

    ViewCompat.setOnApplyWindowInsetsListener(window.decorView) { v, insets ->
      val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
      val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())

      // decorView に padding を設定し、メイン WebView をシステムバー領域から除外する
      // （Android 15+ のエッジツーエッジ強制への対応）
      v.setPadding(
        systemBars.left,
        systemBars.top,
        systemBars.right,
        maxOf(systemBars.bottom, ime.bottom)
      )

      // カラム WebView の CSS 処理（オーバーレイ・タブバー位置）のために
      // Rust 側にも dp 値を通知する
      val topDp = (systemBars.top / density + 0.5f).toInt()
      val bottomDp = (systemBars.bottom / density + 0.5f).toInt()
      Log.d(TAG, "insets top=${systemBars.top}px -> ${topDp}dp  bottom=${systemBars.bottom}px -> ${bottomDp}dp")
      AppBridge.onInsets(topDp, bottomDp)

      insets
    }
    ViewCompat.requestApplyInsets(window.decorView)
  }

  // AddAccount Activity を account_id を Intent Extra として渡して起動する。
  // AddAccount は "account-{accountId}" WebView Profile を使って独立したセッションでログインする。
  fun launchAddAccount(accountId: String) {
    val intent = Intent(this, AddAccount::class.java)
    intent.putExtra("accountId", accountId)
    startActivity(intent)
  }

  // カラム WebView を content FrameLayout のオーバーレイとして追加する。
  // メイン React WebView の上に重なり、タブバー分の高さを残す。
  // Profile API 対応端末はプロファイルで分離。非対応端末は loadUrl 前に Cookie を設定する。
  fun createColumnWebView(
    id: String,
    url: String,
    widthDp: Int,
    heightDp: Int,
    initScript: String,
    visible: Boolean,
    accountId: String
  ) {
    val latch = CountDownLatch(1)
    runOnUiThread {
      try {
        val profileApiSupported = try {
          WebViewFeature.isFeatureSupported("PROFILE_URLS_AND_COOKIE_MANAGER")
        } catch (e: Exception) { false }

        // Profile API 非対応端末では loadUrl 前に Cookie を設定してアカウントを確定する。
        // createColumnWebView は直列 await で呼ばれるため Cookie の設定が干渉しない。
        if (!profileApiSupported && accountId.isNotEmpty()) {
          setCookieForAccount(accountId)
        }

        val webView = WebView(this).also { wv ->
          wv.settings.javaScriptEnabled = true
          wv.settings.domStorageEnabled = true
          wv.webViewClient = WebViewClient()
          if (profileApiSupported) {
            try {
              ProfileStore.getInstance().getOrCreateProfile("account-$accountId")
              WebViewCompat.setProfile(wv, "account-$accountId")
            } catch (e: Exception) {
              Log.w(TAG, "Profile API unavailable for column $id: ${e.message}")
            }
          }
          if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(wv, initScript, setOf("*"))
          }
          wv.visibility = if (visible) View.VISIBLE else View.GONE
        }

        val density = resources.displayMetrics.density
        val params = FrameLayout.LayoutParams(
          (widthDp * density).toInt(),
          (heightDp * density).toInt()
        )

        val contentRoot = window.decorView.findViewById<FrameLayout>(android.R.id.content)
        contentRoot.addView(webView, params)
        columnWebViews[id] = webView

        webView.loadUrl(url)
      } finally {
        latch.countDown()
      }
    }
    latch.await(5, TimeUnit.SECONDS)
  }

  // カラム WebView を削除する。
  fun removeColumnWebView(id: String) {
    val latch = CountDownLatch(1)
    runOnUiThread {
      try {
        columnWebViews[id]?.let { wv ->
          val contentRoot = window.decorView.findViewById<FrameLayout>(android.R.id.content)
          contentRoot.removeView(wv)
          wv.destroy()
          columnWebViews.remove(id)
        }
      } finally {
        latch.countDown()
      }
    }
    latch.await(5, TimeUnit.SECONDS)
  }

  // カラム WebView を表示し、サイズを更新する（常に左上原点に配置）。
  fun showColumnWebView(id: String, widthDp: Int, heightDp: Int) {
    runOnUiThread {
      columnWebViews[id]?.let { wv ->
        val density = resources.displayMetrics.density
        (wv.layoutParams as? FrameLayout.LayoutParams)?.let { params ->
          params.width = (widthDp * density).toInt()
          params.height = (heightDp * density).toInt()
          params.leftMargin = 0
          params.topMargin = 0
          wv.layoutParams = params
        }
        wv.visibility = View.VISIBLE
        wv.requestLayout()
      }
    }
  }

  // カラム WebView を非表示にする（View.GONE でレイアウトから除外）。
  fun hideColumnWebView(id: String) {
    runOnUiThread {
      columnWebViews[id]?.visibility = View.GONE
    }
  }

  // カラム WebView で JavaScript を評価する。
  fun evalInColumnWebView(id: String, script: String) {
    runOnUiThread {
      columnWebViews[id]?.evaluateJavascript(script, null)
    }
  }

  // 保存済みの Cookie をアカウントのデータディレクトリから読み込み CookieManager に設定する。
  // Profile API が使えない環境での複数アカウント切り替えに使う。
  private fun setCookieForAccount(accountId: String) {
    val cookieFile = File(filesDir, "accounts/account-$accountId/x_cookies.txt")
    if (!cookieFile.exists()) {
      Log.w(TAG, "setCookieForAccount: cookie file not found for $accountId")
      return
    }

    val cookieString = cookieFile.readText()
    if (cookieString.isEmpty()) return

    val cookieManager = CookieManager.getInstance()
    cookieManager.removeAllCookies(null)
    cookieManager.flush()

    for (cookie in cookieString.split(";")) {
      val trimmed = cookie.trim()
      if (trimmed.isNotEmpty()) {
        cookieManager.setCookie("https://x.com", trimmed)
        cookieManager.setCookie("https://twitter.com", trimmed)
      }
    }
    cookieManager.flush()
    Log.d(TAG, "setCookieForAccount: set cookies for $accountId")
  }

  companion object {
    private const val TAG = "MainActivity"
  }
}
