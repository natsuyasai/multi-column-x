package com.natsuyasai.multicolumnx

/**
 * Rust の android_bridge モジュールへの JNI ブリッジ。
 * MainActivity.onCreate から initContext を呼び、Activity 参照を Rust 側に渡す。
 */
object AppBridge {
  init {
    // Rust.kt で既に読み込まれているが、明示的に書いても idempotent
    System.loadLibrary("multi_column_x_lib")
  }

  /**
   * MainActivity を Rust 側に渡す。
   * Rust は GlobalRef として保持し、後で AddAccount 起動に使う。
   */
  @JvmStatic
  external fun initContext(activity: WryActivity)

  /**
   * システムバーの高さ（dp 単位）を Rust 側に渡す。
   * MainActivity の WindowInsetsCompat リスナーから呼ばれる。
   */
  @JvmStatic
  external fun onInsets(
    top: Int,
    bottom: Int,
  )

  /**
   * 端末の back ボタンが押されたときに MainActivity から呼ぶ。
   * ポップアップが開いていれば close-topmost-popup イベントを emit して true を返す。
   * 開いていなければ false を返してデフォルトの back 動作に委ねる。
   */
  @JvmStatic
  external fun closeTopPopup(): Boolean

  /**
   * ポップアップ内のアカウント切替セレクタが変更されたときに PopupSessionBridge から呼ぶ。
   * Rust 側で既存ポップアップを削除し、選択アカウントのセッションで再作成する。
   */
  @JvmStatic
  external fun onPopupSwitchSession(
    popupId: String,
    accountId: String,
    url: String,
  )

  /**
   * column WebView 内の動画長押しメニューから、動画ダウンロード要求が来たときに
   * VideoDownloadRequestBridge から呼ぶ。
   */
  @JvmStatic
  external fun onVideoDownloadRequest(payloadJson: String)

  /**
   * column WebView 内の api_rate_limit_monitor.ts から、APIレート制限情報が
   * 届いたときに ApiRateLimitBridge から呼ぶ。
   */
  @JvmStatic
  external fun onApiRateLimitReport(
    label: String,
    payloadJson: String,
  )

  /**
   * ポップアップ内の popup_toolbar.ts から、公式設定スナップショットが
   * 届いたときに PopupSessionBridge から呼ぶ。
   */
  @JvmStatic
  external fun onOfficialSettingsReport(
    accountId: String,
    snapshot: String,
  )

  /**
   * ポップアップ WebView が実際に破棄されたとき（終了ボタン／戻るボタン経由の非常駐破棄）に
   * MainActivity の removePopupWebView / closeTopPopupWebView から呼ぶ。
   * アカウント切替による内部的な閉じ直しでも呼ばれるが、Rust 側の追跡ラベルは
   * 破棄前に付け替え済みのため、公式設定ポップアップの実クローズのみが検出される。
   */
  @JvmStatic
  external fun onPopupClosed(popupId: String)

  /**
   * スワイプバー（SwipeBarOverlayView）でスワイプジェスチャーが確定したときに呼ぶ。
   * Rust 側はこれを受けて mobile-swipe-navigate イベントを React へ emit する。
   * React 側の navigateColumn が実際に遷移を決定した場合のみ、遷移確定フラッシュ
   * （MainActivity.setSwipeBarFlash 経由）が送り返される想定（自前でここから判定しない）。
   */
  @JvmStatic
  external fun onSwipeNavigate(direction: String)

  /**
   * スワイプバー（SwipeBarOverlayView）でジェスチャー中の指の移動方向が変化したときに呼ぶ。
   * Rust 側はこれを受けて mobile-swipe-progress イベントを React へ emit する。
   * 空文字列は「進捗なし（指を離した/方向未確定）」を表す。
   */
  @JvmStatic
  external fun onSwipeProgress(direction: String)

  /**
   * スワイプバー（SwipeBarOverlayView）でダブルタップが確定したときに呼ぶ。
   * Rust 側はこれを受けて mobile-swipe-double-tap イベントを React へ emit する。
   * React 側はアクティブカラムを先頭スクロール+リロードする（タブのダブルタップと同じ動作）。
   */
  @JvmStatic
  external fun onSwipeDoubleTap()
}