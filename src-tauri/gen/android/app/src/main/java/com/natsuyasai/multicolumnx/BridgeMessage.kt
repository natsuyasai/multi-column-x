package com.natsuyasai.multicolumnx

import org.json.JSONException
import org.json.JSONObject

/**
 * addWebMessageListener 経由で JS（inject スクリプト）から postMessage(JSON文字列) で
 * 送られてくるネイティブブリッジ連携メッセージ。
 */
sealed class BridgeMessage {
  data class SwitchPopupSession(
    val accountId: String,
    val url: String,
  ) : BridgeMessage()

  data class ReportOfficialSettings(
    val accountId: String,
    val snapshot: String,
  ) : BridgeMessage()

  object ClosePopup : BridgeMessage()

  data class DownloadVideo(
    val payloadJson: String,
  ) : BridgeMessage()

  data class ReportApiRateLimit(
    val payloadJson: String,
  ) : BridgeMessage()
}

private const val TYPE_SWITCH_POPUP_SESSION = "switchPopupSession"
private const val TYPE_REPORT_OFFICIAL_SETTINGS = "reportOfficialSettings"
private const val TYPE_CLOSE_POPUP = "closePopup"
private const val TYPE_DOWNLOAD_VIDEO = "downloadVideo"
private const val TYPE_REPORT_API_RATE_LIMIT = "reportApiRateLimit"

/**
 * postMessage で受け取った JSON 文字列を [BridgeMessage] にパースする。
 *
 * 不正な JSON、type が欠落・未知、type ごとの必須フィールドが欠落または空文字の場合は
 * null を返す（安全側に倒し、呼び出し元は無視する）。
 */
fun parseBridgeMessage(raw: String): BridgeMessage? {
  val json =
    try {
      JSONObject(raw)
    } catch (e: JSONException) {
      return null
    }
  return when (json.optString("type", "")) {
    TYPE_SWITCH_POPUP_SESSION -> {
      val accountId = json.optString("accountId", "")
      val url = json.optString("url", "")
      if (accountId.isEmpty() || url.isEmpty()) {
        null
      } else {
        BridgeMessage.SwitchPopupSession(accountId, url)
      }
    }
    TYPE_REPORT_OFFICIAL_SETTINGS -> {
      val accountId = json.optString("accountId", "")
      val snapshot = json.optString("snapshot", "")
      if (accountId.isEmpty() || snapshot.isEmpty()) {
        null
      } else {
        BridgeMessage.ReportOfficialSettings(accountId, snapshot)
      }
    }
    TYPE_CLOSE_POPUP -> BridgeMessage.ClosePopup
    TYPE_DOWNLOAD_VIDEO -> {
      val payload = json.optString("payload", "")
      if (payload.isEmpty()) null else BridgeMessage.DownloadVideo(payload)
    }
    TYPE_REPORT_API_RATE_LIMIT -> {
      val payload = json.optString("payload", "")
      if (payload.isEmpty()) null else BridgeMessage.ReportApiRateLimit(payload)
    }
    else -> null
  }
}