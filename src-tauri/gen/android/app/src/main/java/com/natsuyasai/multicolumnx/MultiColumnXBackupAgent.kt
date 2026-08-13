package com.natsuyasai.multicolumnx

import android.app.backup.BackupAgent
import android.app.backup.BackupDataInput
import android.app.backup.BackupDataOutput
import android.app.backup.FullBackupDataOutput
import android.os.ParcelFileDescriptor

/**
 * 端末引き継ぎ（Auto Backup / 端末間転送）用のカスタムバックアップエージェント。
 * WebView の Service Worker キャッシュ等、再生成可能な巨大データを除外しつつ
 * ログインセッション（Cookie等）を含む実データをバックアップ対象に含める。
 */
class MultiColumnXBackupAgent : BackupAgent() {
  override fun onFullBackup(data: FullBackupDataOutput) {
    val root = filesDir.parentFile ?: return
    BackupFileSelector.selectFiles(root).forEach { file ->
      fullBackupFile(file, data)
    }
  }

  // 全量バックアップ方式のみを使用するため、鍵バリューAPI(onBackup/onRestore)は未使用。
  override fun onBackup(
    oldState: ParcelFileDescriptor?,
    data: BackupDataOutput?,
    newState: ParcelFileDescriptor?,
  ) = Unit

  override fun onRestore(
    data: BackupDataInput?,
    appVersionCode: Int,
    newState: ParcelFileDescriptor?,
  ) = Unit
}