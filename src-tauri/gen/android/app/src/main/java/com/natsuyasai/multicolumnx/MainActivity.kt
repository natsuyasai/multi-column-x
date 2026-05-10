package com.natsuyasai.multicolumnx

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Message
import android.util.Log
import android.view.MotionEvent
import android.view.VelocityTracker
import android.view.View
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
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
  private val contentRoot: FrameLayout
    get() = window.decorView.findViewById(android.R.id.content)

  private val columnWebViews = ConcurrentHashMap<String, WebView>()
  // ポップアップ WebView スタック（表示順に積む）。UI スレッドからのみ操作する。
  private val popupWebViews = ArrayDeque<Pair<String, WebView>>()
  // 現在表示中のカラム WebView の ID（showColumnWebView 呼び出し時に更新）。
  // 戻るボタン時の canGoBack 判定に使う。UI スレッドからのみアクセスする。
  private var activeColumnWebViewId: String? = null

  // 「逆引き → 前進」ブーメランジェスチャーの状態マシン
  // 右カラムへ: 左引き → 右リリース、左カラムへ: 右引き → 左リリース
  private enum class LGesturePhase { IDLE, REVERSE, FORWARD, CANCELLED }
  private var lGesturePhase = LGesturePhase.IDLE
  private var lGestureStartX = 0f
  private var lGestureStartY = 0f
  private var lGestureExtremeX = 0f  // 逆方向移動の最端点X
  private var lGestureReverseDir: String? = null  // 最初の引き方向: "left" or "right"
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
        // 1. ポップアップが開いていれば最前面を閉じる
        if (closeTopPopupWebView()) return
        // 2. アクティブなカラム WebView が戻れる履歴を持っていれば戻る
        val activeWv = activeColumnWebViewId?.let { columnWebViews[it] }
        if (activeWv != null && activeWv.canGoBack()) {
          activeWv.goBack()
          return
        }
        // 3. それ以外はアプリをバックグラウンドへ（終了しない）
        moveTaskToBack(true)
      }
    })

  }

  // 「逆引き → 前進」ブーメランジェスチャーでカラムを切り替える。
  // 右カラムへ移動したい場合: 左に引いてから右へリリース（reverseDir="left" → navigate "left"）
  // 左カラムへ移動したい場合: 右に引いてから左へリリース（reverseDir="right" → navigate "right"）
  // 縦スクロールや単純な横スワイプとは区別される。
  override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
    val density = resources.displayMetrics.density
    val MIN_REVERSE_PX = 30f * density  // 逆引きの最小距離
    val MIN_FORWARD_PX = 30f * density  // 最端点からの最小前進距離
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
        lGestureExtremeX = ev.x
        lGestureReverseDir = null
      }
      MotionEvent.ACTION_MOVE -> {
        if (popupWebViews.isNotEmpty()) {
          lGesturePhase = LGesturePhase.CANCELLED
        } else when (lGesturePhase) {
          LGesturePhase.IDLE -> {
            val dx = ev.x - lGestureStartX
            val dy = ev.y - lGestureStartY
            when {
              // 水平方向に十分移動したら REVERSE フェーズへ
              Math.abs(dx) > MIN_REVERSE_PX && Math.abs(dx) > Math.abs(dy) * 1.5f -> {
                lGesturePhase = LGesturePhase.REVERSE
                lGestureReverseDir = if (dx < 0) "left" else "right"
                lGestureExtremeX = ev.x
              }
              // 最初から縦方向に動いたらキャンセル（スクロール）
              Math.abs(dy) > MIN_REVERSE_PX && Math.abs(dy) > Math.abs(dx) * 1.5f -> {
                lGesturePhase = LGesturePhase.CANCELLED
              }
            }
          }
          LGesturePhase.REVERSE -> {
            // 逆引き方向の最端点を更新
            when (lGestureReverseDir) {
              "left" -> if (ev.x < lGestureExtremeX) lGestureExtremeX = ev.x
              "right" -> if (ev.x > lGestureExtremeX) lGestureExtremeX = ev.x
            }
            // 最端点から逆方向（前進方向）へ MIN_FORWARD_PX 以上戻ったら FORWARD フェーズへ
            val dxFromExtreme = ev.x - lGestureExtremeX
            val enteredForward = when (lGestureReverseDir) {
              "left"  -> dxFromExtreme > MIN_FORWARD_PX   // 左引き後、右へ折り返した
              "right" -> dxFromExtreme < -MIN_FORWARD_PX  // 右引き後、左へ折り返した
              else -> false
            }
            if (enteredForward) {
              lGesturePhase = LGesturePhase.FORWARD
              val reverseDir = lGestureReverseDir ?: return super.dispatchTouchEvent(ev)
              val navDir = if (reverseDir == "left") "right" else "left"
              Log.d(TAG, "boomerang-gesture: progress navDir=$navDir")
              AppBridge.onSwipeProgress(navDir)
            }
          }
          LGesturePhase.FORWARD -> { /* 速度は ACTION_UP で判定 */ }
          LGesturePhase.CANCELLED -> {}
        }
      }
      MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
        if (lGesturePhase == LGesturePhase.FORWARD) {
          lVelocityTracker?.computeCurrentVelocity(1000)
          val vx = lVelocityTracker?.xVelocity ?: 0f
          val reverseDir = lGestureReverseDir
          // 前進方向（逆引きの逆）への速度が十分あれば切り替え
          val hasForwardVelocity = when (reverseDir) {
            "left"  -> vx > MIN_VELOCITY_PX   // 左引き → 右への速度
            "right" -> vx < -MIN_VELOCITY_PX  // 右引き → 左への速度
            else -> false
          }
          if (hasForwardVelocity && reverseDir != null) {
            val navDir = if (reverseDir == "left") "right" else "left"
            Log.d(TAG, "boomerang-gesture: navigate navDir=$navDir vx=$vx")
            AppBridge.onSwipeNavigate(navDir)
          } else {
            AppBridge.onSwipeCancel()
          }
        }
        // REVERSE フェーズで離した場合は progress 未発行のためキャンセル不要
        lVelocityTracker?.recycle()
        lVelocityTracker = null
        lGesturePhase = LGesturePhase.IDLE
        lGestureReverseDir = null
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
    runOnUiThreadSync {
      val profileApiSupported = try {
        WebViewFeature.isFeatureSupported("PROFILE_URLS_AND_COOKIE_MANAGER")
      } catch (e: Exception) { false }

      val webView = WebView(this).also { wv ->
        wv.settings.javaScriptEnabled = true
        wv.settings.domStorageEnabled = true
        wv.settings.setSupportMultipleWindows(true)
        wv.webViewClient = ExternalLinkWebViewClient()
        wv.webChromeClient = ExternalLinkWebChromeClient()
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
      val params = FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.MATCH_PARENT
      )
      contentRoot.addView(webView, params)
      popupWebViews.addLast(Pair(id, webView))
      webView.loadUrl(url)
    }
  }

  // 指定 id のポップアップ WebView を削除する。JNI スレッドから呼ばれる。
  fun removePopupWebView(id: String) {
    runOnUiThreadSync {
      val idx = popupWebViews.indexOfFirst { it.first == id }
      if (idx >= 0) {
        val wv = popupWebViews.removeAt(idx).second
        contentRoot.removeView(wv)
        wv.destroy()
      }
    }
  }

  // 最前面のポップアップ WebView を閉じる。UI スレッド（OnBackPressedCallback）から呼ばれる。
  // ポップアップがあれば閉じて true を返し、なければ false を返す。
  fun closeTopPopupWebView(): Boolean {
    if (popupWebViews.isEmpty()) return false
    val wv = popupWebViews.removeLast().second
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
    runOnUiThreadSync {
      // React WebView がリロードされても native WebView は残存するため、
      // 同一 id が既に存在する場合は再作成・再ロードをスキップする。
      // 位置・表示は後続の resize_column_webview（setActiveColumn）が確定させる。
      if (columnWebViews.containsKey(id)) {
        Log.d(TAG, "createColumnWebView: $id already exists, skipping reload")
        return@runOnUiThreadSync
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
        wv.settings.setSupportMultipleWindows(true)
        wv.webViewClient = ExternalLinkWebViewClient()
        wv.webChromeClient = ExternalLinkWebChromeClient()
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

      contentRoot.addView(webView, params)
      columnWebViews[id] = webView

      webView.loadUrl(url)
    }
  }

  // カラム WebView を削除する。
  fun removeColumnWebView(id: String) {
    runOnUiThreadSync {
      columnWebViews[id]?.let { wv ->
        contentRoot.removeView(wv)
        wv.destroy()
        columnWebViews.remove(id)
      }
    }
  }

  // カラム WebView を表示し、サイズを更新する（常に左上原点に配置）。
  // onResume() で JS タイマーを再開してから表示する。
  fun showColumnWebView(id: String, widthDp: Int, heightDp: Int) {
    runOnUiThread {
      activeColumnWebViewId = id
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

  // x.com / twitter.com のドメインに属する URL かどうかを判定する。
  // これらは WebView 内でそのまま表示し、外部 URL はシステムブラウザへ委譲する。
  private fun isInternalUrl(url: String): Boolean {
    return url.startsWith("https://x.com") ||
      url.startsWith("https://twitter.com") ||
      url.startsWith("http://localhost") ||
      url.startsWith("about:") ||
      url.startsWith("blob:")
  }

  // 指定 URL をシステムデフォルトブラウザで開く。
  private fun openUrlInBrowser(url: String) {
    try {
      val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
      startActivity(intent)
    } catch (e: Exception) {
      Log.w(TAG, "openUrlInBrowser: failed to open $url: ${e.message}")
    }
  }

  // カラム / ポップアップ WebView 用 WebViewClient。
  // x.com 内のナビゲーションはそのまま WebView に委ね、外部 URL はシステムブラウザへ転送する。
  private inner class ExternalLinkWebViewClient : WebViewClient() {
    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
      val url = request.url.toString()
      if (isInternalUrl(url)) return false
      openUrlInBrowser(url)
      return true
    }
  }

  // target="_blank" / window.open() によるリンク遷移を処理する WebChromeClient。
  // ユーザー操作起因の場合のみ対応し、x.com リンクは元 WebView 内でナビゲート、
  // 外部リンクはシステムブラウザへ転送する。
  private inner class ExternalLinkWebChromeClient : WebChromeClient() {
    override fun onCreateWindow(
      view: WebView, isDialog: Boolean, isUserGesture: Boolean, resultMsg: Message
    ): Boolean {
      if (!isUserGesture) return false
      // ヘルパー WebView を使って新しいウィンドウのリクエスト URL を取得する。
      val helper = WebView(this@MainActivity)
      helper.webViewClient = object : WebViewClient() {
        override fun shouldOverrideUrlLoading(
          helperView: WebView, request: WebResourceRequest
        ): Boolean {
          val url = request.url.toString()
          if (isInternalUrl(url)) {
            // x.com リンク: 元の WebView でそのまま遷移する
            view.loadUrl(url)
          } else {
            openUrlInBrowser(url)
          }
          return true
        }
      }
      val transport = resultMsg.obj as WebView.WebViewTransport
      transport.webView = helper
      resultMsg.sendToTarget()
      return true
    }
  }

  private fun runOnUiThreadSync(action: () -> Unit) {
    val latch = CountDownLatch(1)
    runOnUiThread {
      try {
        action()
      } finally {
        latch.countDown()
      }
    }
    latch.await(5, TimeUnit.SECONDS)
  }

  companion object {
    private const val TAG = "MainActivity"
  }
}
