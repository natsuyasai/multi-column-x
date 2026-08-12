package com.natsuyasai.multicolumnx

import android.view.View
import org.junit.Assert.assertEquals
import org.junit.Test

class ColumnWebViewUtilsTest {
  @Test
  fun `表示指定でVISIBLEを返す`() {
    assertEquals(View.VISIBLE, columnWebViewInitialVisibility(true))
  }

  @Test
  fun `非表示指定でINVISIBLEを返す`() {
    assertEquals(View.INVISIBLE, columnWebViewInitialVisibility(false))
  }
}