package com.natsuyasai.multicolumnx

import android.content.Intent
import android.os.Bundle
import android.util.Log
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.View
import android.webkit.CookieManager
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.view.GestureDetectorCompat
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
  // ポップアップ WebView スタック（表示順に積む）。UI スレッドからのみ操作する。
  private val popupWebViews = ArrayDeque<Pair<String, WebView>>()
  private lateinit var swipeGestureDetector: GestureDetectorCompat
  private var activeSwipeDirection: String? = null
  private var flingDetected = false

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

    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        if (!closeTopPopupWebView()) {
          // ポップアップがない場合はアプリをバックグラウンドに送る（finish しない）
          moveTaskToBack(true)
        }
      }
    })

    // 画面上の水平スワイプでカラムを切り替えるジェスチャー検出器。
    // column WebView は native WebView のため window.__TAURI__ が使えず、
    // dispatchTouchEvent でネイティブレベルのタッチイベントを観察する。
    swipeGestureDetector = GestureDetectorCompat(this, object : GestureDetector.SimpleOnGestureListener() {
      private val MIN_VELOCITY = 800f
      private val MIN_DISTANCE_DP = 50f
      private val PROGRESS_MIN_DX_DP = 20f

      override fun onScroll(e1: MotionEvent?, e2: MotionEvent, distanceX: Float, distanceY: Float): Boolean {
        if (e1 == null || popupWebViews.isNotEmpty()) return false
        val dx = e2.x - e1.x
        val dy = e2.y - e1.y
        val minDxPx = PROGRESS_MIN_DX_DP * resources.displayMetrics.density
        if (Math.abs(dx) > Math.abs(dy) * 1.2f && Math.abs(dx) > minDxPx) {
          val dir = if (dx < 0) "left" else "right"
          if (dir != activeSwipeDirection) {
            activeSwipeDirection = dir
            AppBridge.onSwipeProgress(dir)
          }
        }
        return false
      }

      override fun onFling(e1: MotionEvent?, e2: MotionEvent, velocityX: Float, velocityY: Float): Boolean {
        if (e1 == null) return false
        if (popupWebViews.isNotEmpty()) return false
        if (Math.abs(velocityX) < MIN_VELOCITY) return false
        if (Math.abs(velocityY) >= Math.abs(velocityX)) return false

        val density = resources.displayMetrics.density
        val minDistancePx = MIN_DISTANCE_DP * density
        if (Math.abs(e2.x - e1.x) < minDistancePx) return false

        val direction = if (velocityX < 0) "left" else "right"
        Log.d(TAG, "swipe: direction=$direction vx=$velocityX e1x=${e1.x} e2x=${e2.x}")
        flingDetected = true
        AppBridge.onSwipeNavigate(direction)
        return true
      }
    })
  }

  override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
    if (ev.actionMasked == MotionEvent.ACTION_DOWN) {
      flingDetected = false
      activeSwipeDirection = null
    }
    swipeGestureDetector.onTouchEvent(ev)
    if (ev.actionMasked == MotionEvent.ACTION_UP || ev.actionMasked == MotionEvent.ACTION_CANCEL) {
      if (!flingDetected && activeSwipeDirection != null) {
        AppBridge.onSwipeCancel()
      }
      activeSwipeDirection = null
    }
    return super.dispatchTouchEvent(ev)
  }

  // AddAccount Activity を account_id を Intent Extra として渡して起動する。
  // AddAccount は "account-{accountId}" WebView Profile を使って独立したセッションでログインする。
  fun launchAddAccount(accountId: String) {
    val intent = Intent(this, AddAccount::class.java)
    intent.putExtra("accountId", accountId)
    startActivity(intent)
  }

  // ポップアップ WebView を全画面オーバーレイとして追加する。
  // カラム WebView の上に重なり、戻るボタンで閉じられる。
  // JNI スレッドから呼ばれるため runOnUiThread + CountDownLatch で UI 操作を同期する。
  // accountId が空でない場合はカラム WebView と同じプロファイルを使ってセッションを共有する。
  fun createPopupWebView(id: String, url: String, initScript: String, accountId: String) {
    val latch = CountDownLatch(1)
    runOnUiThread {
      try {
        val profileApiSupported = try {
          WebViewFeature.isFeatureSupported("PROFILE_URLS_AND_COOKIE_MANAGER")
        } catch (e: Exception) { false }

        val webView = WebView(this).also { wv ->
          wv.settings.javaScriptEnabled = true
          wv.settings.domStorageEnabled = true
          wv.webViewClient = WebViewClient()
          if (profileApiSupported && accountId.isNotEmpty()) {
            try {
              ProfileStore.getInstance().getOrCreateProfile("account-$accountId")
              WebViewCompat.setProfile(wv, "account-$accountId")
            } catch (e: Exception) {
              Log.w(TAG, "Profile API unavailable for popup $id: ${e.message}")
            }
          } else if (!profileApiSupported && accountId.isNotEmpty()) {
            setCookieForAccount(accountId)
          }
          if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(wv, initScript, setOf("*"))
          }
        }
        val contentRoot = window.decorView.findViewById<FrameLayout>(android.R.id.content)
        val params = FrameLayout.LayoutParams(
          FrameLayout.LayoutParams.MATCH_PARENT,
          FrameLayout.LayoutParams.MATCH_PARENT
        )
        contentRoot.addView(webView, params)
        popupWebViews.addLast(Pair(id, webView))
        webView.loadUrl(url)
      } finally {
        latch.countDown()
      }
    }
    latch.await(5, TimeUnit.SECONDS)
  }

  // 指定 id のポップアップ WebView を削除する。JNI スレッドから呼ばれる。
  fun removePopupWebView(id: String) {
    val latch = CountDownLatch(1)
    runOnUiThread {
      try {
        val idx = popupWebViews.indexOfFirst { it.first == id }
        if (idx >= 0) {
          val wv = popupWebViews.removeAt(idx).second
          val contentRoot = window.decorView.findViewById<FrameLayout>(android.R.id.content)
          contentRoot.removeView(wv)
          wv.destroy()
        }
      } finally {
        latch.countDown()
      }
    }
    latch.await(5, TimeUnit.SECONDS)
  }

  // 最前面のポップアップ WebView を閉じる。UI スレッド（OnBackPressedCallback）から呼ばれる。
  // ポップアップがあれば閉じて true を返し、なければ false を返す。
  fun closeTopPopupWebView(): Boolean {
    if (popupWebViews.isEmpty()) return false
    val wv = popupWebViews.removeLast().second
    val contentRoot = window.decorView.findViewById<FrameLayout>(android.R.id.content)
    contentRoot.removeView(wv)
    wv.destroy()
    return true
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
        // React WebView がリロードされても native WebView は残存するため、
        // 同一 id が既に存在する場合は再作成・再ロードをスキップする。
        // 位置・表示は後続の resize_column_webview（setActiveColumn）が確定させる。
        if (columnWebViews.containsKey(id)) {
          Log.d(TAG, "createColumnWebView: $id already exists, skipping reload")
          return@runOnUiThread
        }

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
  // onResume() で JS タイマーを再開してから表示する。
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
        wv.onResume()
        wv.visibility = View.VISIBLE
        wv.requestLayout()
      }
    }
  }

  // カラム WebView を非表示にする（View.GONE でレイアウトから除外）。
  // onPause() で JS タイマーを停止し、非表示中のバックグラウンド API コールを抑制する。
  fun hideColumnWebView(id: String) {
    runOnUiThread {
      columnWebViews[id]?.let { wv ->
        wv.onPause()
        wv.visibility = View.GONE
      }
    }
  }

  // カラム WebView で JavaScript を評価する。
  fun evalInColumnWebView(id: String, script: String) {
    runOnUiThread {
      columnWebViews[id]?.evaluateJavascript(script, null)
    }
  }

  // Profile API 非対応端末で、アクティブカラムのアカウントに CookieManager を切り替える。
  // showColumnWebView とは独立して呼び出せるため WebView の表示状態に影響しない。
  fun setAccountCookies(accountId: String) {
    val profileApiSupported = try {
      WebViewFeature.isFeatureSupported("PROFILE_URLS_AND_COOKIE_MANAGER")
    } catch (e: Exception) { false }
    if (profileApiSupported || accountId.isEmpty()) return
    setCookieForAccount(accountId)
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
