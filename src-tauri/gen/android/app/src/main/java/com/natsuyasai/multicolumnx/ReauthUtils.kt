package com.natsuyasai.multicolumnx

/** 再認証で使う一時 WebView プロファイル名。対象アカウントのライブプロファイルと衝突しない prefix を付ける。 */
fun reauthTempProfileId(uuid: String): String = "reauth-tmp-$uuid"

/**
 * 再認証で得た xUserId と登録済み expectedUserId から、書くべきセンチネル名を決める。
 * - xUserId が null → "reauth_mismatch"（識別子取得失敗＝検証不能）
 * - expectedUserId が非 null/非空 かつ xUserId と不一致 → "reauth_mismatch"
 * - それ以外（一致 or expectedUserId 未指定＝初回）→ "reauth_complete"
 */
fun reauthSentinelName(
  xUserId: String?,
  expectedUserId: String?,
): String =
  when {
    xUserId == null -> "reauth_mismatch"
    !expectedUserId.isNullOrEmpty() && expectedUserId != xUserId -> "reauth_mismatch"
    else -> "reauth_complete"
  }