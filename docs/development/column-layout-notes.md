# カラムレイアウト・ナビゲーション 開発ノート

グリッドレイアウト・カラム並べ替え・モバイルのカラム切り替えに関する実装知見を記録する。

## 対象ファイル

- `src/lib/gridLayout.ts` — グリッド座標計算（`calculateGridBounds` など純粋関数）
- `src/services/columnWebview.ts` — カラム WebView への IPC 呼び出し集約
- `src/App.tsx` — ダイアログ表示時の WebView 退避（`dialogOpen` effect）・モバイルスワイプバーのネイティブオーバーレイ同期（`syncMobileSwipeBar`）
- `src-tauri/gen/android/app/src/main/java/com/natsuyasai/multicolumnx/MainActivity.kt` — カラム／ポップアップ／スワイプバーオーバーレイの View 管理、Z順の不変条件（`restoreOverlayOrder()`）
- `src-tauri/gen/android/app/src/main/java/com/natsuyasai/multicolumnx/SwipeBarOverlayView.kt` — スワイプバーのネイティブ描画・タッチ判定

## グリッドレイアウト・カラム WebView の座標計算

- カラムは `gridRow` / `gridCol` でマトリクス配置する。座標計算は `src/lib/gridLayout.ts` の `calculateGridBounds`（純粋関数）が担当し、各カラムの絶対座標を Rust の `create_column_webview` / `resize_column_webview` に渡す。WebView への IPC 呼び出しは `src/services/columnWebview.ts` に集約されている。
- Tauri v2 の子 WebView は OS ネイティブウィンドウのため、CSS の `z-index` は機能しない。ダイアログ表示中は `hideColumnWebviews()` で全 WebView を画面外に退避し、閉じると `recalculateAllBounds()` で復元する。この挙動は `src/App.tsx` の `dialogOpen` effect（`anyDialogOpen` の変化のみで発火し、他の依存では再実行しない設計）で制御している。新しいダイアログ・ポップアップ系 UI を追加する際は、この `anyDialogOpen` の条件（`dialogOpen || updater.available || whatsNew.notes || pendingAccountName || pendingRemoval || reauthNotice` など）に追加する必要がある。

## モバイルのカラム切り替え（スワイプバー）

- 当初は `MobileTabBar` 自体への横フリック検出で実装していたが、タブバーは `.tabs` が `overflow-x: auto` かつ各タブ `min-width: 100px` のため、カラムが増えて横スクロールが必要になる場面（＝フリック機能が最も欲しい場面）で横スクロールと操作が衝突し、この方式は破棄した。次にタブバー直上に専用の非スクロール帯 `MobileSwipeBar`（React/DOM 実装、帯の高さ分だけカラム WebView の bounds を縮めて隙間に露出させる方式）を新設したが、この DOM 実装は現在は撤去済み（下記参照）。
- **現在の実装（ネイティブオーバーレイ化）**: Android のカラム WebView は `contentRoot.addView()`（`MainActivity.kt`）で追加された素の Android View であり、CSS の `z-index` が効かず Z順は View 階層への追加順で決まる。DOM 実装のままでは「スワイプ領域をカラムより手前に表示する」「透過時にカラムの中身を透けさせる（`View.alpha`）」の2点を満たせないため、スワイプバーの視覚描画・タッチ検知を丸ごと Android ネイティブ（Kotlin）の `SwipeBarOverlayView` へ移植し、カラム WebView の `addView` 後（＝最前面）に重ねるオーバーレイにした。これに伴い `MobileSwipeBar.tsx` / `.module.scss` / `.stories.tsx` / `.test.tsx` は削除し、カラム WebView の高さもスワイプ領域分を含むよう変更した（＝画面下部の「隙間」は無くなった）。詳細設計は `tmp/plans/2026-08-11-mobile-swipe-bar-native-overlay/plan.md` を参照。
- オーバーレイの座標は `Gravity.BOTTOM + bottomMargin` のような相対配置ではなく、カラム WebView と同じ絶対 `y`（`viewportHeight - MOBILE_TAB_BAR_HEIGHT - swipeAreaHeight`。JS 側 `mobileColumnLayout` と同じ計算元）を Rust 経由で `MainActivity.setSwipeBarOverlay` に渡し、`topMargin` で配置する（`showColumnWebView` と同じ流儀）。相対配置にしないのは、IME 表示時や画面回転時に `WindowInsetsCompat` リスナーが `contentRoot` の実効高さを変える一方、カラム WebView は JS 側で計算した絶対座標のまま追従しないため、座標系が別ソースだとズレるからである。React 側は `src/App.tsx` の `syncMobileSwipeBar` がこの `y` を計算して同期する。**回転・リサイズでは `columnsRestored` や設定・テーマ・ダイアログ開閉のいずれも変化しないため、`window.addEventListener("resize", ...)`（`useDesktopColumns.ts` の `handleResize` と同じ 100ms デバウンスパターン）で明示的に `syncMobileSwipeBar()` を呼び直す必要がある**（呼び忘れるとカラムだけ再配置されオーバーレイが古い位置に残り、`View.alpha` は CSS `pointer-events` と異なり透明でもタッチを吸収するため誤タップの原因になる）。
- **View の重なり順（Z順）の不変条件「popup > overlay(スワイプバー) > column > main」は `MainActivity.restoreOverlayOrder()` に集約している。** `bringToFront()` を個別の箇所に散在させず、`createColumnWebView` / `createPopupWebView` の両方（`contentRoot.addView` 直後）から呼ぶことで、`recreateAllWebviews`（再認証・全再読込）でポップアップ表示中に新しい column/overlay が追加されても順序が崩れない。**将来 `contentRoot.addView()` する新しい View 種別を追加する場合は、この不変条件を意識し、必要なら `restoreOverlayOrder()` の呼び出しを追加すること。**
- タッチ判定は `SwipeGestureResolver`（純粋関数、Android 非依存）に切り出し、`SwipeBarOverlayView.onTouchEvent` から呼ぶ。しきい値は移動量 `40dp` 以上・`|dx| > |dy|`（縦移動が横移動以上＝斜め方向優勢なら無効）の2条件で、時間制限は無い（旧 DOM 実装 `MobileSwipeBar.tsx` の `handleEnd` にも時間条件は無く、本ノートの旧版が「600ms以内」と誤って記載していたため今回訂正した。挙動自体の変更ではない）。`progress`（指の移動方向の強調表示）は `SwipeBarOverlayView` がローカルで即座に描画し、`switching`（遷移確定フラッシュ）は自前判定せず、React 側の `navigateColumn` が実際に遷移を決定したときだけ `flashMobileSwipeBar` 経由で明示的にトリガーする（`navigateColumn` の早期return時にフラッシュしてしまう退行を防ぐため。遷移可否の権威は常に React 側に置く）。
- 実装着手前に発見した既存バグ: モバイル column WebView の bounds が、作成時は `y: 0` なのに `setActiveColumn` / `restoreMobileColumns` でのリサイズ時だけ `y: MOBILE_TAB_BAR_HEIGHT(56)` になる不整合があった。アプリが動作していたのは作成時の `y: 0` がそのまま効いていたためで、たまたま表面化していなかった。正しくは常に `y: 0` とし、`mobileColumnBounds` という単一の純粋関数に一本化している。同種のレイアウト計算を追加する際は、作成時とリサイズ時で bounds 計算ロジックが分岐していないか確認すること。
- 却下した代替案: ボリュームキーでの切り替え（メディア音量操作と競合するため）、2本指スワイプ（片手操作に不向きなため）。
- ネイティブ側に既存の「ブーメランジェスチャー（逆方向に引いてから折り返す）」処理があり、画像拡大中の単指パンと誤検知することがある。スワイプバーのネイティブオーバーレイ化後もこの処理の撤去はスコープ外としており、併存したままになっている。

## グリッドレイアウトの割り切り仕様

- 縦積みで `heightMode: "fixed"` の合計が `containerHeight` を超える／下回るケースは明示的に未対応。オーバーフロー時のクリップや自動圧縮ロジックは存在せず、「空きスペースはそのまま空白になる」という割り切り仕様になっている。
- `order` フィールドは `gridRow` で代替可能になった後も、後方互換のためあえて残す設計判断をしている。
- 新規カラムはグリッドの空きセルを探すのではなく、常に「既存カラムの最大 `gridCol` + 1」（同一行に横積み）へ配置される。行方向への自動積み増しは行わない。
- ヘッダーをスクロールコンテナ内蔵の `headerRow` から、各カラム個別の `position: absolute` 要素に変更した経緯があり、`recalculateAllBounds` 実行時にヘッダーの DOM 位置も同時に更新しないとスクロール追従が壊れる。ヘッダー関連のレイアウト変更をする際は、この2つの更新が必ずセットであることに注意する。
