package com.natsuyasai.multicolumnx

import android.os.Bundle
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState) // ← ここでネイティブライブラリが読み込まれる
    AppBridge.initContext(this)        // ← 読み込み後に Rust へ Activity 参照を渡す
  }
}
