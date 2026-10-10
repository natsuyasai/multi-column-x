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

## Android のパネル型ダイアログ全画面化

Android では画面が狭く、表示サイズを大きくすると中央カード型のダイアログが見切れる。そのため大きいパネル型ダイアログは Android のみ画面全体に表示する。デスクトップの見た目は変えない。

- **プラットフォーム判定**: `<html data-platform="android"|"desktop">` を `usePlatformAttribute`（`src/hooks/usePlatformAttribute.ts`）が付与する。`App.tsx` でストアの `isMobile` に連動して設定する。SCSS 側は CSS Modules 内で `:global([data-platform="android"]) &` により参照する。
- **共有ミキシン** `src/styles/_dialog-fullscreen.scss`
  - `android-fullscreen-overlay`: overlay の padding を 0 にし、パネルを画面いっぱいに広げ、`overflow-y: hidden` にする（スクロールは panel/本文の 1 箇所だけ）。
  - `android-fullscreen-panel($padding)`: 幅・高さ 100%、角丸・枠線なし。`$padding` に panel 元々の上下 padding を渡すと、そこへ `env(safe-area-inset-top/bottom)` を加算する（ノッチ・ナビゲーションバー対策）。
  - `android-fullscreen-sticky-header($padding)`: panel 全体がスクロールする構造用にヘッダー要素を固定する（下記）。
  - デスクトップの既存宣言は変更せず、Android 用の上書きだけをミキシンに集約する。
- **対象 6 ダイアログ**: アプリ設定（`AppSettingsPanel`）・カラム設定（`SettingsPanel`）・アカウント管理（`AccountManager`）・カラム追加（`AddColumnDialog`）・ショートカット一覧（`ShortcutHelpDialog`）・更新内容（`WhatsNewDialog`）。
- **ヘッダー固定**
  - `AppSettingsPanel` / `SettingsPanel` は panel が flex column で本文のみスクロールする構造のため、そのまま固定される。
  - 他の 4 つは panel 全体がスクロールするため、ヘッダー（`AddColumnDialog` などは先頭見出し）に sticky ミキシンを使う。単純な `top: 0` では panel の padding 分の隙間ができ、そこへ本文が透けるうえ、ノッチ下の余白もずれる。そこで panel の上端 padding を 0 にし（`android-fullscreen-panel` の第2引数 `true`）、その分（padding + セーフエリア）をヘッダー自身の padding に持たせ、背景色を付ける方式にした。**上端を負マージンで打ち消す方式は不可**: sticky は包含ブロック（panel の content box）内へ押し下げられるため、ヘッダーが padding 分下へずれて本文に重なり、先頭の項目が見切れる（実機で発生。`AndroidHeaderDoesNotOverlapBody` Story が再現・検証する）。
  - `WhatsNewDialog` の `.notes` は Android で内側スクロールを無効にし、二重スクロールを避けている。
- **新しくパネル型ダイアログを追加するときは必ず上記ミキシンを `@include` すること**（`overlay` と panel、panel 全体スクロールなら sticky ヘッダーも）。
- **小さなダイアログ（全画面化しない）**: `ConfirmDialog` / `AccountNameDialog` / `TabActionDialog` / `UpdateDialog` / `LinkPopupDialog` / `H264SetupDialog` は中央表示のまま、次を満たす。幅は画面内に収まり、縦に収まらないときは内部スクロールで末尾のボタンへ到達できる。監査の結果、満たしていなかったのは `TabActionDialog`（ボトムシートに `max-height` と縦スクロールが無く、特大では上端がはみ出した）だけで、`.sheet` に `max-height: 100%` と `overflow-y: auto` を追加した。
- **Storybook 検証の注意**: Storybook は `index.css` を読み込まないため、`--mcx-border` などのテーマ変数が未定義になり、`border` が無効値になって枠線幅が常に 0 になる。枠線の有無を検証する Story では panel に `--mcx-border` を手動で設定している。狭い画面は `vitest/browser` の `page.viewport` で再現し、終了時に元へ戻す。`data-platform` と `font-size` もアンマウント時に戻す。
- **手動確認項目（実機）**: ノッチやナビゲーションバーにヘッダー・本文末尾が隠れないこと、フォントサイズ最大での見え方、全画面ダイアログを閉じたときにカラム WebView が元の位置へ復元されること。

## 大きな表示サイズでのボトムバーと案内ダイアログ

- **ボトムバー（`MobileTabBar`）**
  - ツイート作成ボタン・展開トグル・展開時のアクション群を `.menu`（`flex: 0 1 auto; min-width: 0; overflow-x: auto`）で包み、収まらないときは横スクロールにする。スクロールバーは非表示。`.tabs` には `min-width: 6.25rem`（タブ1つ分）を付け、メニュー列に押し潰されないようにした。
  - バー高さ `3.5rem`（`MOBILE_TAB_BAR_HEIGHT_REM`）は `gridLayout.contract.test.ts` が SCSS を読んで検証し、カラム WebView の bounds にも使うため増やさない。高さを増やす（メニューを2段にする）案は gridLayout の定数変更が必要になるため不採用。
  - API レート制限インジケーターのモバイル用ポップオーバーは `position: fixed` で、祖先に `transform` などが無いため、`.menu` の `overflow` ではクリップされない。
  - 通常サイズでも幅 360px・メニュー展開時は、メニューが約 344px になりタブ最小幅と合わせて収まらず横スクロールになる（以前はタブ領域がほぼ潰れていた）。実機での確認が必要。
- **`position: fixed; left: 50%; transform: translate(-50%, -50%)` の要素**は、`left: 50%` の基準により shrink-to-fit 幅が画面の半分までに制限され、文字が大きいと窮屈に折り返す。幅は `width: min(○rem, calc(100% - 2rem))` のように明示し、縦も `max-height: calc(100% - 2rem); overflow-y: auto` で収める（アカウント未登録の案内 `NoAccountsPrompt` の事例）。

## 既知の割り切り

- 設定ロード前は既定の `auto` で描画されるため、Android で保存値と端末倍率が異なる場合、起動直後に一瞬チラつく可能性がある。
- `mobileSwipeAreaHeight` はユーザー指定の px のまま（ネイティブの `SwipeBarOverlayView` が描画するため rem 化の対象外）。ただしスワイプバーの `y` 計算に使うタブバー高さは px 化した値を使う。
- `uiScale` は端末画面に依存する好みなので、バックアップ対象外（`BackupGlobalSettings` に含めない。復元時は現在値を維持する）。
- 別ウィンドウ（ポップアップ・コンポーズ）は x.com を直接表示するため対象外。メインウィンドウの UI のみが対象。
