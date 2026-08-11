package com.natsuyasai.multicolumnx

import android.view.View
import org.junit.Assert.assertEquals
import org.junit.Test

class ColumnWebViewUtilsTest {
  @Test
  fun columnwebviewinitialvisibilityは表示指定でvisibleを返す() {
    assertEquals(View.VISIBLE, columnWebViewInitialVisibility(true))
  }

  @Test
  fun columnwebviewinitialvisibilityは非表示指定でinvisibleを返す() {
    assertEquals(View.INVISIBLE, columnWebViewInitialVisibility(false))
  }
}