# アプリUI表示サイズ 開発ノート

アプリ自身の UI（TopBar・設定・ダイアログ・モバイルタブバーなど React 製の部分）の表示サイズを、端末の設定に追従させつつ設定画面から上書きできるようにする仕組みの実装知見を記録する。カラム WebView の中身（x.com の表示）は対象外。

## 対象ファイル

- `src/lib/uiScale.ts` — 倍率決定の純粋ロジック（`resolveUiScale` / `resolveDeviceUiScale` / `clampUiScale`）、端末倍率のプローブ（`measureDeviceFontScale`）、`rootFontPx`（モジュール変数）と `remToPx`
- `src/hooks/useUiScale.ts` — 倍率を `<html>` の `font-size` と `rootFontPx` へ反映するフック。Android の端末倍率を測定・再測定する
- `src/lib/gridLayout.ts` — ネイティブ WebView の bounds に使う高さの rem 定数（`HEADER_HEIGHT_REM` など）と px を返す `get*Height()`
- `src/lib/gridLayout.contract.test.ts` — SCSS の寸法と rem 定数の一致を検証する契約テスト
- `src/App.tsx` — `useUiScale` の配線と、倍率変更時の bounds 再計算 effect
- `src/components/AppSettingsPanel/DisplaySettingsSection.tsx` — 設定画面の「アプリUIの表示サイズ」「カラム内の表示サイズ」

## 方式

- `<html>` の `font-size` を `16px × 倍率` にし、UI の寸法は `rem` で書く。文字・余白・アイコンが一括で拡縮する。`src/App.css` の `:root { font-size: 16px; }` は残し、倍率は JS が `document.documentElement.style.fontSize` で上書きする。
- 設定値 `uiScale` は `"auto" | "small" | "standard" | "large" | "xLarge"`（既定 `auto`）。設定画面の名称は **「アプリUIの表示サイズ」**（`uiScale`）で、**「カラム内の表示サイズ」**（`columnScale`＝x.com 側の表示）とは別設定。互いに影響しない。
- 不採用案
  - CSS `zoom`: `getBoundingClientRect` など座標系が zoom の影響を受けるリスクが大きい。
  - Tauri `setZoom`: Android で使えず、プラットフォーム差が出る。

## 倍率の決定ルール

- **「端末に合わせる」（`auto`）**
  - デスクトップは **1.0 固定**。WebView が OS の DPI で既に拡大済みのため、補正すると二重拡大になる。
  - Android は WebView の既定フォントサイズを測る。`font-size: medium`（`html` の font-size に依存しないキーワード）を持つ不可視プローブ要素の computed font-size ÷ 16 を端末倍率とし、`[0.75, 1.5]` にクランプする（`clampUiScale`。NaN / 0 以下は 1）。実行中の変化は `resize` と `visibilitychange`（フォアグラウンド復帰）で再測定する。
- **プリセット**（小 0.875 / 標準 1 / 大 1.125 / 特大 1.25）は端末値に**乗算せず置き換える**。未知の値は `auto` 扱いにフォールバックする。
- **Android のプローブは実機未検証。** Chromium WebView が Android のフォントサイズ設定を既定フォントサイズへ反映する想定で実装している。反映されない場合のフォールバック案は、`MainActivity.kt` から `Configuration.fontScale` を返す Tauri コマンドを追加すること。その場合は **ACL 3点セット（`build.rs` の `AppManifest` と capability 2ファイル）の更新と、ProGuard keep ルールの同期が必要**（CLAUDE.md の ACL・ProGuard の項を参照）。実機検証の結果は `integration-test.md` に記録する。

## ネイティブ WebView の bounds

- カラム WebView は React の DOM の外にあるため、TopBar などの高さを px で渡す必要がある。高さ定数は rem 値（`HEADER_HEIGHT_REM = 2.25`、`SCROLLBAR_HEIGHT_REM = 0.75`、`MOBILE_TAB_BAR_HEIGHT_REM = 3.5`、`TOPBAR_COLLAPSED_HEIGHT_REM = 2`、`TOPBAR_EXPANDED_HEIGHT_REM = 4`）で持ち、`get*Height()` が `remToPx`（`rem × rootFontPx` を四捨五入）で px 化して bounds に渡す。`rootFontPx` は React 外（純粋関数・サービス層）からも参照されるためモジュール変数にしており、`useUiScale` が `<html>` の font-size と同時に更新する。
- `calculateGridBounds` など純粋関数は、高さを引数で受け取る既存設計のまま。px 化は呼び出し側で行う。
- **SCSS の高さと JS の rem 定数は同じ値に保つ必要がある。** ずれるとカラム WebView と React の UI の位置関係が崩れる。`gridLayout.contract.test.ts` が TopBar（`$topbar-row-height` とその2行分）・ColumnHeader・MobileTabBar・下部スクロールバーの SCSS を読んで検証する。**レイアウト高さを変えるときは SCSS と rem 定数の両方を更新すること。**
- UI の寸法は rem で書く。px のまま残してよいのは 1px 以下のヘアラインと media query のブレークポイントのみ（media query の rem は root font-size に依存しないため意味が変わる）。

## effect の宣言順と bounds 再計算

- `useUiScale` は `useAppBootstrap` の**直前**に呼ぶ。effect は宣言順に実行されるため、`restoreColumns` の effect より前に `rootFontPx` が確定している必要がある。
- `topBarHeight` は描画時に計算されるため、倍率適用前の値になり得る。復元時は `restoreColumns(getTopBarHeight(topBarExpanded))` のように呼び出し時に取り直す。
- 倍率変更時の全カラム bounds 再計算（`recalculateAllBounds()`、モバイルは `syncMobileSwipeBar()` も）は、`dialogOpen` effect とは**別の effect**にしている。`dialogOpen` effect は `anyDialogOpen` のみで発火し他の依存では再実行しない設計のため、依存を足して壊さないこと。別 effect は前回値との比較で初回を除外し、復元前とダイアログ表示中（閉じたときの復元に任せる）は何もしない。

## 既知の割り切り

- 設定ロード前は既定の `auto` で描画されるため、Android で保存値と端末倍率が異なる場合、起動直後に一瞬チラつく可能性がある。
- `mobileSwipeAreaHeight` はユーザー指定の px のまま（ネイティブの `SwipeBarOverlayView` が描画するため rem 化の対象外）。ただしスワイプバーの `y` 計算に使うタブバー高さは px 化した値を使う。
- `uiScale` は端末画面に依存する好みなので、バックアップ対象外（`BackupGlobalSettings` に含めない。復元時は現在値を維持する）。
- 別ウィンドウ（ポップアップ・コンポーズ）は x.com を直接表示するため対象外。メインウィンドウの UI のみが対象。
