package com.natsuyasai.multicolumnx

import android.view.View

/**
 * カラム WebView 作成時の初期表示状態を返す。
 * View.GONE は measure/layout パス対象外になり、WebView 内の Chromium に正しい
 * ビューポートサイズが伝わらないまま X.com のタイムライン仮想リストが構築されてしまう
 * （後で VISIBLE 化してもリサイズだけでは仮想リストの再計算がトリガーされない）。
 * 非表示分も layout 対象になる View.INVISIBLE を使うことでこれを回避する。
 */
fun columnWebViewInitialVisibility(visible: Boolean): Int {
  return if (visible) View.VISIBLE else View.INVISIBLE
}