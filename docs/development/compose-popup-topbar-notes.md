# Compose・ポップアップ・TopBar・ウィンドウ永続化 開発ノート

投稿ポップアップ、アカウントセッション切り替え、TopBar、ウィンドウ位置永続化に関する実装時の設計判断・落とし穴を記録する。

以前はサイドバーだったが、TopBar（`src/components/TopBar/`）に置き換えられている。

## 対象ファイル

- `src-tauri/src/lib.rs` — メインウィンドウの `CloseRequested` ハンドラ

## Tauri ウィンドウの close() と destroy()（常駐ウィンドウの破棄）

`WebviewWindow::close()` は `CloseRequested` を発火してから閉じるため、`prevent_close()` + `hide()` で閉じる操作を握っている常駐ウィンドウ（例: 常駐コンポーズ `compose-`）には効かず、破棄したつもりが非表示にすり替わる。

- プログラムから確実に破棄する経路（置換・失敗時フォールバック・アプリ終了）は `destroy()` を使うこと。
- `prevent_close` を使う常駐ウィンドウを新設したら、`src-tauri/src/lib.rs` のメインウィンドウ `CloseRequested` ハンドラに明示 `destroy()` を必ず追加すること。忘れると不可視ウィンドウが残りアプリプロセスが終了しなくなる。

## ウィンドウ位置・サイズ永続化

- 実際に起きた事故と教訓: 当初案は `settings["globalSettings"]["windowBounds"]` のみを書き換える JSON 直接パッチ方式（他フィールド非破壊）だったが、実装過程で `AppSettingsData` 構造体に一度デシリアライズしてから再シリアライズする read-modify-write 方式に変わった。これが「フロント側の非同期 `saveSettings` 完了前にウィンドウを閉じると、直前のカラム設定（customCSS・NGワードなど）が古いスナップショットで上書き消失する」という実バグを引き起こしている（修正コミット: ウィンドウ終了時の `windowBounds` 保存を他フィールド非破壊にする対応）。
  - **教訓**: `CloseRequested` ハンドラで設定を保存する処理は、フロント側の非同期保存とレース条件になり得るため、対象フィールドのみを触るピンポイント更新（`merge_window_bounds` のような純粋関数）にすること。構造体経由のフル書き戻しは、他プロセス・他タイミングの書き込みと競合して危険。
- 起動時のウィンドウ位置復元は `available_monitors()` と照合し、保存位置がどのモニター矩形にも収まっていなければ位置復元をスキップする（マルチモニター構成を解除したときに画面外へ飛ぶのを防ぐため）。サイズは `max(600, ...)` / `max(400, ...)` で最小値をクランプする。

## ポップアップ（投稿・アカウントセッション切り替え）

- Tauri v2 の `WebviewWindow` は作成後に `data_directory` を変更できない。そのためポップアップのアカウント（セッション）切り替えは「現在ウィンドウを `close()` → 同位置・同サイズで新ウィンドウを再作成」という設計になっている。同種のセッション切り替え UI を今後作る際は必ずこの制約に当たる。
- ツールバー高さ（40px 相当）は TS 側の定数と、Rust 側のウィンドウ高さ計算（コンテンツ高さ + ツールバー高さ）の**両方にマジックナンバーとして重複**している。ツールバー高さを変更する場合は両方を同期する必要があり、キーボードショートカット追加時の複数箇所同期と同種のデグレしやすいポイント。
- ツールバーは `initialization_script` で DOM に `position: fixed; z-index: 99999` として注入し、`document.body.paddingTop` でコンテンツをずらす方式。これは同一 WebView 内への注入なので z-index が機能する。親子 WebView 間で z-index が機能しない（`CLAUDE.md` 記載）話とは別の話であり、混同しないこと。

## TopBar

- TopBar（`src/App.tsx` の `<TopBar>`）は `position: fixed` ではなく通常の React レイアウト内に描画される要素で、旧サイドバーのように x 座標へ手動でオフセットを加算する必要はない。折りたたみ/展開時の高さ（`getTopBarHeight` / `src/lib/gridLayout.ts` の `TOPBAR_COLLAPSED_HEIGHT` = 32px・`TOPBAR_EXPANDED_HEIGHT` = 64px）が `calculateGridBounds` の `topBarHeight` オプション経由で各カラムの `bounds.y` に加算され（`src/lib/gridLayout.ts` L102）、カラム WebView が TopBar の下に来るよう y 方向にオフセットされる。
- `handleToggleTopBar`（`src/App.tsx` L362 付近）は `setTopBarExpanded` の直後に `setTimeout(() => recalculateAllBounds(), 220)` で `recalculateAllBounds()` を遅延実行している。ただし現在の TopBar 実装（`src/components/TopBar/TopBar.tsx`）は展開時に `row2` を条件付きレンダリングで即座にマウント/アンマウントするだけで、`TopBar.module.scss` にもコンテナ自体の高さや `row2` の出現に対する CSS transition は無い（`.btn` の `width` / `background` の 200ms transition のみで、これは各ボタンのラベル表示用であり高さ変化とは無関係）。つまりこの 220ms 遅延は、旧サイドバーの「幅の CSS transition が終わるのを待つ」実装をそのまま引き継いだもので、現状の TopBar には対応する実アニメーションが無い。挙動に実害はないため残置されているが、TopBar 側に見た目の遅延復元アニメーションを新設する場合はこの `setTimeout` の値を実際の transition 時間に合わせて見直すこと。**アニメーション付きレイアウト変更で「CSS transition の完了を待ってから `recalculateAllBounds()` を呼ぶ」という設計パターン自体は、実際にアニメーションを伴う箇所を新設する際には踏襲してよい。**
- `defaultAccountId`（投稿ボタン＝TopBar の「ツイート」ボタン、`handleComposeTweet` / `src/App.tsx` L497 付近）が指すアカウントが削除済み・未設定の場合は、先頭のアカウント（`accounts[0]`）にフォールバックする設計。同じフォールバックは `linkPopupDefaultAccountId`（L486）でも使われている。「デフォルト◯◯」系の設定を追加する際の定番のエッジケース処理として参考になる。

TopBar のカラム並び替え（dnd-kit によるドラッグ）の詳細は [topbar-column-reorder-notes.md](topbar-column-reorder-notes.md) を参照。
