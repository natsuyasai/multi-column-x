# カラムレイアウト・ナビゲーション 開発ノート

グリッドレイアウト・カラム並べ替え・モバイルのカラム切り替えに関する実装知見を記録する。

## 対象ファイル

- `src/lib/gridLayout.ts` — グリッド座標計算（`calculateGridBounds` など純粋関数）
- `src/services/columnWebview.ts` — カラム WebView への IPC 呼び出し集約
- `src/App.tsx` — ダイアログ表示時の WebView 退避（`dialogOpen` effect）

## グリッドレイアウト・カラム WebView の座標計算

- カラムは `gridRow` / `gridCol` でマトリクス配置する。座標計算は `src/lib/gridLayout.ts` の `calculateGridBounds`（純粋関数）が担当し、各カラムの絶対座標を Rust の `create_column_webview` / `resize_column_webview` に渡す。WebView への IPC 呼び出しは `src/services/columnWebview.ts` に集約されている。
- Tauri v2 の子 WebView は OS ネイティブウィンドウのため、CSS の `z-index` は機能しない。ダイアログ表示中は `hideColumnWebviews()` で全 WebView を画面外に退避し、閉じると `recalculateAllBounds()` で復元する。この挙動は `src/App.tsx` の `dialogOpen` effect（`anyDialogOpen` の変化のみで発火し、他の依存では再実行しない設計）で制御している。新しいダイアログ・ポップアップ系 UI を追加する際は、この `anyDialogOpen` の条件（`dialogOpen || updater.available || whatsNew.notes || pendingAccountName || pendingRemoval || reauthNotice` など）に追加する必要がある。

## モバイルのカラム切り替え（スワイプバー）

- 当初は `MobileTabBar` 自体への横フリック検出で実装していたが、タブバーは `.tabs` が `overflow-x: auto` かつ各タブ `min-width: 100px` のため、カラムが増えて横スクロールが必要になる場面（＝フリック機能が最も欲しい場面）で横スクロールと操作が衝突し、この方式は破棄した。タブバー直上に専用の非スクロール帯 `MobileSwipeBar` を新設する方式に転換している。
- この帯が画像ズームのパンや X 自身の横スワイプ（コンテンツ WebView 内で発生する操作）と衝突しない理由はアーキテクチャ上の性質による。column WebView は OS ネイティブの別ウィンドウとして最前面にあり、JS のタッチハンドラはメイン React UI 層のタッチしか拾えない。そのためフリック帯はメイン UI 層に置く必要があり、column WebView に覆われるとタッチを受け取れなくなるため、帯の高さ分だけ WebView 側の bounds を縮めて露出させている（タブバー用に 56px を空けているのと同じ手法）。
- 実装着手前に発見した既存バグ: モバイル column WebView の bounds が、作成時は `y: 0` なのに `setActiveColumn` / `restoreMobileColumns` でのリサイズ時だけ `y: MOBILE_TAB_BAR_HEIGHT(56)` になる不整合があった。アプリが動作していたのは作成時の `y: 0` がそのまま効いていたためで、たまたま表面化していなかった。正しくは常に `y: 0` とし、`mobileColumnBounds` という単一の純粋関数に一本化している。同種のレイアウト計算を追加する際は、作成時とリサイズ時で bounds 計算ロジックが分岐していないか確認すること。
- 却下した代替案: ボリュームキーでの切り替え（メディア音量操作と競合するため）、2本指スワイプ（片手操作に不向きなため）。
- フリック判定条件: 移動量 `40px` 以上・時間 `600ms` 以内・`|dx| > |dy|` の3条件がすべて揃わないと発火しない。`onTouchMove` では確定させず `onTouchEnd` でのみ判定する。
- ネイティブ側に既存の「ブーメランジェスチャー（逆方向に引いてから折り返す）」処理があり、画像拡大中の単指パンと誤検知することがある。スワイプバー実装後もこの処理の撤去はスコープ外としており、併存したままになっている。

## グリッドレイアウトの割り切り仕様

- 縦積みで `heightMode: "fixed"` の合計が `containerHeight` を超える／下回るケースは明示的に未対応。オーバーフロー時のクリップや自動圧縮ロジックは存在せず、「空きスペースはそのまま空白になる」という割り切り仕様になっている。
- `order` フィールドは `gridRow` で代替可能になった後も、後方互換のためあえて残す設計判断をしている。
- 新規カラムはグリッドの空きセルを探すのではなく、常に「既存カラムの最大 `gridCol` + 1」（同一行に横積み）へ配置される。行方向への自動積み増しは行わない。
- ヘッダーをスクロールコンテナ内蔵の `headerRow` から、各カラム個別の `position: absolute` 要素に変更した経緯があり、`recalculateAllBounds` 実行時にヘッダーの DOM 位置も同時に更新しないとスクロール追従が壊れる。ヘッダー関連のレイアウト変更をする際は、この2つの更新が必ずセットであることに注意する。
