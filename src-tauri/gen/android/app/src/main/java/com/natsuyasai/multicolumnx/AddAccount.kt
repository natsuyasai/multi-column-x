package com.natsuyasai.multicolumnx

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Bitmap
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.webkit.CookieManager
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.Profile
import java.io.File
import java.util.UUID

class AddAccount : AppCompatActivity() {
  private val handler = Handler(Looper.getMainLooper())
  private var polling = false
  private var finished = false
  private var webViewRef: WebView? = null
  private var pollCount = 0
  private var accountId = "unknown"
  private var mode = "add"
  private var expectedUserId: String? = null
  private var reauthProfile: Profile? = null
  private var reauthTempProfileName: String? = null

  // ページ遷移中フラグ（shouldOverrideUrlLoading / onPageStarted で true、onPageFinished で false）
  private var isPageLoading = false

  // バック操作のデバウンス用。ナビゲーションが開始されたらキャンセルする。
  private var pendingClose: Runnable? = null

  @SuppressLint("SetJavaScriptEnabled")
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    accountId = intent.getStringExtra("accountId") ?: "unknown"
    mode = intent.getStringExtra("mode") ?: "add"
    expectedUserId = intent.getStringExtra("expectedUserId")
    Log.d(TAG, "onCreate: accountId=$accountId mode=$mode dataDir=${dataDir.absolutePath}")

    val wv =
      WebView(this).apply {
        // アカウントごとに独立した WebView Profile を割り当て、セッションを分離する。
        // setProfile は「WebView 使用前」に呼ぶ制約があるため、settings 変更や
        // Cookie 操作より先に WebView 生成直後の最初の操作として適用する。
        // reauth モードでは対象アカウントのライブプロファイルを再利用せず、まっさらな
        // 一時プロファイルで新規ログインさせる（成功時に commitReauthCookies で転記）。
        val profileSet =
          if (WebViewProfiles.isSupported) {
            if (mode == "reauth") {
              val tempName = reauthTempProfileId(UUID.randomUUID().toString())
              reauthTempProfileName = tempName
              reauthProfile = WebViewProfiles.applyNamed(this, tempName, "reauth")
              reauthProfile != null
            } else {
              WebViewProfiles.apply(this, accountId, "add-account", filesDir)
            }
          } else {
            false
          }
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.mediaPlaybackRequiresUserGesture = false
        if (!profileSet) {
          // Profile API 非対応の場合は共有 CookieManager をクリアして新鮮なセッションで開始する。
          // プロファイル適用時は WebViewProfiles.apply がプロファイルの CookieManager に
          // サードパーティ Cookie 許可を設定済み。
          CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
          CookieManager.getInstance().removeAllCookies(null)
          CookieManager.getInstance().flush()
        }
        webViewClient =
          object : WebViewClient() {
            override fun onPageStarted(
              view: WebView,
              url: String,
              favicon: Bitmap?,
            ) {
              super.onPageStarted(view, url, favicon)
              isPageLoading = true
            }

            override fun onPageFinished(
              view: WebView,
              url: String,
            ) {
              super.onPageFinished(view, url)
              isPageLoading = false
            }
          }

        loadUrl("https://x.com/login")
      }
    webViewRef = wv
    setContentView(wv)

    onBackPressedDispatcher.addCallback(
      this,
      object : OnBackPressedCallback(true) {
        override fun handleOnBackPressed() {
          // ページ遷移中は IME 降下など Android 14+ システム起因のバックイベントが
          // 誤発火することがあるため無視する
          if (isPageLoading) {
            Log.d(TAG, "onBackPressed: ignored during page load")
            return
          }
          val wv = webViewRef
          if (wv != null && wv.canGoBack()) {
            // ログイン途中ページ（パスワード入力など）の場合は WebView 内を戻る
            wv.goBack()
          } else {
            Log.d(TAG, "onBackPressed: cancel")
            if (mode == "reauth") {
              finishReauthWithSentinel("reauth_cancelled")
            } else {
              finishWithResult(success = false)
            }
          }
        }
      },
    )
  }

  override fun onResume() {
    super.onResume()
    Log.d(TAG, "onResume: finished=$finished")
    if (!finished) {
      polling = true
      pollCount = 0
      handler.removeCallbacksAndMessages(null)
      schedulePoll()
    }
  }

  override fun onPause() {
    super.onPause()
    Log.d(TAG, "onPause")
    polling = false
    handler.removeCallbacksAndMessages(null)
  }

  private fun finishWithResult(success: Boolean) {
    if (finished) return
    finished = true
    polling = false
    handler.removeCallbacksAndMessages(null)

    if (success) {
      saveCookies()
    }

    val fileName = if (success) "add_account_login_complete" else "add_account_login_cancelled"
    // dataDir = /data/user/0/<package> — Rust の app_data_dir() と一致する
    val sentinelFile = File(dataDir, fileName)
    try {
      sentinelFile.writeText("")
      Log.d(TAG, "finishWithResult: wrote sentinel ${sentinelFile.absolutePath}")
    } catch (e: Exception) {
      Log.e(TAG, "finishWithResult: failed to write sentinel: $e")
    }

    Log.d(TAG, "finishWithResult: starting MainActivity, success=$success")
    startActivity(Intent(this, MainActivity::class.java))
    finish()
  }

  // 再認証モードの完了処理。一時プロファイルの Cookie から X の識別子（xUserId）を取得し、
  // 既存アカウントと同一かどうかを検証したうえで結果別のセンチネルを書く。
  // - xUserId が取得できない場合は検証不能のため転記せず mismatch 扱い。
  // - expectedUserId が指定されていて xUserId と一致しない場合も転記せず mismatch 扱い。
  // - それ以外（一致、または expectedUserId 未指定＝初回）は対象プロファイルへ Cookie を転記して complete。
  private fun finishReauth() {
    if (finished) return

    val cm = reauthProfile?.cookieManager ?: CookieManager.getInstance()
    val cookieString = cm.getCookie("https://x.com") ?: ""
    val xUserId = twidUserIdFromCookieString(cookieString)

    when (reauthSentinelName(xUserId, expectedUserId)) {
      "reauth_complete" -> {
        Log.d(TAG, "finishReauth: xUserId=$xUserId matches (or no expectedUserId), committing cookies")
        commitReauthCookies(cookieString)
        finishReauthWithSentinel("reauth_complete", xUserId ?: "")
      }
      else -> {
        Log.w(TAG, "finishReauth: mismatch (expected=$expectedUserId, actual=$xUserId)")
        finishReauthWithSentinel("reauth_mismatch")
      }
    }
  }

  // 一時プロファイルから読んだ Cookie を対象アカウントのライブプロファイルへ転記する。
  // 併せて非対応端末フォールバック用のスナップショット（x_cookies.txt）も更新する。
  private fun commitReauthCookies(cookieString: String) {
    if (cookieString.isEmpty()) return
    try {
      val cookies = parseCookieString(cookieString)
      val targetName = getCookieProfileName(accountId)
      val cm =
        if (WebViewProfiles.isSupported) {
          WebViewProfiles.getProfileByName(targetName)?.cookieManager
            ?: CookieManager.getInstance()
        } else {
          CookieManager.getInstance()
        }
      // 古い Cookie をクリアしてから新しい Cookie を注入する（removeAllCookies は非同期のため
      // 完了コールバック内で設定する）。
      cm.removeAllCookies {
        for (cookie in cookies) {
          cm.setCookie("https://x.com", cookie)
          cm.setCookie("https://twitter.com", cookie)
        }
        cm.flush()
      }
    } catch (e: Exception) {
      Log.w(TAG, "commitReauthCookies: failed to transfer cookies: ${e.message}")
    }

    // 非対応端末フォールバック用スナップショット（accounts/account-{accountId}/x_cookies.txt）も更新する。
    try {
      val accountDataDir = File(filesDir, "accounts/account-$accountId")
      if (!accountDataDir.exists()) accountDataDir.mkdirs()
      File(accountDataDir, "x_cookies.txt").writeText(cookieString)
    } catch (e: Exception) {
      Log.w(TAG, "commitReauthCookies: failed to write snapshot: ${e.message}")
    }
  }

  // 再認証結果のセンチネルファイルを書き、MainActivity へ戻る共通処理。
  // finishWithResult と同様の finished ガード・後処理を行う。
  private fun finishReauthWithSentinel(
    fileName: String,
    body: String = "",
  ) {
    if (finished) return
    finished = true
    polling = false
    handler.removeCallbacksAndMessages(null)

    val sentinelFile = File(dataDir, fileName)
    try {
      sentinelFile.writeText(body)
      Log.d(TAG, "finishReauthWithSentinel: wrote sentinel ${sentinelFile.absolutePath}")
    } catch (e: Exception) {
      Log.e(TAG, "finishReauthWithSentinel: failed to write sentinel: $e")
    }

    // 一時プロファイルの後始末（best-effort）。使用中などで失敗しても許容する。
    reauthTempProfileName?.let {
      try {
        WebViewProfiles.deleteProfile(it)
      } catch (e: Exception) {
        Log.w(TAG, "finishReauthWithSentinel: temp profile cleanup failed: ${e.message}")
      }
    }

    Log.d(TAG, "finishReauthWithSentinel: starting MainActivity, fileName=$fileName")
    startActivity(Intent(this, MainActivity::class.java))
    finish()
  }

  // ログイン成功後の x.com Cookie をアカウントのデータディレクトリに保存する。
  // MainActivity.setCookieForAccount でカラム表示時に復元する。
  private fun saveCookies() {
    val cookieString = CookieManager.getInstance().getCookie("https://x.com") ?: return
    if (cookieString.isEmpty()) return

    val accountDataDir = File(filesDir, "accounts/account-$accountId")
    if (!accountDataDir.exists()) accountDataDir.mkdirs()

    val cookieFile = File(accountDataDir, "x_cookies.txt")
    try {
      cookieFile.writeText(cookieString)
      Log.d(TAG, "saveCookies: saved ${cookieString.length} chars for account $accountId")
    } catch (e: Exception) {
      Log.e(TAG, "saveCookies: failed: $e")
    }
  }

  private fun schedulePoll() {
    handler.postDelayed({
      if (!polling) return@postDelayed
      pollCount++

      val wv =
        webViewRef ?: run {
          if (pollCount % 10 == 0) Log.d(TAG, "schedulePoll #$pollCount: webViewRef null")
          schedulePoll()
          return@postDelayed
        }

      wv.evaluateJavascript("(function(){return location.pathname;})()") { result ->
        if (!polling) return@evaluateJavascript
        val path = result?.removeSurrounding("\"")
        if (pollCount % 10 == 0) {
          Log.d(TAG, "schedulePoll #$pollCount: path=$path")
        }
        if (path == "/home") {
          Log.d(TAG, "schedulePoll: /home detected! finishing with success")
          handler.post {
            if (mode == "reauth") {
              finishReauth()
            } else {
              finishWithResult(success = true)
            }
          }
        } else {
          schedulePoll()
        }
      }
    }, 500)
  }

  companion object {
    private const val TAG = "AddAccount"
  }
}