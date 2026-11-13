# inject ビルド・IPC定数・キーボードショートカット 開発ノート

inject スクリプトの TypeScript ビルド化、ログプラグイン、IPC 定数、キーボードショートカットに関する実装時の設計判断・落とし穴を記録する。

## 対象ファイル

- `src-tauri/src/inject/_src/**` — inject スクリプトのソース（TypeScript）
- `src-tauri/src/inject/*.js` — ビルド後の inject スクリプト（gitignore・直接編集禁止）

## inject スクリプトのビルドフロー

WebView に注入する JS は `src-tauri/src/inject/_src/` に TypeScript で書き、Vite でバンドルして `src-tauri/src/inject/*.js` に出力する。`_src` を変更した後は `npm run build:inject` が必要。ビルド済み `.js` は gitignore されており直接編集禁止。

## X 実 DOM への依存と検証ルール

inject スクリプトは X(twitter.com) の実 DOM 構造に依存する。X の DOM はセレクタ・React 内部構造とも変更されやすく、ユニットテスト（jsdom の合成 DOM）だけでは実際の挙動を保証できない。**inject スクリプトを新規作成・DOM 依存ロジックを変更する場合は、Chrome を実際に操作して実 DOM で動作確認すべきか否かをユーザーに必ず問い合わせ、必要と判断されたら claude-in-chrome で実 X ページの DOM を調査・検証してから完了とすること。**（例: 引用RT の動画は引用ツイートに属し、status リンクが DOM 上に無く React fiber の `tweet.id_str` からのみ id を取得できる、といった事実は実 DOM 調査でしか判明しない）

## inject スクリプトの制約

- inject スクリプトは Vite の `lib.entry` で IIFE 形式に個別ビルドされ、Rust の `include_str!()` はビルド後の `.js` パスを直接参照する。この構造上 **ES module の `import` が使えず、スクリプト間で定数を共有できない**。各 `.ts` ファイルの先頭に同じ値をローカルで `const` 定義する必要があり、共通定数ファイルは「参照用ドキュメント」であって import 対象ではない。定数変更時に全スクリプトへの同期が漏れやすい落とし穴。
- `window` 拡張の型定義がメインアプリ用と inject 用の**2箇所に分離**している。ビルドシステムが別なので統合できず、同じ `Window` インタフェースを拡張する型を両方で手動同期する必要がある。
- minify は意図的に無効化されている（デバッグ時にビルド後 JS をそのまま読めるようにするため）。

## tauri-plugin-log

- 出力先は標準出力のみ（`TargetKind::Stdout`）。ログレベルは `cfg!(debug_assertions)` で切り替える（デバッグビルドは `Debug`、リリースビルドは `Warn`。`src-tauri/src/lib.rs`）。「ファイル出力・ローテーション」「実行時のレベル変更」は明示的にスコープ外としている（意図的な設計判断であって見落としではない）。

## IPC 定数の同期箇所

- `eval_in_webview` 用の Rust 側テンプレート文字列には、グローバル変数名（`window.__multiColumnX` など）が**文字列として直接埋め込まれている**。グローバル変数名を変更する場合、型定義2箇所・inject 各スクリプトのローカル定数に加えて、このテンプレート文字列内の埋め込みも別途更新が必要になる。見落としやすい同期漏れポイント。
- コマンド名・イベント名・ラベルプレフィックスを変更する際は、Rust 側の IPC 定数定義・TS 側の IPC 定数定義・inject 側の参照用定数ドキュメント・各 inject スクリプトのローカル定数・両方の `window` 型定義、という**5箇所同期**が必要。ショートカット追加時の複数箇所同期と同種の、より広い範囲に及ぶ配線ルールとして把握しておくこと。

## 多言語（`__mcxI18n`）

inject の自前 UI 文言（ポップアップで開くメニュー、ヘッダーカスタマイズ、ポップアップツールバー、前回の続きへ戻るボタン、動画長押しメニュー）は日本語・英語に対応している。

- **ハブ**: `src-tauri/src/inject/_src/i18n.ts` が `window.__mcxI18n = { lang, t, setLang, apply, onChange }` を公開する。`build_init_script` / `build_popup_init_script` が `DOM_OBSERVER_HUB` の直後・他のスクリプトより前に連結する。`t` は現在言語 → ja → キー文字列の順に引く。補間は `{name}` 形式（TS 側 i18next とは独立）。
- **import しない理由**: 各エントリは独立した IIFE で、複数エントリから同じモジュールを import すると Rollup が共有チャンクを生成し、`include_str!` での連結が壊れる。そのため各エントリは必ず `window.__mcxI18n` 経由で参照する（型は `types.d.ts`）。
- **`__mcxLang` が `config` でない理由**: 初期言語は `window.__mcxLang`（"ja" | "en"）を Rust がハブより前に定義する。`config_script` の配列長・キー順は既存テストが固定しているため、言語は config に入れず別グローバルにしている。
- **辞書の追加手順**: ① `i18n.ts` の `ja` と `en` に同じキーを追加（ja は現行文言を一字一句変えない。補間変数名も揃える）② 呼び出し側で `t` / `apply` を使う（動的テキストは呼び出しごとに `t`、静的な要素は `apply` で `data-mcx-i18n*` を付けると `setLang` で自動再適用される。React 描画などは `onChange` で追従）③ `i18n.contract.test.ts`（キー集合・補間変数名の一致、日本語直書きの検出）を通す。
- **翻訳しない日本語**: X の画面（DOM）と照合する値（`hide_ad.ts` / `return_to_last_read_logic.ts` の `AD_TEXTS`、`notification_header_hide.ts` の `aria-label="通知タイムライン"`、`headerCustomizerTypes.ts` のキーと `ariaLabel`）は翻訳せず、`i18n.contract.test.ts` の許可リスト（ファイル＋部分文字列＋理由）に載せる。新たに照合用の日本語を足すときは許可リストに理由付きで追加する。未使用の許可項目が残っていてもテストが失敗する。
- **即時反映**: カラムは設定画面で言語を適用すると `useSettingsApplyHandlers.handleApplyGlobalSettings` が全カラムへ `evalInColumn(col.id, WEBVIEW_SCRIPTS.setInjectLanguage(lang))`（`window.__mcxI18n && window.__mcxI18n.setLang("en");`）を送り、再読み込みなしで切り替わる。`lang` は `resolveLanguage(normalizeLanguageSetting(...), getOsLocale())` で解決した "ja" / "en" のみ。`setInjectLanguage` は "ja" 以外を "en" に丸め、任意の文字列を埋め込まない。グローバル名 `__mcxI18n` は Rust の `globals::MCX_I18N` と `contracts/ipc-constants.json` で同期され、`__multiColumnX` と同様に `ipc.ts` の eval テンプレートへ直接埋め込まれている（名前を変えるときはここも更新）。
- **ポップアップ**: 即時反映の対象外。作成時の言語（`current_ui_lang`）で初期化され、新しく開くものから反映される。

## キーボードショートカット

- `Ctrl+A` はブラウザ標準の「全選択」と競合するため、アカウント管理には `Ctrl+Shift+A` を意図的に割り当てている（実 DOM 検証ではなく設計判断レベルの回避）。
- `Ctrl+1〜9` によるカラムジャンプは inject スクリプト側では実装しない方針。理由はカラム順序情報が WebView 側からアクセスできないため。またモバイル（Android）は非対応で、デスクトップのみの仕様。
- ショートカットの無効化はダイアログ表示状態と連動させる設計。ダイアログ表示中にショートカットキーが発火してダイアログ内の入力と衝突するのを防ぐ目的で、z-index 回避のための WebView 退避とは別軸のキーボード側の衝突対策になっている。
- テスト戦略として、各キー×各リスナー経路（window keydown / Tauri listen）ごとに個別テストを追加する一方、アンマウント後のリスナー解除確認は代表ケース1つにまとめて冗長性を避ける方針を採っている。

## 自動更新（`auto_reload.ts`）の更新方式と新着判定

対象: `src-tauri/src/inject/_src/auto_reload.ts`（`triggerReload`）と、呼び出し側の `src/`（`useAutoReload` / `App.tsx` の `handleReload` など）。X の DOM は変わりやすく、以下は 2026-09-20 に実 X（Chrome・ログイン済み）で計測した結果に基づく。

### 更新方式（ページ種別ごと）

| ページ                                                               | 方式                                    | 補足                                                                                                                   |
| -------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 検索・通知（`/search`、`/notifications`、`/notifications/mentions`） | **スクロール往復**                      | 下へ `max(現在値, 250px と高さの 50% の大きい方)` → `setTimeout` 60ms → `scrollTop = 0`。先頭へ戻した後に X が取得する |
| おすすめ・リストタブ（ホーム）                                       | 選択中タブの再クリック（`reselectTab`） | 再クリックだけで `HomeTimeline` / `ListLatestTweetsTimeline` が発火する（実測）                                        |
| フォロー中                                                           | `focus` イベント＋新着ボタンのクリック  | タブ再クリックはドロップダウンが開くだけで取得できない                                                                 |
| リスト詳細（`pageType: "list"`）                                     | **自動更新の対象外**                    | 軽い再取得の手段が無い。設定パネルの自動更新設定・カウントダウンも出さない（`isAutoReloadSupported`）                  |

スクロール往復の実測パラメータ（変更するときは必ず再計測すること）:

- 距離: **取得に必要な距離はビューポート高さの約 21〜24%**（固定値ではない）。実測: Chrome（高さ 594px）で 120px は取得なし・140px は取得あり、実アプリの検索カラム（WebView2、高さ 1424px）で 250px・300px は取得なし・350px 以上は取得あり。固定の 250px では背の高いカラムで届かず更新されなかった（2026-09-20 に実アプリで再現・修正）。現在は `max(250px, ビューポート高さ × 0.5)`（実カラムで 712px が 2/2 取得）。通知カラムも同じ距離で動く（実アプリの通知カラムで、高さ 416px は `triggerReload()` の約 105ms 後に取得。CDP でビューポートを 1424px に上書きすると 250px は取得なし・712px は取得あり。「何もしない」コントロールは 0 件で、X の 30 秒ポーリングとは区別できている）。
- 待ち: 16ms・50ms・300ms・数秒は取得される。**同一タスク内（0ms）と 1 フレーム（rAF）での即戻しは取得されない**ので、必ず `setTimeout` を使う。
- 取得は `scrollTop = 0` の約 0.06〜0.9 秒後に起きる。監視は**先頭へ戻した後**に始める（往復中は `isScrolling()` で打ち切られるため）。
- 直前の試行から約 4〜5 秒以内は取得されない例がある。自動更新の最小間隔（10 秒）では問題にならないが、二重実行ガード（`scrollRoundtripRunning`）は必要。
- 手動更新（`triggerReload(true)`）の「`scrollTop = 0` の直後に往復を開始」も、深くスクロールした状態から実測で動く。
- 検索・通知のタブは `<a role="tab">` で、`reselectTab()`（`div[role='tab']` のみ）では押せない。

### 通知ページの構造

- X 自身が約 30 秒ごとに `NotificationsTimeline`（と `ViewerBadgeCounts`）をポーリングしている。検証では操作直後のリクエストを因果と見なさず、必ずこの周期と区別すること。
- article は 2 種類。`data-testid="tweet"`（返信・メンション。status リンクと `time` を持つ）と `data-testid="notification"`（いいね・リポスト・フォロー。**status リンクが無い**が `time[datetime]` はある）。
- `time[datetime]` は ISO 8601 UTC（例 `2026-09-19T00:45:55.510Z`）。

### 新着判定

- 旧方式（監視開始時のスナップショットに無い ID が現れたら新着）は、おすすめのように取得のたびに表示が入れ替わるタイムラインで、更新のたびに誤って新着と報告した（実測 8/8）。
- 現方式: ページを開いてから**見たことのある最大の status ID より新しい ID** が現れたときだけ新着とする（`createNewnessTracker`。ID の大小は数値文字列の比較 `compareStatusIds`。BigInt は inject のビルドターゲットに依存させないため使わない）。実測の誤報告は 8 回中 2 回まで減った。
- 通知ページは ID ではなく `time[datetime]` の最大値（`collectMaxNotificationTimeMs`）で判定する。いいね等の通知には ID が無いため。
- 基準はページ読み込み（IIFE 再実行）でリセットされる。古いが未見のおすすめ投稿は新着として数えない。
- ユーザーがスクロール中は報告しない（仮想リストの入れ替えの誤検出ガード）。通常ページの監視窓では見えた値を基準へ取り込む。

### 通知・検索ページの常時監視（ずれの即時補正と新着の報告）

- **背景（2026-10-07 実測、実アプリの通知カラム）**: X 自身の約 30 秒周期のポーリングが新着を先頭へ挿入すると、**先頭（`scrollTop` 0）を表示していても旧先頭の位置が保たれ、`scrollTop` が 0→136 のようにずれる**（新着は画面の上に押し出される）。自動更新の監視窓（30 秒）や先頭固定（1.5 秒）の外で起きるため、更新時だけの補正では次の自動更新まで新着が見えず、報告もされなかった。さらにページを開いて最初の自動更新より前にずれると「ユーザーのスクロール」とみなされ、`triggerReload` が `isScrolling()` で毎回 return して自動更新が止まったままになった。基準も最初の自動更新で初めて作られていたため、それまでに入った新着は報告されなかった。
- **方式**: 通知・検索ページで scroll イベントと DOM 変化（`document.body` の childList+subtree）を常時監視する（`handleScrollRoundtripPageChange`）。
  - ずれの補正（`correctExternalScrollOffset`）: 最後に観測した位置（`lastObservedTop`、初期値 `null`）が 0 で、今が 0 より下なら、ユーザーによるスクロールの可能性が無い限り `scrollTop = 0` に戻す。先頭以外→先頭以外の変化は補正しない。
  - ユーザーによるスクロールの可能性（`isLikelyUserScroll`。誤判定は常にこちらへ倒す）: ユーザー入力（`wheel` / `touchstart` / `keydown` / `mousedown`）から 1000ms 以内、マウスボタン・タッチが押されたまま（`mouseup` / `touchend` / `touchcancel` / `blur` まで）、ページを開いてから・`popstate`（戻る/進む）から 2000ms 以内（X が表示位置を復元することがあるため）。**縦に動かないホイール（`deltaY === 0`）は数えない**（カラム群の横スクロールを `scroll_event.ts` が親へ中継するため、数えると横スクロール直後の挿入でずれたまま固着する）。
  - 新着の報告: 先頭を表示している間に `absorb` が基準より新しいものを見つけたら、その場で報告する。基準が無ければ基準になるだけ（ページを開いて最初に表示された一覧は報告しない）。**先頭以外を表示している間は基準へ取り込まない**（取り込むと、下を読んでいる間に先頭へ入った新着が黙って吸収され、先頭へ戻っても報告されない）。先頭へ戻ったときの scroll イベントで報告される。
  - 自動更新のスクロール往復の実行中（`scrollRoundtripRunning`）は補正・判定とも何もしない（往復の下方向スクロールを打ち消さないため）。
  - 既存の更新時の判定（`primeNewnessBaseline` / `waitForNewTweet` / 先頭固定）は残している。同じ tracker を共有するので二重報告にはならない。
- **DOM 監視に共有ハブ（`dom_observer.ts`）を使わない理由**: ハブは requestAnimationFrame でまとめて配信するため、描画されていないカラム（Android の非アクティブタブ、ダイアログ表示中に退避したカラム）では止まり、見ていないカラムの新着報告が遅れる。
- **多重注入対策**: `window.__multiColumnX.disposeAutoReloadWatchers` で前回の監視を解除してから登録する（単体テストはモジュールを読み込み直すため、これが無いと前のテストのインスタンスが干渉する）。
- **不採用**: 「自分で先頭へ戻したことがあるか（`hasProgrammaticTop`）＋ユーザー操作フラグ」方式（PR #204 の初版）。ずれは更新時にしか直らず、起動直後のデッドロックも解消できない。先頭でホイールを回しただけで、次に自分で先頭へ戻すまでユーザー扱いが続く。
- **既知の限界**: 先頭でホイールを回した直後（1 秒以内）に X が挿入するとユーザー扱いになり、ユーザーが動かすまで自動更新が止まる（安全側）。WebView2 ではスクロールバーの押下で `mousedown` が届くことを CDP で確認済み（2026-10-07）。他プラットフォームのスクロールバー・実機（Android / macOS / Linux）は手動テストで確認する。
- **計測時の注意**: 往復スクロールの直後に `NotificationsTimeline` の取得が起きない回があった（2026-10-07、高さ 336px の通知カラム。初回自動更新・手動更新とも、取得は X の 30 秒周期だけ）。上記「スクロール往復の実測パラメータ」の「約 105ms 後に取得」と食い違うため、往復の効き方は再計測が必要。`__TAURI_INTERNALS__.invoke` は書き換えられず、Tauri の IPC は CDP の Network にも出ないので、報告の確認はメインウィンドウ（`http://localhost:1420/`、`%LOCALAPPDATA%\com.natsuyasai.multicolumnx\EBWebView\DevToolsActivePort`）の未読バッジ（`[data-testid="unread-badge"]`）で行う。

### 開発ビルドでの自動更新の二重実行（`useAutoReload`）

`setRemaining` の更新関数の中で `invoke` していたため、`React.StrictMode`（`src/main.tsx`）の開発ビルドでは更新関数が 2 回実行され、自動更新ごとに `triggerReload` が同じミリ秒に 2 回呼ばれていた（2026-10-07 実測。リリースビルドでは 1 回）。残り秒数を ref で持ち、副作用は `setInterval` のコールバック本体で行う。state の更新関数に副作用を書かないこと。

### 自動更新と手動更新のスクリプト

- `WEBVIEW_SCRIPTS.TRIGGER_RELOAD`（`triggerReload()`）: **自動更新用**。ユーザーが手動でスクロール中は何もしない。
- `WEBVIEW_SCRIPTS.SCROLL_TOP_AND_RELOAD`（`triggerReload(true)`）: **手動更新用**。スクロール位置にかかわらず先頭へ戻して更新する。ヘッダー・設定パネルの更新、`r` キー、先頭スクロールボタン・ダブルタップ、設定「適用」、公式設定配布の配布元カラムの表示更新で使う。既知の副作用: 配布のたびに配布元の閲覧中カラムが先頭へ飛ぶ。
- タブ操作ダイアログの「再読み込み」は `handleReloadPage`（デスクトップは WebView 再作成、モバイルは `location.reload`）で、`triggerReload` を通らない。ページごと作り直すので常に先頭から始まる。

### 実アプリ（WebView2）での検証手順

Chrome 拡張だけでは、カラムの寸法など実アプリ固有の条件（例: 高さ 1424px）を再現できない。実アプリの検証は、`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=0 --remote-allow-origins=*"` を付けて `npm run tauri:dev` し、アカウントごとのデータフォルダ（`%APPDATA%\com.natsuyasai.multicolumnx\accounts\<id>\EBWebView\DevToolsActivePort`）の 1 行目のポートに CDP（`http://127.0.0.1:<port>/json`）で接続する。ポートを固定（9222 等）にすると、アカウントごとに別の WebView2 環境が起動するため最初の 1 つしか取れない。inject を変更したら `npm run build:inject` を実行すると、開発起動中のアプリが再ビルドされる。

### 未確認事項

- 通知・検索のスクロール往復は通常の Chrome での実測のみ。macOS/Linux/Android のネイティブ WebView での `scrollingElement` とスクロールイベントの挙動は未確認（手動テストで確認する）。
- 体感（位置ジャンプの見え方）は目視での評価が必要。
- フォロー中の更新間隔は最低 1 分が必要とのユーザー申告があるが、実測では未確認。60 秒未満のカラムへの警告や下限は設けていない。

## 手動更新のローディングバー（Issue #264）

対象: `auto_reload.ts` の「手動更新のローディングバー」節（`showLoadingBar` 〜 `installTimelineXhrObserver`、`triggerReload` 内の `startRefreshLoading`）と、純粋ロジックの `refresh_loading_logic.ts`（`auto_reload.ts` からのみ import）。スマホなどでダブルタップしても取得中なのか開始できていないのか分からない、という問題への対応で、カラム上部に細いバーを出す。

### 対象と終了条件

- 対象は `triggerReload(true)`（手動更新）と、X 自身が処理する更新操作（下記）。自動更新（`triggerReload()`）とプルダウン更新は対象外。`isScrolling()` で更新自体がスキップされたときは出さない（`startRefreshLoading` は `isScrolling()` の直後）。
- **X 自身の更新操作**（`startWatchers()` が `window` の `click` / `keydown`（capture, passive）を購読し、判定が真なら `startRefreshLoading()`。dispose で解除。ページ種別の制限なし）:
  - 選択中（`aria-selected="true"`）で `aria-expanded` を持たない `div[role="tab"]` のクリック／タップ。選択中でないタブの切替は対象外。
  - タイムライン内の新着ポストのピル／ボタン（投稿を含まないセル内の `button[type="button"]`。`UserCell` を除く。`section[aria-labelledby]` 内）。
  - 「.」キー（修飾キー無し・入力欄以外）。
- 判定は `refresh_loading_logic.ts` の `isLoadingRefreshClickTarget` / `isLoadingRefreshShortcut` / `isEditableKeyTarget`。これは `return_to_last_read_logic.ts` の `isRefreshClickTarget` / `isRefreshShortcut` / `isEditableEventTarget` と**同じ条件の複製**。`return_to_last_read_logic.ts` は別 inject エントリのため `auto_reload.ts` から import できない（共有チャンクが生じ、`include_str!` 連結が壊れる）。連結後のトップレベル名の重複を避けるため別名にしている。**判定条件を変えるときは両方を揃えること**（前回の境目へ戻る機能側も同様）。
- 終了条件は、手動更新の**後に始まった** GraphQL `*Timeline` の XHR がすべて完了（`loadend`）したら、最低表示 400ms 経過後に消える。取得が一度も始まらなければ 1.5 秒で消える。全体の上限は 15 秒。ページ遷移（`location.pathname` の変化）でも消える。
- 評価は 250ms の `setInterval`（バー表示中のみ動かす）。

### 実測（2026-11-05、WebView2 + CDP、実アカウント）

- ホーム `HomeTimeline`: 更新の約 7ms 後に開始し、約 0.7 秒で完了。
- リスト `ListLatestTweetsTimeline`: 約 9ms 後に開始し、約 0.3 秒で完了。
- 通知: 更新直後に取得なし（`NotificationsTimeline` は X の約 30 秒ポーリングで起きるだけ）。取得が起きないので 1.5 秒で消える。
- `flow/timeline.json` は約 3 秒ごとの定期ポーリングで更新と無関係なので対象外（`isTimelineRequestUrl` は GraphQL の `*Timeline` だけを真にする）。
- X 自身の更新操作: リスト「情報」のアクティブなタブをクリック → 約 5ms 後に `ListLatestTweetsTimeline` が開始し、約 0.3 秒で完了。クリックは capture で X の処理より先に呼ばれるため、直後に始まる XHR は追跡対象になる。
- **未計測**: 検索（`SearchTimeline`）、フォロー中（`HomeLatestTimeline`）、Android 実機。スクロール済みの状態でのタブ名クリック（X が先頭へ戻すだけで取得しない可能性）は**未確定**（手動確認項目）。

### 上限 15 秒の根拠

X の XHR ラッパーは `timeout` の既定が 0（無制限）で固定のタイムアウト値が無く、モバイル回線では約 10 秒待つことがあるため。取得が止まったままでも 15 秒で必ず消える。

### 落とし穴

- XHR パッチは `api_rate_limit_monitor.ts` とは**別のフラグ**（`__mcxLoadingXhrPatched`）で 1 回だけ行う（監視設定に左右されない）。再注入時はパッチを重ねず `window.__mcxTimelineXhrListener` を差し替える。
- バーは `document.documentElement` 直下に置き、`pointer-events: none`・`aria-hidden="true"`。`prefers-reduced-motion` では静止表示にする。不確定アニメーションは `transform` のみでレイアウトを動かさない。
- バーを隠すときは要素ごと `remove()` する（再表示時に作り直す。値が変わるときだけ代入して MutationObserver とのループを避ける）。
- 手動更新の前から進行中だった取得は追跡しない（`requestStarted` は表示中のみ pending に入れる）。再度の手動更新ではバーは 1 本のまま、起点時刻だけ更新する。

### 不採用案

- 固定時間だけ表示: 更新の実態と無関係で、遅い回線で早く消える。
- X の DOM のスピナーの消滅待ち: X の DOM 変更に弱い。
- React 側（タブ）へのイベント: IPC・ACL の追加が必要で、カラム内の見た目にも合わない。

### 手動確認が必要な点

- Android 実機（スワイプ領域のダブルタップ）、検索・フォロー中の取得タイミングの実測、ライト／ダーク両テーマでの見え方。

## 前回の境目へ戻るボタン（`return_to_last_read.ts`）

対象: `src-tauri/src/inject/_src/return_to_last_read.ts`（DOM グルー・IIFE）と `return_to_last_read_logic.ts`（純粋ロジック）、カラム設定 `returnToLastReadEnabled`（既定 false）。ホームカラム（`pageType: "home"`）にだけ注入し、設定は `WEBVIEW_SCRIPTS.applyReturnToLastRead` → `setReturnToLastReadEnabled` で即時に切り替える（`handleApplySettings` は WebView を作り直さないため、「ON のときだけ注入」方式では再起動まで反映されない）。以下は 2026-09-23 に実 X（Chrome・ログイン済み）で計測・検証した結果。

### タブごとの更新後の並び（実測）

| タブ       | 取得の手段（`auto_reload.ts`、変更なし）       | 更新後の並び                                                                                                                                                                                                                                                  |
| ---------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| フォロー中 | `focus` → 「N 件のポストを表示」セルのクリック | 新着が先頭側に入る。更新前の先頭数件は**連続したまま**下に残るが、それより下の旧投稿の一部が新着の間へ**移動**する（70 件取得時、旧 #0〜#5 は 66〜71 番目に連続、旧 #6/#7/#9/#13/#14 は新着の間へ）。旧 #0 だけが先頭に残り、旧 #1 以降が下に連続した例もある |
| おすすめ   | 選択中タブの再クリック                         | 新着が先頭に入り、旧投稿は同順で下に残った                                                                                                                                                                                                                    |
| リストタブ | 選択中タブの再クリック（ボタン無しで即挿入）   | 新着が先頭に入り、旧投稿は同順で下に残った                                                                                                                                                                                                                    |

- フォロー中（「人気」並び）とおすすめは、投稿時刻も status ID も時系列に並ばない。**時刻・ID の大小で近い投稿を推定するフォールバックは使えない**。
- 旧 #0 と旧 #1 の間に status ID を持たない article（プロモーション）が挟まる例があった。

### 設計判断

- **基準**: 更新直前の「先頭から広告・ID 無し・非表示を除いた最大 5 件」。更新した瞬間の DOM ではなく、**最後に先頭（`scrollTop ≤ 1` かつ `translateY(0px)` のセルが描画済み）にいたときのスナップショット**を使う。手動更新 `triggerReload(true)` は `scrollTop = 0` と同じ tick で取得を始め、その時点の仮想リストはまだ深い位置のセルしか描画していないため。
- **戻り先**: 基準 ID が隣接して（広告等を除いた並びで）基準内の順に 2 件続く最初の位置。新着の間へ移動した旧投稿（単独の基準 ID）は飛ばす。連続が無ければ最も下で見つかった単独の基準へ戻る。基準が 1 件だけなら単独一致で確定。
- **ボタン表示**: 先頭が基準に無い、または先頭が基準でもその直下が「基準内でより後ろの基準」でないとき。
- **閉じるボタン**: 戻るボタンの右隣に丸い「×」を置く（2 つをコンテナ `#mcx-return-to-last-read-container` にまとめ、表示/非表示はコンテナ単位）。押すと戻らずに消え、境目は消化扱いになる（次の更新で新しい基準を記録）。探索中は押せない。
- **消化**: ボタンで戻ったとき、閉じるボタンで閉じたとき、または**直前 1000ms 以内のユーザー入力（wheel/touch/mousedown/スクロール系キー）を伴うスクロール**で戻り先が画面に入ったとき。自前のスクロール（`scrollTop = 0`・探索）で消化・中断しないための条件。未消化の間は次の更新で基準を上書きしない。タブ名が変わったら破棄（タブ名が一時的に取れない `null` のときは破棄しない）。
- **更新の検知**: `window.__multiColumnX.triggerReload` をラップする。そのため `build_init_script` で **`auto_reload` より後ろに連結**する必要がある（Rust のテストで順序を検証）。
- **x.com 上の直接更新操作の検知**（2026-10-03）: アプリ経由でなくても、次の操作で `reload` を記録する。いずれも `recordReload()`（`triggerReload` のラップと共通）を呼び、`window` の capture 相・passive リスナーで X 自身のハンドラより先に動く。判定の純粋部分は `return_to_last_read_logic.ts`（`isRefreshClickTarget` / `isPullRefreshGesture` / `isRefreshShortcut`）。
  - 新着ピルのクリック: タイムライン内で投稿（`article`）を含まないセルの `button[type="button"]`（`UserCell` を除く）。**`auto_reload.ts` の `findNewPostsButton` と同じ条件を複製している**ため、X の DOM 変更時は両方を直す。
  - 選択中タブの再クリック: `aria-selected="true"` かつ `aria-expanded` を持たない `div[role="tab"]`（`reselectTab` と同じ条件）。フォロー中タブは `aria-expanded` を持ち、クリックはドロップダウンを開くだけで更新ではないため対象外。未選択タブのクリックは更新ではなく、タブ切り替えとして既存の `tabChanged` が基準を破棄する。
  - プルダウン更新（モバイル）: 1 本指で先頭（`scrollTop <= 1`）から始まり先頭のまま終わり、下方向へ `PULL_REFRESH_MIN_DISTANCE_PX`（暫定 80px）以上、かつ縦移動が横移動より大きい `touchstart` → `touchend`。**80px は未計測の暫定値**。長すぎると基準が記録されずボタンが出ない。短すぎても新着が無ければボタンは出ない（`topUpdated` が判定する）ので、迷ったら短めに倒す。
  - 更新ショートカット: 修飾キー無しの `.`（X の「新しいポストを読み込む」）。`input` / `textarea` / `select` / `contenteditable` / `role="textbox"` の中では対象外。
  - **アプリ自身の更新との二重記録は `isTrusted` で弾かず、reducer の冪等性に任せる**。`auto_reload.ts` の合成 `.click()` もこれらのリスナーに届くが、`reload` は `anchorIds === null || consumed` のときしか記録されないため、同じ更新の 2 回目は無視される。
  - 探索中（`isAnySearching()`）・ホーム以外・設定 OFF のときは記録しない（`recordReload()` のガード）。設定 OFF の間に記録すると、後で ON にしたときに古い基準が残る。
  - 落とし穴: `touchstart` は `handleUserInput` により「直近のユーザー入力」として扱われる。そのためプルダウン直後の `scroll` で基準側の投稿が画面内に見えていると `targetSeenByUser` で消化され、ボタンは出ない（基準側が見えているので境目は分かる、という既存の消化ルールどおり）。結合テストで否定系を書くときは、基準側を画面外に置かないと「誤って記録されてもボタンが出ない」空振りのテストになる（実際に発生した）。
  - 実 X（Chrome・ログイン済み、2026-10-03）で確認済み: 判定関数をページに注入し capture 相のリスナーで記録した。`フォロー中`（選択中・`aria-expanded` あり）は判定 false、`おすすめ` は未選択時のクリックが false・選択中の再クリックが true（`isTrusted` true、クリック対象は内側の `span`）、ボディ上の `.` は true。クリック対象は内側の要素なので `closest()` での判定が必須。
  - 未確認（実機・実 DOM）: 新着ピル（検証時にピルが出ておらず未確認）、プルダウンの発火距離、`.` で X が実際に新着を読み込むフォーカス状態、Android でのピル・タブのタッチ操作が `click` として届くこと。
- **描画の差分更新**: ボタン・トーストの `textContent` などは値が変わるときだけ代入する。無条件に代入すると、自分の描画が共有 DOM 監視ハブ（`document.body` の childList+subtree）に拾われて再描画を呼ぶ無限ループになる（テストでハングして発覚）。

### 探索パラメータ（実測。変更時は再計測すること）

約 66 件下にある境目へ、先頭から探索した結果（ビューポート高さ 849px）:

| スクロール幅（× ビューポート高さ） | 待ち (ms) | 結果                             | 所要   |
| ---------------------------------- | --------- | -------------------------------- | ------ |
| 1.0                                | 80        | 正解（旧 #0）                    | 4.3 秒 |
| 1.0                                | 50        | 正解                             | 3.1 秒 |
| 1.5                                | 80        | 正解                             | 3.1 秒 |
| 2.0                                | 80        | **旧 #0 を飛ばして旧 #1 に着地** | 2.4 秒 |

- 採用値は 1.0 倍・80ms、上限 150 ステップ。末尾では `scrollHeight` の増加を最大 3000ms 待つ。単独の基準を見つけてから 30 ステップ以内に連続が見つからなければ打ち切る。
- 位置合わせは `scrollTop += rect.top - (div[role="tablist"] の bottom)` を 1 回代入するだけで、500ms 後もずれ 0（タブバー下端 53px）。
- ビルドしたスクリプトを実 X に注入した通し確認（リストタブ）: 更新で新着 2 件 → ボタン表示 → クリックで基準の 1 件目がタブバー直下（53px）に来て、ボタンが消えることを確認。

### 落とし穴

- `return_to_last_read_logic.ts` は `return_to_last_read.ts` からだけ import する。**複数のエントリから import したモジュールは Rollup が共有チャンク（`import` 文付き）として出力し、`include_str!` の単純連結が壊れる**。また `auto_reload.ts` は IIFE の副作用があるので import できない。そのため `extractStatusId` 相当の処理は複製している。
- 連結後の init script は 1 本のスクリプトなので、**トップレベルの `function` / `const` 名がファイル間で重複すると、後勝ちの上書き（function）や SyntaxError（const）になる**。複製した関数は別名にしている。
- Chrome の計測では、タブが背面（`visibilityState: hidden`）だと仮想リストが描画されず、スクロール系の計測が不正確になる。

### 未確認事項

- フォロー中タブでのボタン表示から戻り動作までの通し確認（検証時は新着が出なかった）、Android のボタン位置（`__mobileBottomInset`・スワイプバーとの重なり）、ヘッダー非表示設定時の上端位置、ライト/ダークでの見え方は手動テストで確認する。

## 写真閲覧後のスクロール位置復元（`return_to_last_read.ts` に統合）

旧 `scroll_pos_restore.ts`（localStorage に写真 URL を保存し、500px ずつスクロールしてリンクを探す独自処理）は廃止し、`return_to_last_read.ts` に統合した（2026-10-03）。

- 設定は `scrollPosRestoreEnabled`（カラム設定）。「画像を縮小表示」が ON のときだけ UI に表示し、縮小を OFF にすると復元設定も false に書き換える。Rust 側でも `scroll_pos_restore_enabled && small_image_enabled` を実効値として config（`window.__multiColumnXConfig.scrollPosRestoreEnabled`）に渡す（旧データ保護）。注入は config 経由で、ボタン機能（`returnToLastReadEnabled`）とは独立。config は WebView 生成時の値で、設定適用での即時反映はしない（旧実装も同じ）。
- ホームで写真リンクをクリックしたとき、`closest("article")` のステータス ID をモジュール内変数 `pendingPhotoReturnId` に保存する。写真 → ホームの遷移（popstate / pushState）を検知したら、`waitForTimelineReady`（100ms ポーリング・上限 5 秒、ホーム離脱 or ユーザー入力で中止）でタイムライン表示を待ち、`searchReturnTarget([id])` で上端に合わせる。見つからなければ「前回の位置が見つかりませんでした」のトースト。
- 写真復元中は `photoRestoring` を立てて他機能と排他するが、`render()` の可視判定には混ぜない（「探しています…」ボタンを出さないため）。
- 未検証（実機）: X 実 DOM での article からの ID 取得、5 秒上限の十分性、ネイティブ WebView ごとの pushState/popstate の挙動。

## 動画の自動再生（`popup_video_autoplay.ts` / `mediaviewer_autoplay.ts`）

### document 生成時の inject で守ること（2026-11-03 の不具合）

- inject は document 生成時に走るため、その時点では `document.documentElement` / `document.body` が **null** のことがある。冒頭で `documentElement.hasAttribute(...)` のような属性ガードを書くと TypeError で即死する（`popup_video_autoplay.ts` が PC で動かなかった原因）。
- 多重起動防止は DOM 属性ではなく `window` 変数（`__mcxVideoAutoplayStarted` / `__mcxMediaviewerAutoplayStarted`）で行い、DOM の操作は body が出現してから始める。
- **jsdom では `documentElement` / `body` が常に存在するため、単体テストでは再現しない。** document 生成時に走る inject を書く・直すときは、`documentElement` / `body` を null にした状態で例外なく開始し、body 出現後に動き出す回帰テストを必ず書く。

### ポップアップ（PC）の実機 DOM（2026-11-03、WebView2 + CDP で確認）

- 初期表示には `video` 要素が無く、`button[data-testid="playButton"]` だけがある。playButton を click すると X が `video` を生成し、X 自身が `play()` する。
- 完了条件は「再生が確認できたこと」（`video` の生成だけでは完了にしない）。
- カルーセルでは playButton が複数ある。現仕様は先頭のみ click する。

### モバイルの動画拡大表示（`mediaviewer_autoplay.ts`）

- モバイルでは動画タップ後にカラム内で X 標準の拡大表示（パス末尾 `/mediaviewer`。大文字小文字は区別しない）になる。モバイルのカラム init script にのみ、`video_control` の直後に連結する。設定項目は無く常に有効。
- 状態は mediaviewer に入るたびの「訪問」ごとに作り直す。訪問の同一性はパスを小文字化して比較する（X のパス書き換えで再開始しない）。対象の video は、画面内で見えている面積が最大のもの（`pickMostVisibleVideo`。全て面積 0 なら先頭）。playButton の click / `video.play()`（拒否時はミュートで再試行）を試み、再生確認後は何もしない。10 秒で打ち切る。タイムラインのインライン動画には触れない。
- DOM 監視は共有ハブ `window.__mcxDomObserver`（無ければ `MutationObserver`）と `popstate`。購読は常駐させ、各コールバックは `pathname` の比較だけで抜けるようにして軽量に保つ。
- `history.pushState` / `replaceState` のモンキーパッチはしない（他機能・X 本体との干渉を避けるため）。そのため、ハブも `popstate` も拾えない遷移は取りこぼす可能性がある。
- 同じ inject ファイル間は import できない（ES の複数エントリ・連結注入）ため、`isMediaViewerPath` は `video_control.ts` と同等のものを複製している。どちらかを変えたらもう一方も揃える。
- **実測結果（2026-11-03、Android エミュレータの WebView を CDP で実測）**:
  - 動画タップ後、パスは `/<user>/status/<id>/mediaviewer`（小文字）になり、約 100ms 後に `/mediaViewer`（V が大文字）へ書き換わる。大文字小文字を区別する判定だと書き換え後を拡大表示と認識できない。
  - `button[data-testid="playButton"]` は無い。`video` は 2 個（`[data-testid="videoComponent"]` 内、blob: ソース）で、1 つ目が現在のポストの動画（画面内）、2 つ目が次のポストの動画（画面のすぐ外）。X 自身が `play()` を何度も呼ぶ。
  - `video_control` も同じ正規表現でパスを判定しており、大文字パスを拡大表示と認識できず「最初の 1 回だけ通して直後に pause、以降の `play()` は握りつぶす」で X の再生を止めていた。これが再生されない主因だった。`isMediaViewerPath` を `i` フラグ付きにして解消した。
  - 修正後の再生確認は Android 実機での手動テスト（`integration-test.md`）で行う。

## 広告の非表示（`hide_ad.ts` / `hide_ad_matcher.ts`）

### 判定の手がかり（2026-11-13、WebView2 + CDP、実アカウントで実測）

- 従来の `placementTracking` や `span` の完全一致「Ad」では拾えない広告パターンがおすすめタブに出る。ラベルは `span` ではなく `<a role="link">` 自体の本文「Ad from starlink.com」（`Ad from <広告主ドメイン>`）で、`placementTracking` は無い。
- 同じ広告の外部リンク（`a[href]`）には広告計測用の `twclid` クエリが付く（`utm_medium=paid` も併記）。表示言語に依存しない手がかりとして `twclid` も判定に使う。
- 判定は `span, a` の本文が `^Ad from\s+\S`（大小無視）に一致するか、外部リンクに `twclid` があるか。本文中の「Ad from」は前方一致のため誤判定しない。
- `twclid` はサンプル数が少ない（スターリンク／コルセア／アマゾン／ヤプリの広告で確認）。通常ポストの外部リンクには付かない前提。誤判定が報告されたら見直すこと。

### 落とし穴: inject のトップレベル宣言名は全ファイルで一意にする

- inject スクリプトは `mod.rs` で 1 本に連結して実行される。トップレベルの `const` / `function` の名前が他の inject と重複すると、再宣言の SyntaxError で**連結スクリプト全体が動かず、全カラムの注入（設定含む）が消える**。単体テストは各ファイル単独で動くため検出できない。
- 実例: `hide_ad_matcher.ts` を新設した際、トップレベルの `AD_TEXTS` が `return_to_last_read.js` の同名と衝突した。matcher にはモジュール固有の接頭辞を付ける（`HIDE_AD_TEXTS` など）。
- 検出: `inject_concat.contract.test.ts` が、ビルド済み inject を連結して構文チェックする（`build:inject` 後に有効）。`mod.rs` に inject を追加したらこのテストの対象リストにも追加する。
- 実機で CDP から検証するときは `Page.reload` しない（注入済みの設定が消える）。アプリを再起動して確認する。
