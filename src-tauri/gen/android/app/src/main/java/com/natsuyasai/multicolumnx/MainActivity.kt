package com.natsuyasai.multicolumnx

import android.content.Intent
import android.os.Bundle
import android.util.Log
import android.view.MotionEvent
import android.view.VelocityTracker
import android.view.View
import android.webkit.CookieManager
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.OnBackPressedCallback
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
  // ポップアップ WebView スタック（表示順に積む）。UI スレッドからのみ操作する。
  private val popupWebViews = ArrayDeque<Pair<String, WebView>>()

  // 「↓ → 左右」L字ジェスチャーの状態マシン
  private enum class LGesturePhase { IDLE, DOWN, HORIZONTAL, CANCELLED }
  private var lGesturePhase = LGesturePhase.IDLE
  private var lGestureStartX = 0f
  private var lGestureStartY = 0f
  private var lGesturePivotX = 0f  // 下方向移動の最も低い点のX
  private var lGesturePivotY = 0f  // 下方向移動の最も低い点のY
  private var lGestureDirection: String? = null
  private var lVelocityTracker: VelocityTracker? = null

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

  }

  // 「↓ → 左右」L字ジェスチャーでカラムを切り替える。
  // ↓: 縦方向に MIN_DOWN_DP 以上移動してから、横方向に MIN_HORIZ_DP 以上移動すると発動。
  // コンテンツ内の横スワイプ（画像カルーセル等）や縦スクロールとは区別される。
  override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
    val density = resources.displayMetrics.density
    val MIN_DOWN_PX = 40f * density
    val MIN_HORIZ_PX = 40f * density
    val MIN_VELOCITY_PX = 300f

    lVelocityTracker?.addMovement(ev)

    when (ev.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        lVelocityTracker?.recycle()
        lVelocityTracker = VelocityTracker.obtain()
        lVelocityTracker?.addMovement(ev)
        lGesturePhase = LGesturePhase.IDLE
        lGestureStartX = ev.x
        lGestureStartY = ev.y
        lGesturePivotX = ev.x
        lGesturePivotY = ev.y
        lGestureDirection = null
      }
      MotionEvent.ACTION_MOVE -> {
        if (popupWebViews.isNotEmpty()) {
          lGesturePhase = LGesturePhase.CANCELLED
        } else when (lGesturePhase) {
          LGesturePhase.IDLE -> {
            val dx = ev.x - lGestureStartX
            val dy = ev.y - lGestureStartY
            when {
              // 下方向に十分移動したら DOWN フェーズへ
              dy > MIN_DOWN_PX && dy > Math.abs(dx) * 1.2f -> {
                lGesturePhase = LGesturePhase.DOWN
                lGesturePivotX = ev.x
                lGesturePivotY = ev.y
              }
              // 最初から横方向に動いたらキャンセル（コンテンツスワイプ）
              Math.abs(dx) > MIN_HORIZ_PX * 0.4f && Math.abs(dx) > dy * 2f -> {
                lGesturePhase = LGesturePhase.CANCELLED
              }
            }
          }
          LGesturePhase.DOWN -> {
            // ピボット（最下点）を更新
            if (ev.y > lGesturePivotY) {
              lGesturePivotX = ev.x
              lGesturePivotY = ev.y
            }
            val dxFromPivot = ev.x - lGesturePivotX
            val dyFromPivot = ev.y - lGesturePivotY
            // ピボットから横方向に十分移動したら HORIZONTAL フェーズへ
            if (Math.abs(dxFromPivot) > MIN_HORIZ_PX && Math.abs(dxFromPivot) > Math.abs(dyFromPivot)) {
              lGesturePhase = LGesturePhase.HORIZONTAL
              val dir = if (dxFromPivot < 0) "left" else "right"
              lGestureDirection = dir
              Log.d(TAG, "L-gesture: progress dir=$dir")
              AppBridge.onSwipeProgress(dir)
            }
          }
          LGesturePhase.HORIZONTAL -> {
            val dxFromPivot = ev.x - lGesturePivotX
            val dir = if (dxFromPivot < 0) "left" else "right"
            if (dir != lGestureDirection) {
              lGestureDirection = dir
              AppBridge.onSwipeProgress(dir)
            }
          }
          LGesturePhase.CANCELLED -> {}
        }
      }
      MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
        if (lGesturePhase == LGesturePhase.HORIZONTAL) {
          lVelocityTracker?.computeCurrentVelocity(1000)
          val vx = lVelocityTracker?.xVelocity ?: 0f
          if (Math.abs(vx) >= MIN_VELOCITY_PX) {
            val dir = if (vx < 0) "left" else "right"
            Log.d(TAG, "L-gesture: navigate dir=$dir vx=$vx")
            AppBridge.onSwipeNavigate(dir)
          } else {
            AppBridge.onSwipeCancel()
          }
        } else if (lGesturePhase == LGesturePhase.DOWN && lGestureDirection != null) {
          AppBridge.onSwipeCancel()
        }
        lVelocityTracker?.recycle()
        lVelocityTracker = null
        lGesturePhase = LGesturePhase.IDLE
        lGestureDirection = null
      }
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
