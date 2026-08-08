package com.natsuyasai.multicolumnx

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Message
import android.provider.Settings
import android.util.Log
import android.view.View
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap

class MainActivity : TauriActivity() {
  internal val contentRoot: FrameLayout
    get() = window.decorView.findViewById(android.R.id.content)

  private val columnWebViews = ConcurrentHashMap<String, WebView>()

  // ポップアップ WebView スタック（表示順に積む）。UI スレッドからのみ操作する。
  private val popupWebViews = ArrayDeque<Pair<String, WebView>>()

  // 常駐コンポーズ WebView（閉じる操作で destroy せず退避し、次回表示で再利用する）。
  // UI スレッドからのみ操作する。
  private var persistentComposeWebView: Pair<String, WebView>? = null

  // 現在表示中のカラム WebView の ID（showColumnWebView 呼び出し時に更新）。
  // 戻るボタン時の canGoBack 判定に使う。UI スレッドからのみアクセスする。
  private var activeColumnWebViewId: String? = null

  // saveDownloadedVideo で起動した SAF 保存ダイアログの結果を受け取るまでの間、
  // コピー元の一時ファイルパスと後処理（一時ファイル削除など）を保持する。
  // UI スレッドからのみアクセスする。
  private var pendingVideoSaveRequest: PendingVideoSaveRequest? = null

  private data class PendingVideoSaveRequest(
    val tempPath: String,
    // 保存の成否に関わらず行う後処理（一時ファイル削除など）
    val onDone: () -> Unit,
  )

  // SAF（Storage Access Framework）の「名前を付けて保存」ダイアログ。
  // ダウンロードした動画/音声の一時ファイルをユーザーが選んだ場所へコピーする。
  // registerForActivityResult は Activity 生成完了前（onCreate 前）に呼ぶ必要があるため
  // プロパティ初期化子で登録する。
  private val saveVideoLauncher: ActivityResultLauncher<String> =
    registerForActivityResult(ActivityResultContracts.CreateDocument("*/*")) { uri ->
      val request = pendingVideoSaveRequest
      pendingVideoSaveRequest = null
      if (request == null) return@registerForActivityResult
      try {
        // uri == null はユーザーがキャンセルした場合。エラー扱いにしない。
        if (uri != null) {
          contentResolver.openOutputStream(uri)?.use { output ->
            File(request.tempPath).inputStream().use { input -> input.copyTo(output) }
          } ?: Log.e(TAG, "saveDownloadedVideo: failed to open output stream for $uri")
        }
      } catch (e: Exception) {
        Log.e(TAG, "saveDownloadedVideo: failed to copy to $uri: ${e.message}")
      } finally {
        request.onDone()
      }
    }

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
        maxOf(systemBars.bottom, ime.bottom),
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

    onBackPressedDispatcher.addCallback(
      this,
      object : OnBackPressedCallback(true) {
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
      },
    )
  }

  // AddAccount Activity を account_id を Intent Extra として渡して起動する。
  // AddAccount は "account-{accountId}" WebView Profile を使って独立したセッションでログインする。
  // X アプリのツイート画面を Intent で起動する。
  // X アプリが入っていれば X アプリで開き、未インストール時はブラウザにフォールバックする。
  fun launchComposeTweet() {
    runOnUiThread {
      val composeUri = Uri.parse("https://x.com/intent/tweet")
      try {
        val intent =
          Intent(Intent.ACTION_VIEW, composeUri).apply {
            setPackage("com.twitter.android")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          }
        startActivity(intent)
      } catch (e: Exception) {
        try {
          startActivity(Intent(Intent.ACTION_VIEW, composeUri))
        } catch (ex: Exception) {
          Log.w(TAG, "launchComposeTweet: failed to open compose screen: ${ex.message}")
        }
      }
    }
  }

  fun launchAddAccount(accountId: String) {
    val intent = Intent(this, AddAccount::class.java)
    intent.putExtra("accountId", accountId)
    startActivity(intent)
  }

  // AddAccount Activity を再認証モードで起動する。expectedUserId が指定されている場合、
  // AddAccount 側でログイン後の xUserId と照合し、不一致なら Cookie を保存せず
  // reauth_mismatch センチネルを書く（アカウント誤認証によるなりすまし防止）。
  fun launchReauthAccount(
    accountId: String,
    expectedUserId: String?,
  ) {
    val intent = Intent(this, AddAccount::class.java)
    intent.putExtra("accountId", accountId)
    intent.putExtra("mode", "reauth")
    if (expectedUserId != null) intent.putExtra("expectedUserId", expectedUserId)
    startActivity(intent)
  }

  // GitHub Releases からダウンロードした APK でアプリを自己更新する。
  // 提供元不明アプリのインストール許可が無ければ設定画面へ誘導する。
  // ダウンロードはバックグラウンドスレッドで行い、完了後に UI スレッドでインストーラを起動する。
  fun downloadAndInstallApk(
    url: String,
    expectedSha256: String,
  ) {
    // Android 8.0+ は「提供元不明アプリのインストール」許可が必要。未許可なら設定へ誘導する。
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
      !packageManager.canRequestPackageInstalls()
    ) {
      runOnUiThread {
        try {
          startActivity(
            Intent(
              Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
              Uri.parse("package:$packageName"),
            ),
          )
        } catch (e: Exception) {
          Log.w(TAG, "downloadAndInstallApk: cannot open unknown sources settings: ${e.message}")
        }
      }
      return
    }
    Thread {
      try {
        val dir = File(getExternalFilesDir(null), "updates").apply { mkdirs() }
        val apk = File(dir, "update.apk")
        val conn = (URL(url).openConnection() as HttpURLConnection)
        conn.connectTimeout = 30000
        conn.readTimeout = 30000
        conn.instanceFollowRedirects = true
        conn.inputStream.use { input ->
          apk.outputStream().use { output -> input.copyTo(output) }
        }
        if (!ApkHashVerifier.verify(apk, expectedSha256)) {
          Log.e(TAG, "downloadAndInstallApk: sha256 mismatch, aborting install")
          apk.delete()
          return@Thread
        }
        val uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", apk)
        val intent =
          Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          }
        runOnUiThread { startActivity(intent) }
      } catch (e: Exception) {
        Log.e(TAG, "downloadAndInstallApk failed: ${e.message}")
      }
    }.start()
  }

  // Rust 側で HTTP ダウンロード済みの一時ファイル（tempPath）を、SAF の保存ダイアログで
  // ユーザーが選んだ場所へコピーする。動画ダウンロード機能（Android）で使う。
  // JNI スレッドから呼ばれるため、ActivityResultLauncher.launch は UI スレッドで実行する。
  // mimeType は CreateDocument("*/*") を使う現状は未使用だが、将来 MIME を絞り込む拡張に
  // 備えて JNI 呼び出しシグネチャとして受け取っておく。
  fun saveDownloadedVideo(
    tempPath: String,
    suggestedFileName: String,
    @Suppress("UNUSED_PARAMETER") mimeType: String,
  ) {
    runOnUiThread {
      if (!File(tempPath).exists()) {
        Log.e(TAG, "saveDownloadedVideo: temp file not found: $tempPath")
        return@runOnUiThread
      }
      pendingVideoSaveRequest =
        PendingVideoSaveRequest(tempPath) {
          File(tempPath).delete()
        }
      saveVideoLauncher.launch(suggestedFileName)
    }
  }

  // 動画ダウンロード（Android）の Foreground Service を起動する。
  // アプリがバックグラウンドに回ってもOSにプロセスをkillされにくくするため、
  // ダウンロード開始時に Rust 側から呼ぶ。
  fun notifyVideoDownloadStarted() {
    val intent =
      Intent(this, VideoDownloadForegroundService::class.java)
        .setAction(VideoDownloadForegroundService.ACTION_START)
    ContextCompat.startForegroundService(this, intent)
  }

  // 動画ダウンロードの進捗を通知に反映する。total が不明な場合は 0 以下を渡すこと
  // （VideoDownloadForegroundService 側で indeterminate 表示に切り替える）。
  fun notifyVideoDownloadProgress(
    fileIndex: Int,
    fileCount: Int,
    current: Long,
    total: Long,
  ) {
    val intent =
      Intent(this, VideoDownloadForegroundService::class.java)
        .setAction(VideoDownloadForegroundService.ACTION_UPDATE)
        .putExtra(VideoDownloadForegroundService.EXTRA_FILE_INDEX, fileIndex)
        .putExtra(VideoDownloadForegroundService.EXTRA_FILE_COUNT, fileCount)
        .putExtra(VideoDownloadForegroundService.EXTRA_CURRENT, current)
        .putExtra(VideoDownloadForegroundService.EXTRA_TOTAL, total)
    startService(intent)
  }

  // 動画ダウンロードの Foreground Service を終了する（成功/失敗いずれでも呼ぶ）。
  fun notifyVideoDownloadFinished() {
    val intent =
      Intent(this, VideoDownloadForegroundService::class.java)
        .setAction(VideoDownloadForegroundService.ACTION_FINISH)
    startService(intent)
  }

  // ポップアップ WebView を全画面オーバーレイとして追加する。
  // カラム WebView の上に重なり、戻るボタンで閉じられる。
  // JNI スレッドから呼ばれるため runOnUiThread + CountDownLatch で UI 操作を同期する。
  // accountId が空でない場合はカラム WebView と同じプロファイルを使ってセッションを共有する。
  fun createPopupWebView(
    id: String,
    url: String,
    initScript: String,
    accountId: String,
  ) {
    runOnUiThreadSync {
      val (webView, profileApplied) =
        newConfiguredWebView(initScript, accountId, "popup $id").also { (wv, _) ->
          wv.webViewClient = ExternalLinkWebViewClient(url)
          wv.webChromeClient = ExternalLinkWebChromeClient()
          // ネイティブ WebView には Tauri IPC が無いため、popup_toolbar の
          // アカウント切替を Rust へ届けるブリッジを公開する（loadUrl 前に設定が必要）。
          wv.addJavascriptInterface(
            PopupSessionBridge(id) { popupId, selectedAccountId, currentUrl ->
              AppBridge.onPopupSwitchSession(popupId, selectedAccountId, currentUrl)
            },
            POPUP_BRIDGE_JS_NAME,
          )
        }
      val params =
        FrameLayout.LayoutParams(
          FrameLayout.LayoutParams.MATCH_PARENT,
          FrameLayout.LayoutParams.MATCH_PARENT,
        )
      contentRoot.addView(webView, params)
      popupWebViews.addLast(Pair(id, webView))
      loadUrlForAccount(webView, url, accountId, profileApplied)
    }
  }

  // 指定 id のポップアップ WebView を削除する。JNI スレッドから呼ばれる。
  // スタックに無い場合、退避中の常駐コンポーズ（persistentComposeWebView）の id と
  // 一致すればそれを破棄する（アカウント切替の Replace で退避中の旧 compose を破棄するため）。
  fun removePopupWebView(id: String) {
    runOnUiThreadSync {
      val idx = popupWebViews.indexOfFirst { it.first == id }
      if (idx >= 0) {
        val wv = popupWebViews.removeAt(idx).second
        contentRoot.removeView(wv)
        wv.destroy()
        return@runOnUiThreadSync
      }
      persistentComposeWebView?.takeIf { it.first == id }?.let { pair ->
        contentRoot.removeView(pair.second)
        pair.second.destroy()
        persistentComposeWebView = null
      }
    }
  }

  // ポップアップ WebView を破棄せず非表示にして退避する（コンポーズ常駐用）。JNI スレッドから呼ばれる。
  fun hidePopupWebView(id: String) {
    runOnUiThreadSync { hidePopupWebViewInternal(id) }
  }

  // hidePopupWebView の内部実装。UI スレッドから直接呼ぶ場合（closeTopPopupWebView 経由）は
  // こちらを使い、runOnUiThreadSync の二重ラップを避ける。
  private fun hidePopupWebViewInternal(id: String) {
    val idx = popupWebViews.indexOfFirst { it.first == id }
    if (idx < 0) return
    val pair = popupWebViews.removeAt(idx)
    pair.second.onPause() // 非表示中の JS タイマー・API コールを抑制
    pair.second.visibility = View.GONE
    // 旧退避分が残っていれば destroy してから置き換える（リーク防止）
    persistentComposeWebView?.takeIf { it.first != pair.first }?.second?.let {
      contentRoot.removeView(it)
      it.destroy()
    }
    persistentComposeWebView = pair
  }

  // 最前面のポップアップ WebView を閉じる。UI スレッド（OnBackPressedCallback）から呼ばれる。
  // ポップアップがあれば閉じて true を返し、なければ false を返す。
  // 最上位が常駐コンポーズ（"compose-" プレフィックス）の場合は destroy せず非表示にして退避する。
  fun closeTopPopupWebView(): Boolean {
    if (popupWebViews.isEmpty()) return false
    val id = popupWebViews.last().first
    if (id.startsWith(COMPOSE_LABEL_PREFIX)) {
      hidePopupWebViewInternal(id)
      return true
    }
    val wv = popupWebViews.removeLast().second
    contentRoot.removeView(wv)
    wv.destroy()
    return true
  }

  // 退避中の常駐コンポーズ WebView を再表示する。表示中 URL がコンポーズページ以外なら URL へ遷移する。
  // JNI スレッドから呼ばれる。対象が無ければ false を返し、呼び出し側（Rust）が新規作成にフォールバックする。
  fun reshowPopupWebView(
    id: String,
    url: String,
  ): Boolean {
    var shown = false
    runOnUiThreadSync {
      val pair = persistentComposeWebView
      if (pair != null && pair.first == id) {
        persistentComposeWebView = null
        pair.second.onResume()
        pair.second.visibility = View.VISIBLE
        // 既にコンポーズページを表示中なら遷移せず再表示のみ（下書きもそのまま維持）
        if (!isComposePostUrl(pair.second.url)) {
          pair.second.loadUrl(url)
        }
        popupWebViews.addLast(pair)
        shown = true
      }
    }
    return shown
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
    accountId: String,
  ) {
    runOnUiThreadSync {
      // React WebView がリロードされても native WebView は残存するため、
      // 同一 id が既に存在する場合は再作成・再ロードをスキップする。
      // 位置・表示は後続の resize_column_webview（setActiveColumn）が確定させる。
      if (columnWebViews.containsKey(id)) {
        Log.d(TAG, "createColumnWebView: $id already exists, skipping reload")
        return@runOnUiThreadSync
      }

      val (webView, profileApplied) =
        newConfiguredWebView(initScript, accountId, "column $id").also { (wv, _) ->
          wv.webViewClient = ExternalLinkWebViewClient(url)
          wv.webChromeClient = ExternalLinkWebChromeClient()
          wv.visibility = if (visible) View.VISIBLE else View.GONE
          // ネイティブ WebView には Tauri IPC が無いため、動画長押しメニューの
          // ダウンロード要求を Rust へ届けるブリッジを公開する（loadUrl 前に設定が必要）。
          wv.addJavascriptInterface(
            VideoDownloadRequestBridge { payloadJson ->
              AppBridge.onVideoDownloadRequest(payloadJson)
            },
            VIDEO_DOWNLOAD_BRIDGE_JS_NAME,
          )
          // ネイティブ WebView には Tauri IPC が無いため、APIレート制限監視の
          // 報告を Rust へ届けるブリッジを公開する（loadUrl 前に設定が必要）。
          wv.addJavascriptInterface(
            ApiRateLimitBridge(id) { label, payloadJson ->
              AppBridge.onApiRateLimitReport(label, payloadJson)
            },
            API_RATE_LIMIT_BRIDGE_JS_NAME,
          )
        }

      val density = resources.displayMetrics.density
      val params =
        FrameLayout.LayoutParams(
          (widthDp * density).toInt(),
          (heightDp * density).toInt(),
        )

      contentRoot.addView(webView, params)
      columnWebViews[id] = webView

      loadUrlForAccount(webView, url, accountId, profileApplied)
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

  // カラム WebView を表示し、位置・サイズを更新する（xDp/yDp は CSS px = dp）。
  // onResume() で JS タイマーを再開してから表示する。
  fun showColumnWebView(
    id: String,
    xDp: Int,
    yDp: Int,
    widthDp: Int,
    heightDp: Int,
  ) {
    runOnUiThread {
      activeColumnWebViewId = id
      columnWebViews[id]?.let { wv ->
        val density = resources.displayMetrics.density
        (wv.layoutParams as? FrameLayout.LayoutParams)?.let { params ->
          params.width = (widthDp * density).toInt()
          params.height = (heightDp * density).toInt()
          params.leftMargin = (xDp * density).toInt()
          params.topMargin = (yDp * density).toInt()
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
  fun evalInColumnWebView(
    id: String,
    script: String,
  ) {
    runOnUiThread {
      columnWebViews[id]?.evaluateJavascript(script, null)
    }
  }

  // Profile API 非対応端末で、アクティブカラムのアカウントに CookieManager を切り替える。
  // showColumnWebView とは独立して呼び出せるため WebView の表示状態に影響しない。
  fun setAccountCookies(accountId: String) {
    if (WebViewProfiles.isSupported || accountId.isEmpty()) return
    setCookieForAccount(accountId)
  }

  // Profile API（アカウントごとのセッション分離）対応可否を返す。
  // Rust の is_webview_profile_supported コマンドから JNI 経由で呼ばれる。
  fun isWebViewProfileSupported(): Boolean = WebViewProfiles.isSupported

  // newConfiguredWebView の結果。loadUrl 時の Cookie フォールバック要否判定に
  // プロファイル適用結果が必要なため、WebView と合わせて返す。
  private data class ConfiguredWebView(
    val webView: WebView,
    val profileApplied: Boolean,
  )

  // カラム/ポップアップ共通の WebView 初期化。
  // webViewClient / webChromeClient は呼び出し側で用途別に設定する。
  // Profile API 対応端末はプロファイルで分離し、非対応端末は loadUrlForAccount が
  // loadUrl 前に Cookie を設定してアカウントを確定する。
  private fun newConfiguredWebView(
    initScript: String,
    accountId: String,
    contextName: String,
  ): ConfiguredWebView {
    val wv = WebView(this)
    // setProfile は「WebView 使用前」に呼ぶ制約があるため、settings 変更や
    // Cookie 操作より先に WebView 生成直後の最初の操作として適用する。
    val profileApplied =
      WebViewProfiles.isSupported &&
        accountId.isNotEmpty() &&
        WebViewProfiles.apply(wv, accountId, contextName, filesDir)
    wv.settings.javaScriptEnabled = true
    wv.settings.domStorageEnabled = true
    wv.settings.setSupportMultipleWindows(true)
    wv.settings.cacheMode = android.webkit.WebSettings.LOAD_CACHE_ELSE_NETWORK
    if (!profileApplied) {
      // api.x.com は x.com とは別ホストのため、サードパーティ Cookie 送信を許可する。
      // デフォルト false のままだと account/settings.json 等の v1.1 REST API が 401 になる。
      // プロファイル適用時は WebViewProfiles.apply がプロファイルの CookieManager に設定済み。
      CookieManager.getInstance().setAcceptThirdPartyCookies(wv, true)
    }
    if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
      WebViewCompat.addDocumentStartJavaScript(wv, initScript, setOf("*"))
    }
    return ConfiguredWebView(wv, profileApplied)
  }

  // アカウントのセッションを確定してから URL をロードする。
  // Cookie フォールバックが必要な場合は removeAllCookies の完了コールバック →
  // setCookie → loadUrl の順序を保証し、Cookie 未設定のままロードが始まる競合を防ぐ。
  private fun loadUrlForAccount(
    wv: WebView,
    url: String,
    accountId: String,
    profileApplied: Boolean,
  ) {
    if (needsCookieFallback(profileApplied, accountId)) {
      setCookieForAccount(accountId) { wv.loadUrl(url) }
    } else {
      wv.loadUrl(url)
    }
  }

  // 保存済みの Cookie をアカウントのデータディレクトリから読み込み CookieManager に設定する。
  // Profile API が使えない環境での複数アカウント切り替えに使う。
  // removeAllCookies は非同期のため、完了コールバック内で setCookie してから onComplete を
  // 呼ぶことで「古い Cookie の削除 → 新しい Cookie の設定 → 後続処理」の順序を保証する。
  private fun setCookieForAccount(
    accountId: String,
    onComplete: () -> Unit = {},
  ) {
    val cookieFile = File(filesDir, "accounts/${getCookieProfileName(accountId)}/x_cookies.txt")
    if (!cookieFile.exists()) {
      Log.w(TAG, "setCookieForAccount: cookie file not found for $accountId")
      onComplete()
      return
    }

    val cookies = parseCookieString(cookieFile.readText())
    if (cookies.isEmpty()) {
      onComplete()
      return
    }

    val cookieManager = CookieManager.getInstance()
    cookieManager.removeAllCookies {
      for (cookie in cookies) {
        cookieManager.setCookie("https://x.com", cookie)
        cookieManager.setCookie("https://twitter.com", cookie)
      }
      cookieManager.flush()
      Log.d(TAG, "setCookieForAccount: set cookies for $accountId")
      onComplete()
    }
  }

  // x.com / twitter.com のドメインに属する URL かどうかを判定する。
  // これらは WebView 内でそのまま表示し、外部 URL はシステムブラウザへ委譲する。
  internal fun isInternalUrl(url: String): Boolean = com.natsuyasai.multicolumnx.isInternalUrl(url)

  // 指定 URL をシステムデフォルトブラウザで開く。
  private fun openUrlInBrowser(url: String) {
    try {
      val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
      startActivity(intent)
    } catch (e: Exception) {
      Log.w(TAG, "openUrlInBrowser: failed to open $url: ${e.message}")
    }
  }

  // カラム / ポップアップ WebView 共通の WebViewClient。
  // x.com 内のナビゲーションはそのまま WebView に委ね、外部 URL はシステムブラウザへ転送する。
  // Profile API のプロファイル読み込みや Cookie 設定のタイミングにより Cookie が一時的に
  // 利用できずログイン画面が表示される場合がある。検知したら遅延後に元 URL へリカバリする（1回限り）。
  private inner class ExternalLinkWebViewClient(private val recoveryUrl: String) : WebViewClient() {
    private var loginRetried = false

    override fun shouldOverrideUrlLoading(
      view: WebView,
      request: WebResourceRequest,
    ): Boolean {
      val url = request.url.toString()
      if (isInternalUrl(url)) return false
      openUrlInBrowser(url)
      return true
    }

    override fun onPageFinished(
      view: WebView,
      url: String,
    ) {
      super.onPageFinished(view, url)
      if (!loginRetried && isLoginUrl(url) && !isLoginUrl(recoveryUrl)) {
        loginRetried = true
        Log.w(TAG, "ExternalLinkWebViewClient: login page detected, recovering to $recoveryUrl")
        view.postDelayed({ view.loadUrl(recoveryUrl) }, LOGIN_RECOVERY_DELAY_MS)
      }
    }
  }

  // target="_blank" / window.open() によるリンク遷移を処理する WebChromeClient。
  // ユーザー操作起因の場合のみ対応し、x.com リンクは元 WebView 内でナビゲート、
  // 外部リンクはシステムブラウザへ転送する。
  private inner class ExternalLinkWebChromeClient : WebChromeClient() {
    override fun onCreateWindow(
      view: WebView,
      isDialog: Boolean,
      isUserGesture: Boolean,
      resultMsg: Message,
    ): Boolean {
      if (!isUserGesture) return false
      // ヘルパー WebView を使って新しいウィンドウのリクエスト URL を取得する。
      val helper = WebView(this@MainActivity)
      helper.webViewClient =
        object : WebViewClient() {
          override fun shouldOverrideUrlLoading(
            helperView: WebView,
            request: WebResourceRequest,
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

  internal fun runOnUiThreadSync(action: () -> Unit) {
    runSyncOnThread(::runOnUiThread, action)
  }

  companion object {
    private const val TAG = "MainActivity"

    // ログイン画面検知からリカバリ用リロードまでの遅延。
    // プロファイル/Cookie の反映完了を待つための経験的な値。
    private const val LOGIN_RECOVERY_DELAY_MS = 1500L

    // popup_toolbar.ts が参照する window.__mcxPopupBridge と一致させること。
    private const val POPUP_BRIDGE_JS_NAME = "__mcxPopupBridge"

    // video_long_press_menu.ts が参照する window.__mcxVideoDownloadBridge と一致させること。
    private const val VIDEO_DOWNLOAD_BRIDGE_JS_NAME = "__mcxVideoDownloadBridge"

    // api_rate_limit_monitor.ts が参照する window.__mcxApiRateLimitBridge と一致させること。
    private const val API_RATE_LIMIT_BRIDGE_JS_NAME = "__mcxApiRateLimitBridge"

    // 常駐コンポーズ WebView のラベルプレフィックス。Rust 側 labels::COMPOSE_PREFIX と一致させること。
    private const val COMPOSE_LABEL_PREFIX = "compose-"
  }
}