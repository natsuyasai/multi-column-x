package com.natsuyasai.multicolumnx

import android.os.Handler
import android.os.Looper
import java.io.File

class AddAccount : TauriActivity() {
    private val handler = Handler(Looper.getMainLooper())
    private var polling = false

    override fun onResume() {
        super.onResume()
        polling = true
        schedulePoll()
    }

    override fun onPause() {
        super.onPause()
        polling = false
        handler.removeCallbacksAndMessages(null)
    }

    private fun schedulePoll() {
        handler.postDelayed({
            if (!polling) return@postDelayed
            // Rust の mark_login_complete が書くセンチネルファイルを監視する。
            // filesDir は Tauri の app_data_dir() と同じパスに対応する。
            val sentinel = File(filesDir, "add_account_login_complete")
            if (sentinel.exists()) {
                sentinel.delete()
                finish()
            } else {
                schedulePoll()
            }
        }, 500)
    }
}
