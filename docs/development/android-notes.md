# Android 開発ノート

Android 対応（アカウント追加、モバイルタブバー、APK 自己更新、Cookie 共有）に関する実装時の設計判断・落とし穴を記録する。

## 対象ファイル

- `src-tauri/gen/android/` 配下（app モジュール全体） — 単体テスト実行方法
- `src-tauri/gen/android/app/src/main/java/com/natsuyasai/multicolumnx/MainActivity.kt` / `src-tauri/gen/android/app/proguard-rules.pro` — ProGuard keep ルール同期
- `src-tauri/gen/android/app/src/main/java/com/natsuyasai/multicolumnx/MainActivity.kt` / `MainPageBack.kt` — 端末の戻る操作
- `src-tauri/gen/android/app/src/main/java/com/natsuyasai/multicolumnx/BackupFileSelector.kt` / `MultiColumnXBackupAgent.kt` — 端末引き継ぎ（Auto Backup）対応
- `MediaPopupBridge.kt` / `MediaPopupFlagSync.kt` / `MainActivity.kt`、`src-tauri/src/android_bridge.rs`、`src-tauri/src/commands/webview/popup.rs`、`src/services/mediaPopup.ts`、`src-tauri/src/inject/_src/image_popup.ts` / `video_long_press_menu.ts` — メディアのポップアップ（複数カラム表示時）

## Android の単体テスト実行

app モジュールの variant は universal フレーバー付きのため、`./gradlew.bat testDebugUnitTest` では **app のテストは実行されない**。`cd src-tauri/gen/android && ./gradlew.bat :app:testUniversalDebugUnitTest` を使うこと。

### 新しい git worktree での生成ファイル

gitignore 対象の Android 生成ファイル（`src-tauri/gen/android/tauri.settings.gradle`、`src-tauri/gen/android/app/tauri.build.gradle.kts`、`src-tauri/gen/android/app/tauri.properties`）は新しい git worktree には存在せず、`npm run format` の Kotlin 部や Android 単体テストが失敗する。元のリポジトリから同じパスへコピーすること。

## Android ProGuard keep ルールの同期

`android_bridge.rs` が `env.call_method()` で文字列指定して呼び出す `MainActivity` のメソッドは、リリースビルドで R8 に難読化されると `NoSuchMethodException` が発生して WebView が作成されない。

**`MainActivity.kt` のメソッドシグネチャを変更したら、必ず `src-tauri/gen/android/app/proguard-rules.pro` も同時に更新すること。**

対象操作と対応ルール:

- メソッドを追加 → `-keepclassmembers` に同じシグネチャのエントリを追加
- 引数を追加・削除 → keep ルールの型リストを新シグネチャに合わせて更新
- メソッドを削除 → keep ルールからそのエントリを削除

デバッグビルドでは R8 が無効なため症状が出ず、リリースビルドで初めてクラッシュする。変更後はリリースビルドで動作確認すること。

## 端末の戻る操作（メイン画面への問い合わせ）

`MainActivity.handleOnBackPressed` の処理順は、①ポップアップが開いていれば最前面を閉じる → ②メイン WebView に `window.__mcxHandleBack()` を `evaluateJavascript` で問い合わせ、画面側（開いているダイアログ・ポップオーバー・アプリ設定の詳細画面など。`ModalDialog` がマウント中は共通で登録する）が処理したら終了 → ③アクティブカラムの履歴を戻る → ④バックグラウンドへ（`moveTaskToBack`）。

- メイン WebView の参照は、自動生成ファイル `WryActivity.kt`（編集不可）を触らず、`MainActivity` の `onWebViewCreate` オーバーライドで受け取っている。ProGuard の keep ルールの変更は不要（Rust から文字列指定で呼ぶメソッドではないため）。
- 判定ロジックは `MainPageBack.kt`（純粋関数）に切り出して JVM 単体テストしている。画面側の登録方法（`useAndroidBackHandler`）を含む詳細は `settings-panel-navigation-notes.md` を参照。

## アカウント追加（別 Activity 方式）

- `window.add_child()` は Tauri 2 の Android 実装では使用不可。当初アカウント追加もポップアップと同様 `add_child()` で実装予定だったが不可能と判明し、別 Activity 方式（`WebviewWindowBuilder` を使用し、ラベルのケバブケースがパスカルケースの Activity クラス名に対応、`AndroidManifest.xml` に登録）に変更した。
- `WebviewWindowBuilder::build()` を呼んだ直後、Android の IPC ルーティング先が新規 Activity の WebView に切り替わる。そのままコマンドが `Ok(...)` を返すと、コールバックが新規 Activity 側に届いてしまい、呼び出し元（メイン WebView）の `invoke()` Promise が永久に unresolved になる。対策として `build()` を `tokio::spawn` 内に隔離し、`Ok(...)` を `build()` より先に返している。
- x.com は SPA であり、ログイン後の `/home` 遷移は `pushState` によるもの。Android WebView の `onPageStarted` は `pushState` では発火しないため、Rust 側の `WebviewWindow::url()` ポーリングでは遷移を検知できない（デスクトップ版は Chromium の挙動でこのポーリングが機能するため非対称）。対策として `location.pathname` を見る init script 経由の JS ポーリングに切り替えている。
- Rust から `window.close()` しても Android の別 Activity（アカウント追加用）は閉じない（multi-window の close dispatch が機能しない）。sentinel ファイル（`app_data_dir()` 配下の完了通知ファイル）を Kotlin 側が 500ms ポーリングして `finish()` する方式で回避している。
- 前面 Activity（アカウント追加用）がある間、MainActivity の WebView は Android に suspend されるため、Rust から `emit()` してもメイン側 JS は実行されずイベントを受信できない。そのため `document.visibilitychange`（可視化時に1回確認）を主系、遅延 emit を副系とする二重経路を設けている。
- リスクとして残っている点: `WebviewBuilder::data_directory()` によるアカウント間セッション分離は、Android ではデスクトップほど確実ではない可能性がある。複数アカウントを実機で分離検証する際は注意すること。

## モバイルタブバー（inject 方式からの方針転換）

- 当初は X の DOM に注入するスクリプトでタブバーを実装していたが、column WebView（x.com を表示する外部 WebView）には Tauri の IPC ブリッジが注入されないため、タブバー自体は見えるのに操作が一切効かないという不具合があった。**inject スクリプトはメイン React アプリの UI 代替を担えない**（IPC 制約）という教訓から、この方式は全面撤去している。
- 代わりに React 側の `MobileTabBar` を column WebView の下にタブバー高さ（`MOBILE_TAB_BAR_HEIGHT_REM` = 3.5rem、標準倍率で 56px）の隙間を空けて常時表示する方式に置き換えた。撤去に伴い、旧方式専用だった Rust コマンドや `eval_in_webview` 経由のタブバー更新呼び出しも不要になり削除している。
- column WebView と React タブバーの境界（`y = innerHeight - タブバー高さ` 付近）に視覚的な段差が生じうる、というリスクが設計時点で指摘されている。x.com コンテンツ下端が切れて見える場合は `padding-bottom` の CSS 注入や、column 高さをタブバーと重ねる対処が候補として挙がっていたが、実装完了時点で解消済みという確証はない。実機で段差が見えたらこの経緯を思い出すこと。

## APK 自己更新

- Android は Tauri 標準の自動アップデータを使わず、GitHub Releases API を直接叩いて自前で APK をダウンロード・インストーラ起動する独自経路（JNI 経由で MainActivity 側のダウンロード・インストール処理を呼ぶ）。desktop の更新機構とは UI 層のみ共有し、実処理は完全に別。
- Android 8.0 以降は `packageManager.canRequestPackageInstalls()` が false の場合、ダウンロードせず「不明アプリのインストール許可」設定画面へ誘導して return する分岐がある。初回インストール時に必ず踏む導線。
- 同一署名であることが上書き更新（アンインストール不要）の前提条件。署名が変わると自己更新は失敗し、ユーザーは手動再インストールが必要になる。
- APK の整合性は GitHub アセットの `digest`（`sha256:<hex>`）を `install_apk_update` の `expected_sha256` として渡し、Kotlin 側 `ApkHashVerifier` で検証してからインストーラを起動する。URL は自リポジトリの Releases ダウンロード URL に限定され、呼び出し元は main ウィンドウのみ（`commands/update.rs` の `validate_install_request`）。
- GitHub Release の資産名判定（`src/lib/githubRelease.ts`）は `.apk` 拡張子で最初にマッチしたものを使う実装。将来 Release に複数の `.apk`（アーキテクチャ別など）を置くと、意図しない資産を掴むリスクが仕様上ある。
- バージョン比較は `.`/`-`/`+` 区切りの数値パースによる簡易版で、プレリリースタグの大小関係などは考慮していない。

## Cookie 共有まわり

- `api.x.com` はカラム WebView のホストと別ドメインのため、`CookieManager.setAcceptThirdPartyCookies(wv, true)` を設定しないと v1.1 API が 401 になる。
- Profile API 非対応端末では「WebView 生成時 → loadUrl 前に Cookie 設定」という順序が必須。共通化ヘルパーを触る際もこの順序を壊さないこと。
- 再認証（既存アカウントの Cookie を新規ログイン結果で上書きする機能）まわりでは、プロファイル対応端末においてアカウント追加用 WebView とカラム用 WebView が同一の `account-{accountId}` プロファイルを共有しており、`x_cookies.txt` は非対応端末向けのフォールバックスナップショットに過ぎない点に注意する。`migrateLegacyCookies` はプロファイル初回作成時のみ実行されるため、上書きはファイル更新だけでは既存プロファイルに反映されず、一時プロファイルの Cookie を対象プロファイルの `CookieManager` へ明示的に転記（クリア → 注入 → flush）する必要がある。

## 動画ダウンロード（column WebViewへの新規JavaScriptブリッジ追加）

- 動画長押しメニュー（`video_long_press_menu.ts`）から Rust へダウンロード要求を送るため、column WebView にも popup と同様の `addJavascriptInterface` ブリッジ（`VideoDownloadRequestBridge`）を新設した。**column WebView には元々 Tauri IPC もこの種のブリッジも一切無かった**（モバイルタブバーの節参照）ため、column WebView に何らかの操作を Rust へ届けたくなった場合、popup 用ブリッジ（`PopupSessionBridge`）をそのまま転用することはできず、`MainActivity.createColumnWebView` 内で個別に `addJavascriptInterface` を登録する対応が必要になる。今後同様のニーズが出た場合の前例として記録する。
- 保存処理は SAF（Storage Access Framework、`ActivityResultContracts.CreateDocument`）を使用。`registerForActivityResult` は **Activity 生成完了前（`onCreate` より前）に登録する制約**があるため、`MainActivity` のプロパティ初期化子で `ActivityResultLauncher` を宣言する必要がある。`onCreate` 内で呼ぶと実行時エラーになる。
- Rust 側でダウンロード → Kotlin 側で SAF 保存という非同期の往復があるため、launch と結果コールバックの間で「どの一時ファイルを保存対象にしているか」を保持する必要がある。保持は `VideoSaveQueue`（`MainActivity` のプロパティ）で行い、要求順に 1 件ずつ保存ダイアログを出す。HLS の動画は映像と音声の保存要求が続けて届くため、当初のように保留中の要求を 1 件だけ持つ実装では後の音声の要求が映像の要求を上書きし、映像ファイルが 0B で作られて一時ファイルも残った。保存ダイアログの表示自体が失敗した要求は一時ファイルを削除して次へ進む（先頭で詰まると以降の保存がアプリ再起動までできなくなるため）。キューのロジックは JVM 単体テストできるよう Android 非依存の純粋クラスにしている（`VideoSaveQueueTest`）。この処理は Rust→Kotlin の一方向呼び出し（`downloadAndInstallApk` と同じパターン）であり、双方向の `@JavascriptInterface` ブリッジ（`PopupSessionBridge` パターン）とは異なる点に注意。混同すると不要なクラスを作ってしまう（本機能でも当初の実装プランは誤って `VideoDownloadBridge.kt`（JSインターフェース）を作る想定だったが、実際は MainActivity 本体への直接追加が正しい設計だった）。
- X の動画がHLS配信のみ（mp4 progressiveが無い）場合、映像・音声が別々のHLSストリームに分離されている（fMP4/CMAF、`.m4s`セグメント）。ffmpeg等を同梱しない制約下では、映像・音声を1本の音声付き動画に多重化（mux）することはできず、別ファイルとして保存する設計にせざるを得ない。この制約は desktop 側にも共通する。

## 動画ダウンロード（進捗表示 + Foreground Serviceによるバックグラウンド中断対策）

- ダウンロードがバックグラウンドで中断される問題への対策として `VideoDownloadForegroundService` を新設した。Android 14(API 34)以降は `AndroidManifest.xml` で `android:foregroundServiceType` の明示宣言が必須（今回は `dataSync`）。`FOREGROUND_SERVICE` / `FOREGROUND_SERVICE_DATA_SYNC` 権限に加え、通知表示には Android 13(API 33)以降 `POST_NOTIFICATIONS` のランタイム許可も必要。**このプロジェクトでは許可リクエストUIをあえて作らず、「許可されていれば通知が出る、無ければ通知は出ないがダウンロード自体は成功する」という割り切りにしている**（`NotificationManagerCompat.notify` は権限が無くても何もしないだけでクラッシュしない）。同様の通知機能を追加する際はこの前例に倣ってよい。
- Foreground Serviceの開始/進捗更新/終了は、Kotlin側で1つの `Service` に対し `Intent.action`（`ACTION_START`/`ACTION_UPDATE`/`ACTION_FINISH`）で分岐する設計にした。`ACTION_START` は `ContextCompat.startForegroundService` → `ServiceCompat.startForeground(..., ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)`、`ACTION_UPDATE` は通常の `startService`（フォアグラウンド化済みのサービスへの追加Intentなので`startForegroundService`不要）、`ACTION_FINISH` は `ServiceCompat.stopForeground(STOP_FOREGROUND_REMOVE)` + `stopSelf()`。
- Rust側からの進捗通知は `MainActivity` の `notifyVideoDownloadStarted()` / `notifyVideoDownloadProgress(fileIndex: Int, fileCount: Int, current: Long, total: Long)` / `notifyVideoDownloadFinished()` を JNI経由で呼ぶ（`call_activity_method`ヘルパー、`(IIJJ)V`のようなJNIメソッドシグネチャ文字列を手書きする必要がある。`I`=int, `J`=long, `V`=void）。`total` は「不明なら0以下」というセンチネル値で表現し、Kotlin側がその場合indeterminateプログレス表示に切り替える設計にした（Option型をJNI越しに渡す煩雑さを避けるため）。
- `handle_android_video_download_request`（Rust）は複数箇所で `?` による早期returnがあるため、そのまま素直に書くと「開始は呼んだが終了(finished)を呼ばずに関数を抜けるパス」が生まれ、Foreground Serviceの通知が消えないまま残ってしまう。**処理本体を `async { ... }` ブロックに包んで結果を一旦ローカル変数で受け、成否に関わらず必ず `notify_video_download_finished()` を呼んでから元の結果を返す**、という構造にして防いだ。早期returnが多い非同期関数で「必ず後始末する」処理を挟みたい場合の定石として記録する。
- 進捗表示自体（desktop側、`popup_toolbar.ts` の `window.__TAURI__.event.listen` でRustの `app.emit_to(window_label, event, payload)` を受信する経路）は、このプロジェクトで初めて使う経路だった（既存のinjectスクリプトは全て `invoke` による一方向通知のみ）。`src-tauri/capabilities/column-webview.json` が popup ウィンドウに許可している `core:default` パーミッションセットには `core:event:default` が含まれており（Tauri v2の `gen/schemas/desktop-schema.json` で確認可能）、追加のcapabilities設定変更なしに動作した。同様にRust→WebViewへイベントを送りたくなった場合、この経路をそのまま使ってよい。なお現在の宛先は `app.emit_to(webview.label(), …)`（呼び出し元 WebView のラベル）で、受け手の JS は `listen` に `{ target: 自ラベル }` を指定する必要がある（既定 target は宛先に関係なく全 emit を受け取るため）。Android は `download_video` を使わないため無関係。
- 失敗の通知: Rust は失敗時に `notifyVideoDownloadFailed()` → `notifyVideoDownloadFinished()` の順に呼ぶ（`finish_android_video_download`。失敗の通知を先に出し、進捗の通知が消えた後に何も残らない時間を作らない）。失敗の通知は Service を経由せず `MainActivity` から直接出し、進捗とは別の ID（1002）、常駐させない（`ongoing=false` / `autoCancel=true`）。前回の失敗の通知は次のダウンロード開始時に消す。チャンネルは `IMPORTANCE_LOW` のままなのでヘッドアップ表示はしない。
- 通知チャンネルの作成は `VideoDownloadNotifications.kt` に共通化した。ダウンロードが開始前（payload 解析・計画の失敗など）に失敗すると Service が一度も起動せずチャンネルが作られておらず、チャンネルの無い通知は捨てられて何も出ないため、失敗の通知側でも作成を保証する必要がある。
- Service に FAIL アクションを足さなかったのは、`ACTION_FINISH` で `stopSelf` した後の `startService` はバックグラウンドからの起動制限で失敗しうるため（失敗の通知は Service の寿命に依存させない）。
- ポップアップの「動画をダウンロード」ボタン（`popup_toolbar.ts`）は、Android では `__mcxPopupBridge` に `downloadVideo` を送り、`PopupSessionBridge` → `AppBridge.onVideoDownloadRequest` で長押しメニューと同じ Rust 処理に渡る。ブリッジも Tauri IPC も無い（届ける手段が無い）ポップアップではボタンを出さない。以前は desktop 専用コマンド `download_video` を呼んでいたため、Android では押しても無反応だった。

### 既知の挙動: 同名で再保存すると「(1)」が付き、保存直後に一時 0B に見える（OS 仕様・記録のみ）

- 保存は SAF `ActivityResultContracts.CreateDocument("*/*")`（`MainActivity.kt` 78-82 行付近）で文書を作成し、その後 `openOutputStream` + `copyTo`（同 61-70 行付近の `VideoSaveQueue` の `write`）で一時ファイルの中身を書き込む。
- 同じ名前の動画を再保存すると、保存先に同名があるため名前の末尾に「(1)」が付く。また、文書の作成からコピー完了までの間は 0B のファイルとして見える。どちらも OS（DocumentsUI / ドキュメントプロバイダ）の仕様で、アプリは介入できない。`IS_PENDING` は MediaStore へ直接書く場合専用で、SAF には使えない。
- 別件の注意（今回は対象外）: コピーは SAF のコールバック（`saveVideoLauncher` → `VideoSaveQueue.onResult`）の中、つまり UI スレッド上で行われる。大きなファイルでは ANR のリスクがある。必要なら別課題として扱う。

## 文字列リソース（多言語）

- 利用者に見えるネイティブ文言は `app/src/main/res/values/strings.xml`（既定＝英語）と `res/values-ja/strings.xml`（日本語）で管理する。**端末の言語に従い、アプリ内の `language` 設定とは独立**（現状は動画ダウンロードの通知文言のみ。進捗の通知＝`VideoDownloadForegroundService` と失敗の通知＝`VideoDownloadNotifications.kt`）。`app_name` / `main_activity_title` は既定のみ。
- 追加手順: ①両方の `strings.xml` に同じキーを追加（書式付きは `%1$d` の位置指定子を揃える。`%` 自体は `%%`）②コードは `getString(R.string.…)` で参照し、日本語・英語を直書きしない ③日本語側の文言一覧は `StringResourcesTest` の期待表にも追加する。R クラスのリソース ID は ProGuard の keep 不要。
- `StringResourcesTest`（キー集合・書式指定子の一致、既定側に日本語なし、日本語の現行文言、通知サービスへの日本語直書きなし）と `VideoDownloadProgressTextTest`（`buildProgressText`）が検証する。注意: テストは `strings.xml` を `File` で読むため Gradle の入力に含まれず、リソースだけ変えると `testUniversalDebugUnitTest` が UP-TO-DATE になる。手元で確認するときは `:app:cleanTestUniversalDebugUnitTest` を併用する。

## reqwest 等ネイティブ依存クレートの Android クロスビルド

- `reqwest`（`rustls-no-provider` feature）が依存する `ring` crate は Android ターゲットのビルド時にネイティブ C コードのコンパイルが必要で、`ANDROID_NDK_HOME`（または `NDK_HOME`）環境変数と NDK の `clang` が見つからないとビルドに失敗する。**`cargo check`（デフォルトのdesktopターゲット）だけでは検出できず**、`cargo check --target aarch64-linux-android` や実際の `npm run tauri:android:build[:debug]` を通さないと問題が判明しない。ローカル開発機でこの手のネイティブ依存クレートを新規追加した場合は、Androidターゲットでのビルドも一度は試すこと（Android SDK/NDK が `AppData/Local/Android/Sdk` 等にインストール済みでも、シェルの環境変数 `ANDROID_HOME` / `ANDROID_NDK_HOME` が未設定だと同じエラーになる点に注意）。
- Android ターゲットの `cargo check` / `clippy` には、`ANDROID_NDK_HOME` に加えて `CC_aarch64_linux_android` / `AR_aarch64_linux_android` / `CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER`（NDK の `aarch64-linux-android24-clang(.cmd)` と `llvm-ar`）の設定が必要。
- **reqwest の TLS 設計（0.13）**: 設定は `src-tauri/src/http_tls.rs` に集約している。
  - 暗号プロバイダは ring を選び、aws-lc-rs は入れない（Android / Windows の C ビルド依存を増やさないため。updater も ring）。`rustls` の直接依存は `default-features = false` を維持する（default は aws-lc-rs を含む）。確認は `cargo tree -i aws-lc-rs`（host と `--target aarch64-linux-android`）が「該当なし」になること。
  - `rustls-no-provider` はプロバイダ未設定だと `ClientBuilder::build()` が panic する。**reqwest クライアントを新設するときは必ず `http_tls::configure_tls` を通す**（ring の install と Android の証明書設定を担う）。
  - desktop は OS の証明書ストア（rustls-platform-verifier）で検証する（0.12 までの同梱ルートから変更）。
  - Android は platform-verifier の JNI 初期化・Gradle・ProGuard を避けるため、同梱ルート証明書（`webpki-root-certs`）だけを `tls_certs_only` で信頼する。Android では `tls_certs_merge` / `add_root_certificate` がビルドエラーになるので使わない。
- `#[tauri::command]` に `#[cfg(desktop)]` を付けたコマンドを `generate_handler!` マクロへ登録する際は、マクロの引数リストの中でもそのコマンドの直前に同じ `#[cfg(desktop)]` を付ける必要がある。付け忘れると、Android ビルド時に「そのコマンドが `mobile` cfg では存在しない」ため `generate_handler!` がマクロ展開に失敗し `cannot find __tauri_command_name_<cmd>` のようなコンパイルエラーになる。**これも `cargo check`（desktopターゲット）では検出されず、Android向けビルドで初めて顕在化する**。新規コマンドを `#[cfg(desktop)]` 限定で追加したら、`generate_handler!` 側にも同じ `#[cfg]` を付け忘れていないか確認すること。

## 端末引き継ぎ（Auto Backup / 端末間転送）

- Android 標準の Auto Backup for Apps（`allowBackup` + `bmgr` 経由の転送）に乗せてログインセッション（WebView Cookie 等）を含む完全引き継ぎを実現している。デフォルト（`allowBackup=true`、除外ルール無し）のままだと `app_webview`（WebView Profile API のプロファイルストレージ）が実機で数百 MB 規模に肥大化し、Auto Backup の 25MB クォータを超過して **バックアップ自体が丸ごと失敗する**（`bmgr backupnow` が `Size quota exceeded` を返す）。肥大化の99%以上は WebView の Service Worker CacheStorage / Shared Dictionary cache（x.com のオフラインキャッシュで、破棄しても再生成されるだけで実害なし）。
- `data_extraction_rules.xml` / `backup_rules.xml` の `path` 属性は**ワイルドカード・正規表現非対応**（Android 公式ドキュメント明記）。WebView のプロファイルディレクトリ名は `Default` / `Profile 1` / `Profile 2` ... とアカウント数に応じて動的に増減するため、XML の固定パス列挙では将来のアカウント追加に対応できない。そのため XML 宣言的ルールではなく、カスタム `BackupAgent`（`MultiColumnXBackupAgent`）を実装し、`onFullBackup(FullBackupDataOutput)` 内で `BackupFileSelector` がディレクトリ名の完全一致（`Service Worker` / `Shared Dictionary` を深さ不問で除外等）により対象ファイルを再帰選定し `fullBackupFile()` で個別登録する方式にした。**`super.onFullBackup()` は呼ばないこと**（呼ぶと XML ルールベースの規定動作＝全ファイル対象に戻ってしまい、除外ロジックが無意味になる）。
- `MultiColumnXBackupAgent` は `android.app.backup.BackupAgent` を継承しフレームワーク依存のため JVM 単体テスト対象外。ロジックの本体は `BackupFileSelector`（`java.io.File` のみ依存の純粋関数）側に切り出してあり、そちらでユニットテストしている。
- **`android:backupAgent` でカスタムエージェントを指定するだけでは `onFullBackup()` は呼ばれない。`android:fullBackupOnly="true"` を明示しない限り、常に鍵バリューAPI（`onBackup()`）にフォールバックする**（Android公式仕様。デフォルト値は `false`）。この属性を付け忘れると、`bmgr backupnow` は `Success` を返し続ける（鍵バリューAPI側が空実装で正常終了するだけ）ため、**「Successが返る」ことは実装が機能している証拠にならない**。実際に本プロジェクトでも一度この状態でコミットしてしまい、後続の検証で発覚した（後述）。

### 実機/エミュレータでの検証手順（ローカルトランスポート）

Google の実クラウドバックアップ・実機間 D2D 転送を使わずに、同一検証を再現する手順。

```bash
# バックアップ有効化・ローカルトランスポート選択
adb shell bmgr enable true
adb shell bmgr transport com.android.localtransport/.LocalTransport

# 重要: トランスポートに残っている過去のバックアップセットを必ず消してから検証すること。
# wipeを省略すると、backupnowが実質何もしなくても（K/Vへのフォールバック等で）
# 古いバックアップセットがrestoreで復元され、あたかも成功したかのように見える
# 誤検証（false positive）が発生する。
adb shell bmgr wipe com.android.localtransport/.LocalTransport com.natsuyasai.multicolumnx

# 復元検証用に主要ファイルのmd5を事前記録しておく（settings.jsonは空アプリでも
# 同一ハッシュになりうる＝復元有無を判別できないため、Cookies DBの方を主たる証拠とする）
adb shell "run-as com.natsuyasai.multicolumnx sh -c 'find /data/data/com.natsuyasai.multicolumnx/app_webview -name Cookies -exec md5sum {} \;'"

# バックアップ実行。Successであることに加え、adb logcatで
# 「Package <pkg> with progress: X/Y」が出力されることを必ず確認する
# （出ていなければonFullBackup()経由でデータ転送されていない疑いが強い。後述）
adb logcat -c
adb shell bmgr backupnow com.natsuyasai.multicolumnx
adb logcat -d | grep -i "with progress"

# 全データ消去→復元
adb shell bmgr list sets   # トークン確認（例: "1 : Local disk image"）
adb shell pm clear com.natsuyasai.multicolumnx
adb shell bmgr restore 1 com.natsuyasai.multicolumnx   # <トークン> <パッケージ名>の順。単に"restore <package>"はサポート外

# md5再取得してCookies DBが事前記録と一致すること、アプリを起動してクラッシュしないことを確認
adb shell am start -n com.natsuyasai.multicolumnx/.MainActivity
```

- **「除外ロジックが実際に機能しているか」を判別できる検証をすること。** `bmgr backupnow` が `Success` を返すだけでは、鍵バリューAPI（空実装）が正常終了しただけの可能性を否定できない（前述の `fullBackupOnly` 漏れのケース）。判別には以下が有効:
  - `bmgr backupnow` / `bmgr fullbackup` 実行中のログに `Package <pkg> with progress: X/Y` が出力されることを確認する（`adb logcat` を都度 `-c` でクリアしてから実行）。これが出ていれば `onFullBackup()` 経由でデータが実際に転送されている証拠になる。出ない場合は鍵バリューAPIにフォールバックしている疑いが強い。
  - 除外対象ディレクトリ配下（例 `app_webview/<Profile>/Service Worker/`）に `dd if=/dev/zero of=... bs=1M count=100` 等で25MBクォータを明確に超えるダミーファイルを作り、`bmgr backupnow` が `Size quota exceeded` にならず `Success` すること、かつ復元後（**`pm clear` → `bmgr restore` 直後、`am start` で起動する前**）に `run-as <pkg> sh -c 'find .../app_webview -iname "Service Worker"'` が空を返すことを確認する。**アプリを起動する前に確認すること**（起動するとWebViewが再初期化し、ディレクトリが自然に再生成されて判別できなくなる）。
  - リリースビルド（`run-as` が使えない debuggable=false）では上記のファイル直接確認ができないため、`bmgr backupnow` の `progress` ログ出力の有無と、復元後にアプリがクラッシュせず起動できることの2点で代替確認する。
- **落とし穴（実際に踏んだ不具合）**: `android:backupAgent` でカスタムエージェントを指定しただけで `android:fullBackupOnly="true"` を付け忘れると、`onFullBackup()` が一切呼ばれず鍵バリューAPI（本実装では空実装）にフォールバックする。この状態でも `bmgr backupnow` は `Success` を返し、`pm clear` → `bmgr restore` 後に**新規インストールと見分けがつかない空の状態**になる（設定・アカウント一切なし、カラム0件で画面が真っ黒になる）。**初回の検証ではこの不具合を見逃しかけた**: `bmgr wipe` をせずに検証したため、ローカルトランスポート側に「以前実際にService Workerを手動退避した状態で取得済みだった、正しい中身のバックアップセット」が残っており、`backupnow`（実際には鍵バリューAPIの空処理で何も転送していない）の後に `restore` すると、その**古いバックアップセットがそのまま復元されて**md5が一致しているように見えてしまった（`Default/Shared Dictionary` だけが復元後に残っていたのも、その古いセットに含まれていた残骸）。**`bmgr backupnow` の `Success` や `md5一致`だけを根拠に「実装が機能している」と判断しないこと。検証の前には必ず `bmgr wipe` で古いバックアップセットを消し、`progress` ログ確認とダミーファイル検証を併用すること。**
- `pm clear` 直後のアプリは OS 上「force-stopped 状態」として扱われ、その状態のまま `bmgr backupnow` を叩くと `Backup is not allowed` で失敗する。**バックアップ対象アプリは事前に一度フォアグラウンド起動しておく必要がある**（`adb shell am start` 等）。同様に、**署名の異なるビルド（デバッグ版⇔リリース版）を入れ替えてインストールすると、インストール時の自動リストアが signature mismatch で失敗し、アプリが force-stopped 状態のままになる**。ビルド種別を切り替えて検証する場合は、インストール直後に必ず `am start` で一度フォアグラウンド起動すること。
- `adb shell run-as <pkg> sh -c '...'` は、複数コマンドを一度に文字列連結して渡す場合、シェル呼び出しの引数分割でクォートが失われ空白を含むパス（`Service Worker` 等）が壊れることがある。**コマンド全体を1つのダブルクォート文字列として `adb shell` に渡す**（`adb shell "run-as pkg sh -c '...'"`）と正しく解釈される。
- **既知の制約（今回の検証では自動確認不可）**: 実際の Google アカウントクラウドバックアップおよび実機間 D2D（Quick Switch / ケーブル移行）が `BackupAgent.onFullBackup()` を同一経路で通るかは、ローカルトランスポートでの検証だけでは完全には裏付けられていない（Android バージョンにより挙動差の可能性が残る）。`fullBackupOnly` 修正後の検証は100MBダミーファイル・空マーカーファイルによる合成データのみで行っており、**実際にログイン済みの複数アカウントを持つ状態でのバックアップ→復元ラウンドトリップは未実施**（メカニズム自体は `Cookies` DBも除外対象外の通常ファイルとして同じ経路で扱われるため理論上は問題ないはずだが、実データでの確認ではない）。リリース前に実機2台での端末移行フローを手動確認する際、この実データラウンドトリップ確認も併せて実施すること。

## 複数カラム表示（列数設定）

- 実装: `src/lib/gridLayout.ts` の `mobileColumnLayout` / `clampMobileColumnCount`、`src/hooks/useMobileColumns.ts` の `mobileLayoutForViewport`。
- 有効列数 = `min(設定値, floor(幅dp / 300), 登録数)`。設定値は 2〜6 にクランプ。幅 600dp 未満は常に 1 列。
- 数値の決定: 1 列あたり最小幅 300dp、列数の上限 6、600dp 未満は 1 列（従来の 2 カラム表示の下限 `MOBILE_TWO_COLUMN_MIN_WIDTH` を維持）は Issue #218 の仕様検討で決めた値。変更する場合は `gridLayout.ts` の定数と本節を合わせて更新する。
- 窓の規則: アクティブ位置から連続 N 列を表示。末尾付近では窓が左へずれ、最後のカラムが右端に来る。n=2 は従来の固定 2 カラム配置と一致する（回帰させないこと）。
- 設定変更の反映: 設定を購読せず、設定パネルを閉じたときの `recalculateAllBounds` → `setActiveColumn` 経由で再配置される（ストア更新 → ダイアログを閉じる、の順序に依存）。

## メディアのポップアップ（複数カラム表示時）

Android では、画像・動画のポップアップ表示（全画面）を**複数カラム表示中だけ**有効にする。1 列表示（スマホ・回転後・分割画面）では従来どおりカラム内で開く。設定は既存の `imagePopupEnabled` / `videoPopupEnabled`（アプリ設定のメディアカテゴリ。Esc で閉じる設定は Android では出さない）で、有効条件は「設定 ON かつ複数カラム表示中」。

### 複数カラム表示フラグは Kotlin だけが持つ

- 実装: `MediaPopupFlagSync.kt`（状態と配布）、`MainActivity.setMediaPopupActive`、`src/services/mediaPopup.ts`（`syncMobileMediaPopupActive`）、Rust コマンド `set_mobile_media_popup_active`（パススルー。Rust に状態は持たない）。
- 値の源泉は `useMobileColumns` が `mobileColumnLayout` の結果から `isMultiColumnLayout(layout)`（表示中が 2 枚以上）で求める。実効列数と常に一致する単一の定義になる。`setActiveColumn`（回転・設定変更・スワイプで通る）と `restoreMobileColumns`（カラム作成前）で同期する。
- **init script に作成時の値を埋め込んではいけない**。column WebView の init script は `addDocumentStartJavaScript` で作成時に固定され、リロード（手動更新・`applyColumnScale`・ログイン復旧）のたびに再実行される。埋め込み値や eval だけの上書きだと、「2 列で作成 → 回転で 1 列 → リロード」で作成時の `true` が復活し、1 列なのにポップアップが開く。
- そこで Kotlin が唯一の保持者となり、(a) 既存文書へ `evaluateJavascript`、(b) 各カラムの小さな document-start script（`window.__mcxMultiColumnActive = <bool>;`）を `ScriptHandler.remove()` → 再追加で差し替え、(c) 新規カラム作成時（`registerColumn` が現在値で登録）と `showColumnWebView`（paused 中の eval 取りこぼしの保険）で再適用する。UI スレッドで直列化するので作成と更新が競合しない。値が変わったときだけ配布し、既定は無効。
- `columnBuildSignature` に列数を入れない（回転のたびに全カラムが再構築される）。設定（画像／動画の ON/OFF）の変更は、既存どおり署名差のカラムの再構築で反映する。
- `setMediaPopupActive` は JNI から呼ぶため `proguard-rules.pro` の keep ルールが必須（リリースビルドでしか症状が出ない。上の「ProGuard keep ルールの同期」参照）。

### 要求の経路（column → ネイティブ → Rust）

`window.__mcxMediaPopupBridge.postMessage(JSON)`（`{ type: "openMediaPopup", url }`）→ `MediaPopupBridge(columnId)`（`addWebMessageListener`。`acceptBridgeMessage` でメインフレーム・許可オリジンのみ）→ `AppBridge.onMediaPopupRequest(label, url)` → JNI `Java_..._AppBridge_onMediaPopupRequest` → `open_media_popup_from_android` → 共通関数 `open_media_popup_mobile`（mobile 版 `open_popup_window` と共用）。

- **送信元カラムを JS に申告させない**。`MediaPopupBridge` が閉包で持つ `columnId`（= Rust の registry ラベル）を使い、ポップアップは送信元カラム自身のアカウントで開く（`ApiRateLimitBridge` と同型）。
- JNI 経由は `require_registered = true` で、URL を `validate_media_page_url`（https + X ホスト + パスが `/<user>/status/<id>/photo|video/<n>` または `/i/status/<id>[/photo|video/<n>]`）に限定し、`column-` で始まらないラベル・registry 未登録のラベル（削除済みカラム等）を拒否する。侵害された column の JS から任意 URL を開かれないための再検証であり、Tauri コマンド版（`require_registered = false`）は従来の `validate_media_popup_url` のまま。
- ポップアップ生成は UI スレッド同期を伴うため、JNI ハンドラは `tauri::async_runtime::spawn` へ逃がして即 return する。ダブルタップで 2 枚開かないよう、`MediaPopupBridge` は同一 URL の要求を 1 秒（`DUPLICATE_WINDOW_MS`）以内なら無視する。
- JS 名 `__mcxMediaPopupBridge` は `MainActivity.kt`（`MEDIA_POPUP_BRIDGE_JS_NAME`）と inject で一致させる。新ブリッジにしたのは、`VideoDownloadRequestBridge`（動画 DL 専用）へ相乗りすると責務が混ざり、JS 名＝権限境界の単位も分けにくくなるため。

### inject 側の判定

- `image_popup.js` を mobile にも注入する。デスクトップとの区別は、mobile の config にだけ付く `mediaPopupRequiresMultiColumn: true`（`inject/mod.rs` の `config_script`）による**明示的なプラットフォーム判定**で行う（ブリッジの有無から推測しない）。
- 有効判定 `isMediaPopupEnabled`（`video_long_press_menu.ts` に独立実装の `isLongPressMediaPopupEnabled` があり、同期テスト `media_popup_gate.contract.test.ts` で一致を保つ）: デスクトップは従来どおり設定だけで決まる。Android は「設定 ON かつ `__mcxMediaPopupBridge` がある かつ `__mcxMultiColumnActive === true`」のときだけ有効。**ブリッジが無ければ横取りしない**（カラム内の通常遷移へフォールバック）。判定はクリック時・メニュー表示時に毎回評価し、回転による変化に追従する。
- 動画サムネイル（再生ボタン外）のタップ横取り（`findPlayButtonForMediaTap`）は Android（`mediaPopupRequiresMultiColumn`）でのみ行う。デスクトップの DOM では未検証のため。

### 実 X DOM の実測知見（2026-11-25、Pixel_9 エミュレータ・WebView Chrome 153・ログイン済みホームカラム）

- 画像: `a[href*="/photo/<n>"]` が `div[data-testid=tweetPhoto]` を内包する。タップは `a` への click として document capture に届く（isTrusted）ため、既存の `classifyMediaHref` がそのまま使える。引用 RT 内の画像も同形式。
- タイムラインの動画: `<video>` も `videoComponent` も `a[href*="/video/"]` も無い。`img`（サムネイル）+ `div[data-testid=previewInterstitial] > button[data-testid=playButton]` で、playButton は `<a>` に包まれない。**サムネイル画像（ボタン外）をタップしても target は `img` で、`<a>` も playButton も経由せず X が `/<user>/status/<id>/mediaViewer?...` へ遷移する**ため、playButton への click 判定だけでは拾えない。→ `previewInterstitial` を含む最小のプレビュー領域から playButton を辿る（領域が article・引用コンテナ・本文やリンクを含む場合、`previewInterstitial` が 1 つでない場合は対象外にして誤マッチを避ける）。
- 引用 RT 内の動画: 引用コンテナ内に `a[href]` も時刻リンクも無い（同じ `previewInterstitial` 構造）。引用元ツイート ID は React fiber から取る（`extractQuotedTweetId`。実機での id 取得は未検証）。
- 長押し: 動画サムネイルの 1 秒長押しで `contextmenu` は発火するが、`video_long_press_menu.ts` は `closest('[data-testid="videoComponent"]')` を要求するため、**タイムラインのサムネイル状態ではメニューは出ない**（videoComponent は mediaViewer 内で出現する）。メニューの項目表示条件は同じ有効判定を使う。
- `/<user>/status/<id>/video/1` を直接開くと動画表示ページとして機能する（自動再生はされず playButton が出る）。ポップアップの組み立て先 URL として有効。複数動画ツイートの `/video/<n>` の n、GIF の DOM は未確認。

### 不採用にした案

- **column 内 JS が `innerWidth` と `screen.width` から自己判定する案**（IPC 不要）: 分割画面や Android 16 のデスクトップウィンドウではウィンドウ幅 < `screen.width` になり、1 列でも「複数列」と誤判定する。2 列と 3 列の境界も端数に弱く、`mobileColumnLayout` と食い違う。
- **既存の `VideoDownloadRequestBridge` への相乗り**: 上記のとおり責務と権限境界が混ざるため新ブリッジにした。

### 検証手順

- エミュレータ（タブレット AVD、幅 600dp 以上）で 2 列表示 → タイムラインの画像・動画をタップ → 全画面ポップアップが開く → 戻る → 回転（1 列）でカラム内表示に戻ることを確認する。X への外部影響のある操作はしない。
- **リリースビルド（R8）で `setMediaPopupActive` が呼べること**を必ず確認する。

## デバッグビルドでは検出できない不具合

- デバッグビルドは R8（難読化・最適化）が無効なため、ProGuard keep ルール漏れなどの不具合はリリースビルドでしか再現しない。Android 実機確認が必要なタスク（JNI 呼び出し・ProGuard 絡みの変更）は、必ずリリースビルドで最終確認すること。
- Android の署名鍵（アップロード用キーストア）は既存のものを変更禁止。鍵が変わると署名不一致で自己更新に失敗する。
- APK の出力パスは Tauri / AGP のバージョンで階層が変わるため、CI では固定パスではなく検索により動的に解決している。
