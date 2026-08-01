# Android 開発ノート

Android 対応（アカウント追加、モバイルタブバー、APK 自己更新、Cookie 共有）に関する実装時の設計判断・落とし穴を記録する。

## 対象ファイル

- `src-tauri/gen/android/` 配下（app モジュール全体） — 単体テスト実行方法
- `src-tauri/gen/android/app/src/main/java/com/natsuyasai/multicolumnx/MainActivity.kt` / `src-tauri/gen/android/app/proguard-rules.pro` — ProGuard keep ルール同期

## Android の単体テスト実行

app モジュールの variant は universal フレーバー付きのため、`./gradlew.bat testDebugUnitTest` では **app のテストは実行されない**。`cd src-tauri/gen/android && ./gradlew.bat :app:testUniversalDebugUnitTest` を使うこと。

## Android ProGuard keep ルールの同期

`android_bridge.rs` が `env.call_method()` で文字列指定して呼び出す `MainActivity` のメソッドは、リリースビルドで R8 に難読化されると `NoSuchMethodException` が発生して WebView が作成されない。

**`MainActivity.kt` のメソッドシグネチャを変更したら、必ず `src-tauri/gen/android/app/proguard-rules.pro` も同時に更新すること。**

対象操作と対応ルール:

- メソッドを追加 → `-keepclassmembers` に同じシグネチャのエントリを追加
- 引数を追加・削除 → keep ルールの型リストを新シグネチャに合わせて更新
- メソッドを削除 → keep ルールからそのエントリを削除

デバッグビルドでは R8 が無効なため症状が出ず、リリースビルドで初めてクラッシュする。変更後はリリースビルドで動作確認すること。

## アカウント追加（別 Activity 方式）

- `window.add_child()` は Tauri 2 の Android 実装では使用不可。当初アカウント追加もポップアップと同様 `add_child()` で実装予定だったが不可能と判明し、別 Activity 方式（`WebviewWindowBuilder` を使用し、ラベルのケバブケースがパスカルケースの Activity クラス名に対応、`AndroidManifest.xml` に登録）に変更した。
- `WebviewWindowBuilder::build()` を呼んだ直後、Android の IPC ルーティング先が新規 Activity の WebView に切り替わる。そのままコマンドが `Ok(...)` を返すと、コールバックが新規 Activity 側に届いてしまい、呼び出し元（メイン WebView）の `invoke()` Promise が永久に unresolved になる。対策として `build()` を `tokio::spawn` 内に隔離し、`Ok(...)` を `build()` より先に返している。
- x.com は SPA であり、ログイン後の `/home` 遷移は `pushState` によるもの。Android WebView の `onPageStarted` は `pushState` では発火しないため、Rust 側の `WebviewWindow::url()` ポーリングでは遷移を検知できない（デスクトップ版は Chromium の挙動でこのポーリングが機能するため非対称）。対策として `location.pathname` を見る init script 経由の JS ポーリングに切り替えている。
- Rust から `window.close()` しても Android の別 Activity（アカウント追加用）は閉じない（multi-window の close dispatch が機能しない）。sentinel ファイル（`app_data_dir()` 配下の完了通知ファイル）を Kotlin 側が 500ms ポーリングして `finish()` する方式で回避している。
- 前面 Activity（アカウント追加用）がある間、MainActivity の WebView は Android に suspend されるため、Rust から `emit()` してもメイン側 JS は実行されずイベントを受信できない。そのため `document.visibilitychange`（可視化時に1回確認）を主系、遅延 emit を副系とする二重経路を設けている。
- リスクとして残っている点: `WebviewBuilder::data_directory()` によるアカウント間セッション分離は、Android ではデスクトップほど確実ではない可能性がある。複数アカウントを実機で分離検証する際は注意すること。

## モバイルタブバー（inject 方式からの方針転換）

- 当初は X の DOM に注入するスクリプトでタブバーを実装していたが、column WebView（x.com を表示する外部 WebView）には Tauri の IPC ブリッジが注入されないため、タブバー自体は見えるのに操作が一切効かないという不具合があった。**inject スクリプトはメイン React アプリの UI 代替を担えない**（IPC 制約）という教訓から、この方式は全面撤去している。
- 代わりに React 側の `MobileTabBar` を column WebView の下に 56px の隙間を空けて常時表示する方式に置き換えた。撤去に伴い、旧方式専用だった Rust コマンドや `eval_in_webview` 経由のタブバー更新呼び出しも不要になり削除している。
- column WebView と React タブバーの境界（`y = innerHeight - 56` 付近）に視覚的な段差が生じうる、というリスクが設計時点で指摘されている。x.com コンテンツ下端が切れて見える場合は `padding-bottom: 56px` の CSS 注入や、column 高さをタブバーと重ねる対処が候補として挙がっていたが、実装完了時点で解消済みという確証はない。実機で段差が見えたらこの経緯を思い出すこと。

## APK 自己更新

- Android は Tauri 標準の自動アップデータを使わず、GitHub Releases API を直接叩いて自前で APK をダウンロード・インストーラ起動する独自経路（JNI 経由で MainActivity 側のダウンロード・インストール処理を呼ぶ）。desktop の更新機構とは UI 層のみ共有し、実処理は完全に別。
- Android 8.0 以降は `packageManager.canRequestPackageInstalls()` が false の場合、ダウンロードせず「不明アプリのインストール許可」設定画面へ誘導して return する分岐がある。初回インストール時に必ず踏む導線。
- 同一署名であることが上書き更新（アンインストール不要）の前提条件。署名が変わると自己更新は失敗し、ユーザーは手動再インストールが必要になる。
- GitHub Release の資産名判定は `.apk` 拡張子で最初にマッチしたものを使う実装。将来 Release に複数の `.apk`（アーキテクチャ別など）を置くと、意図しない資産を掴むリスクが仕様上ある。
- バージョン比較は `.`/`-`/`+` 区切りの数値パースによる簡易版で、プレリリースタグの大小関係などは考慮していない。

## Cookie 共有まわり

- `api.x.com` はカラム WebView のホストと別ドメインのため、`CookieManager.setAcceptThirdPartyCookies(wv, true)` を設定しないと v1.1 API が 401 になる。
- Profile API 非対応端末では「WebView 生成時 → loadUrl 前に Cookie 設定」という順序が必須。共通化ヘルパーを触る際もこの順序を壊さないこと。
- 再認証（既存アカウントの Cookie を新規ログイン結果で上書きする機能）まわりでは、プロファイル対応端末においてアカウント追加用 WebView とカラム用 WebView が同一の `account-{accountId}` プロファイルを共有しており、`x_cookies.txt` は非対応端末向けのフォールバックスナップショットに過ぎない点に注意する。`migrateLegacyCookies` はプロファイル初回作成時のみ実行されるため、上書きはファイル更新だけでは既存プロファイルに反映されず、一時プロファイルの Cookie を対象プロファイルの `CookieManager` へ明示的に転記（クリア → 注入 → flush）する必要がある。

## 動画ダウンロード（column WebViewへの新規JavaScriptブリッジ追加）

- 動画長押しメニュー（`video_long_press_menu.ts`）から Rust へダウンロード要求を送るため、column WebView にも popup と同様の `addJavascriptInterface` ブリッジ（`VideoDownloadRequestBridge`）を新設した。**column WebView には元々 Tauri IPC もこの種のブリッジも一切無かった**（モバイルタブバーの節参照）ため、column WebView に何らかの操作を Rust へ届けたくなった場合、popup 用ブリッジ（`PopupSessionBridge`）をそのまま転用することはできず、`MainActivity.createColumnWebView` 内で個別に `addJavascriptInterface` を登録する対応が必要になる。今後同様のニーズが出た場合の前例として記録する。
- 保存処理は SAF（Storage Access Framework、`ActivityResultContracts.CreateDocument`）を使用。`registerForActivityResult` は **Activity 生成完了前（`onCreate` より前）に登録する制約**があるため、`MainActivity` のプロパティ初期化子で `ActivityResultLauncher` を宣言する必要がある。`onCreate` 内で呼ぶと実行時エラーになる。
- Rust 側でダウンロード → Kotlin 側で SAF 保存という非同期の往復があるため、launch と結果コールバックの間で「どの一時ファイルを保存対象にしているか」を保持する必要がある（`pendingVideoSaveRequest` のようなクラスプロパティ）。この処理は Rust→Kotlin の一方向呼び出し（`downloadAndInstallApk` と同じパターン）であり、双方向の `@JavascriptInterface` ブリッジ（`PopupSessionBridge` パターン）とは異なる点に注意。混同すると不要なクラスを作ってしまう（本機能でも当初の実装プランは誤って `VideoDownloadBridge.kt`（JSインターフェース）を作る想定だったが、実際は MainActivity 本体への直接追加が正しい設計だった）。
- X の動画がHLS配信のみ（mp4 progressiveが無い）場合、映像・音声が別々のHLSストリームに分離されている（fMP4/CMAF、`.m4s`セグメント）。ffmpeg等を同梱しない制約下では、映像・音声を1本の音声付き動画に多重化（mux）することはできず、別ファイルとして保存する設計にせざるを得ない。この制約は desktop 側にも共通する。

## reqwest 等ネイティブ依存クレートの Android クロスビルド

- `reqwest`（`rustls-tls` feature）が依存する `ring` crate は Android ターゲットのビルド時にネイティブ C コードのコンパイルが必要で、`ANDROID_NDK_HOME`（または `NDK_HOME`）環境変数と NDK の `clang` が見つからないとビルドに失敗する。**`cargo check`（デフォルトのdesktopターゲット）だけでは検出できず**、`cargo check --target aarch64-linux-android` や実際の `npm run tauri:android:build[:debug]` を通さないと問題が判明しない。ローカル開発機でこの手のネイティブ依存クレートを新規追加した場合は、Androidターゲットでのビルドも一度は試すこと（Android SDK/NDK が `AppData/Local/Android/Sdk` 等にインストール済みでも、シェルの環境変数 `ANDROID_HOME` / `ANDROID_NDK_HOME` が未設定だと同じエラーになる点に注意）。
- `#[tauri::command]` に `#[cfg(desktop)]` を付けたコマンドを `generate_handler!` マクロへ登録する際は、マクロの引数リストの中でもそのコマンドの直前に同じ `#[cfg(desktop)]` を付ける必要がある。付け忘れると、Android ビルド時に「そのコマンドが `mobile` cfg では存在しない」ため `generate_handler!` がマクロ展開に失敗し `cannot find __tauri_command_name_<cmd>` のようなコンパイルエラーになる。**これも `cargo check`（desktopターゲット）では検出されず、Android向けビルドで初めて顕在化する**。新規コマンドを `#[cfg(desktop)]` 限定で追加したら、`generate_handler!` 側にも同じ `#[cfg]` を付け忘れていないか確認すること。

## デバッグビルドでは検出できない不具合

- デバッグビルドは R8（難読化・最適化）が無効なため、ProGuard keep ルール漏れなどの不具合はリリースビルドでしか再現しない。Android 実機確認が必要なタスク（JNI 呼び出し・ProGuard 絡みの変更）は、必ずリリースビルドで最終確認すること。
- Android の署名鍵（アップロード用キーストア）は既存のものを変更禁止。鍵が変わると署名不一致で自己更新に失敗する。
- APK の出力パスは Tauri / AGP のバージョンで階層が変わるため、CI では固定パスではなく検索により動的に解決している。
