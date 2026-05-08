package com.natsuyasai.multicolumnx

import android.annotation.SuppressLint
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.webkit.CookieManager
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import java.io.File

class AddAccount : AppCompatActivity() {
    private val handler = Handler(Looper.getMainLooper())
    private var polling = false
    private var finished = false
    private var webViewRef: WebView? = null
    private var pollCount = 0
    private var accountId = "unknown"

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        accountId = intent.getStringExtra("accountId") ?: "unknown"
        Log.d(TAG, "onCreate: accountId=$accountId dataDir=${dataDir.absolutePath}")

        val wv = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.databaseEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            webViewClient = WebViewClient()

            // アカウントごとに独立した WebView Profile を割り当て、セッションを分離する。
            // Profile API 非対応の場合は Cookie をクリアして新鮮なセッションで開始する。
            val profileSet = try {
                WebViewFeature.isFeatureSupported("PROFILE_URLS_AND_COOKIE_MANAGER") &&
                    run { WebViewCompat.setProfile(this, "account-$accountId"); true }
            } catch (e: Exception) {
                Log.w(TAG, "Profile API unavailable: ${e.message}")
                false
            }
            if (!profileSet) {
                CookieManager.getInstance().removeAllCookies(null)
                CookieManager.getInstance().flush()
            }

            loadUrl("https://x.com/login")
        }
        webViewRef = wv
        setContentView(wv)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                Log.d(TAG, "onBackPressed: cancel")
                finishWithResult(success = false)
            }
        })
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

            val wv = webViewRef ?: run {
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
                    handler.post { finishWithResult(success = true) }
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
