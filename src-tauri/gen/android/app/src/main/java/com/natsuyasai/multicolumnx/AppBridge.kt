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
    external fun onInsets(top: Int, bottom: Int)

    /**
     * 端末の back ボタンが押されたときに MainActivity から呼ぶ。
     * ポップアップが開いていれば close-topmost-popup イベントを emit して true を返す。
     * 開いていなければ false を返してデフォルトの back 動作に委ねる。
     */
    @JvmStatic
    external fun closeTopPopup(): Boolean

    /**
     * エッジスワイプを検出したときに MainActivity から呼ぶ。
     * direction: "left"（次のカラム）または "right"（前のカラム）
     */
    @JvmStatic
    external fun onSwipeNavigate(direction: String)

    /**
     * 水平スワイプ操作中（指が動いている間）に呼ぶ。
     * direction: "left" または "right"
     */
    @JvmStatic
    external fun onSwipeProgress(direction: String)

    /**
     * スワイプがフリングに至らず終了したときに呼ぶ（キャンセル）。
     */
    @JvmStatic
    external fun onSwipeCancel()

    /**
     * アクティブカラム領域でダブルタップを検出したときに呼ぶ。
     * column-double-tap イベントを emit してページリロードをトリガーする。
     */
    @JvmStatic
    external fun onDoubleTap()
}
