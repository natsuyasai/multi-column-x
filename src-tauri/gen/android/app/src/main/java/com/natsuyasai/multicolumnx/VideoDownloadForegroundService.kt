package com.natsuyasai.multicolumnx

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat

// 動画ダウンロード（Android）用の Foreground Service。
// アプリがバックグラウンドに回っても OS にプロセスを kill されにくくするため、
// ダウンロード中はフォアグラウンド優先度に昇格し、進捗を通知として表示し続ける。
// 開始/進捗更新/終了は Rust 側（video_download.rs）から JNI 経由で MainActivity の
// notifyVideoDownload* メソッドを介して呼ばれる。
class VideoDownloadForegroundService : Service() {
  // bound service ではないため常に null を返す。
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(
    intent: Intent?,
    flags: Int,
    startId: Int,
  ): Int {
    when (intent?.action) {
      ACTION_START -> handleStart()
      ACTION_UPDATE -> intent.let { handleUpdate(it) }
      ACTION_FINISH -> handleFinish()
    }
    return START_NOT_STICKY
  }

  // フォアグラウンド昇格。通知チャンネルを作成してから startForeground する。
  private fun handleStart() {
    createNotificationChannel()
    val notification =
      buildNotificationBuilder(contentText = "ダウンロードを準備しています")
        .setProgress(0, 0, true)
        .build()
    ServiceCompat.startForeground(
      this,
      NOTIFICATION_ID,
      notification,
      ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
    )
  }

  // 進捗更新。total <= 0 は「不明」を表すセンチネル値として扱い、
  // indeterminate（不確定）プログレスバー表示に切り替える。
  private fun handleUpdate(intent: Intent) {
    val fileIndex = intent.getIntExtra(EXTRA_FILE_INDEX, 1)
    val fileCount = intent.getIntExtra(EXTRA_FILE_COUNT, 1)
    val current = intent.getLongExtra(EXTRA_CURRENT, 0L)
    val total = intent.getLongExtra(EXTRA_TOTAL, 0L)

    val builder = buildNotificationBuilder(contentText = buildProgressText(fileIndex, fileCount, current, total))
    if (total > 0) {
      val percent = ((current * 100) / total).toInt().coerceIn(0, 100)
      builder.setProgress(100, percent, false)
    } else {
      builder.setProgress(0, 0, true)
    }

    // POST_NOTIFICATIONS が未許可の場合、notify は何もしない（クラッシュしない）標準挙動に任せる。
    NotificationManagerCompat.from(this).notify(NOTIFICATION_ID, builder.build())
  }

  // フォアグラウンド状態を解除して通知を消し、サービスを停止する。
  private fun handleFinish() {
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  // 通知本文（「ファイル 1/2 (42%)」のような文字列）を組み立てる純粋関数。
  private fun buildProgressText(
    fileIndex: Int,
    fileCount: Int,
    current: Long,
    total: Long,
  ): String {
    val prefix = "ファイル $fileIndex/$fileCount"
    if (total <= 0) return prefix
    val percent = ((current * 100) / total).coerceIn(0, 100)
    return "$prefix ($percent%)"
  }

  // 通知タップ時、既存タスクを前面に戻すだけ（新規タスクは積まない）。
  // MainActivity が singleTask のため、この Intent で新規画面遷移は発生しない。
  private fun buildContentIntent(): PendingIntent {
    val intent =
      Intent(this, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_NEW_TASK
      }
    val flags =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      } else {
        PendingIntent.FLAG_UPDATE_CURRENT
      }
    return PendingIntent.getActivity(this, 0, intent, flags)
  }

  private fun buildNotificationBuilder(contentText: String): NotificationCompat.Builder =
    NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.stat_sys_download)
      .setContentTitle("動画をダウンロード中")
      .setContentText(contentText)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setContentIntent(buildContentIntent())
      .setPriority(NotificationCompat.PRIORITY_LOW)

  // Android O 以降のみ通知チャンネル作成が必要。既存チャンネルがあれば再作成しない。
  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(NotificationManager::class.java)
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    val channel =
      NotificationChannel(CHANNEL_ID, "動画ダウンロード", NotificationManager.IMPORTANCE_LOW).apply {
        description = "動画ダウンロードの進捗を表示します"
        setShowBadge(false)
      }
    manager.createNotificationChannel(channel)
  }

  companion object {
    const val ACTION_START = "com.natsuyasai.multicolumnx.action.VIDEO_DOWNLOAD_START"
    const val ACTION_UPDATE = "com.natsuyasai.multicolumnx.action.VIDEO_DOWNLOAD_UPDATE"
    const val ACTION_FINISH = "com.natsuyasai.multicolumnx.action.VIDEO_DOWNLOAD_FINISH"

    const val EXTRA_FILE_INDEX = "fileIndex"
    const val EXTRA_FILE_COUNT = "fileCount"
    const val EXTRA_CURRENT = "current"
    const val EXTRA_TOTAL = "total"

    private const val CHANNEL_ID = "video_download"
    private const val NOTIFICATION_ID = 1001
  }
}