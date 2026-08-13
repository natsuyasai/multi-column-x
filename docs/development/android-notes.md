# Android 開発ノート

Android 対応（アカウント追加、モバイルタブバー、APK 自己更新、Cookie 共有）に関する実装時の設計判断・落とし穴を記録する。

## 対象ファイル

- `src-tauri/gen/android/` 配下（app モジュール全体） — 単体テスト実行方法
- `src-tauri/gen/android/app/src/main/java/com/natsuyasai/multicolumnx/MainActivity.kt` / `src-tauri/gen/android/app/proguard-rules.pro` — ProGuard keep ルール同期
- `src-tauri/gen/android/app/src/main/java/com/natsuyasai/multicolumnx/BackupFileSelector.kt` / `MultiColumnXBackupAgent.kt` — 端末引き継ぎ（Auto Backup）対応

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

## 動画ダウンロード（進捗表示 + Foreground Serviceによるバックグラウンド中断対策）

- ダウンロードがバックグラウンドで中断される問題への対策として `VideoDownloadForegroundService` を新設した。Android 14(API 34)以降は `AndroidManifest.xml` で `android:foregroundServiceType` の明示宣言が必須（今回は `dataSync`）。`FOREGROUND_SERVICE` / `FOREGROUND_SERVICE_DATA_SYNC` 権限に加え、通知表示には Android 13(API 33)以降 `POST_NOTIFICATIONS` のランタイム許可も必要。**このプロジェクトでは許可リクエストUIをあえて作らず、「許可されていれば通知が出る、無ければ通知は出ないがダウンロード自体は成功する」という割り切りにしている**（`NotificationManagerCompat.notify` は権限が無くても何もしないだけでクラッシュしない）。同様の通知機能を追加する際はこの前例に倣ってよい。
- Foreground Serviceの開始/進捗更新/終了は、Kotlin側で1つの `Service` に対し `Intent.action`（`ACTION_START`/`ACTION_UPDATE`/`ACTION_FINISH`）で分岐する設計にした。`ACTION_START` は `ContextCompat.startForegroundService` → `ServiceCompat.startForeground(..., ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)`、`ACTION_UPDATE` は通常の `startService`（フォアグラウンド化済みのサービスへの追加Intentなので`startForegroundService`不要）、`ACTION_FINISH` は `ServiceCompat.stopForeground(STOP_FOREGROUND_REMOVE)` + `stopSelf()`。
- Rust側からの進捗通知は `MainActivity` の `notifyVideoDownloadStarted()` / `notifyVideoDownloadProgress(fileIndex: Int, fileCount: Int, current: Long, total: Long)` / `notifyVideoDownloadFinished()` を JNI経由で呼ぶ（`call_activity_method`ヘルパー、`(IIJJ)V`のようなJNIメソッドシグネチャ文字列を手書きする必要がある。`I`=int, `J`=long, `V`=void）。`total` は「不明なら0以下」というセンチネル値で表現し、Kotlin側がその場合indeterminateプログレス表示に切り替える設計にした（Option型をJNI越しに渡す煩雑さを避けるため）。
- `handle_android_video_download_request`（Rust）は複数箇所で `?` による早期returnがあるため、そのまま素直に書くと「開始は呼んだが終了(finished)を呼ばずに関数を抜けるパス」が生まれ、Foreground Serviceの通知が消えないまま残ってしまう。**処理本体を `async { ... }` ブロックに包んで結果を一旦ローカル変数で受け、成否に関わらず必ず `notify_video_download_finished()` を呼んでから元の結果を返す**、という構造にして防いだ。早期returnが多い非同期関数で「必ず後始末する」処理を挟みたい場合の定石として記録する。
- 進捗表示自体（desktop側、`popup_toolbar.ts` の `window.__TAURI__.event.listen` でRustの `app.emit_to(window_label, event, payload)` を受信する経路）は、このプロジェクトで初めて使う経路だった（既存のinjectスクリプトは全て `invoke` による一方向通知のみ）。`src-tauri/capabilities/column-webview.json` が popup ウィンドウに許可している `core:default` パーミッションセットには `core:event:default` が含まれており（Tauri v2の `gen/schemas/desktop-schema.json` で確認可能）、追加のcapabilities設定変更なしに動作した。同様にRust→WebViewへイベントを送りたくなった場合、この経路をそのまま使ってよい。

## reqwest 等ネイティブ依存クレートの Android クロスビルド

- `reqwest`（`rustls-tls` feature）が依存する `ring` crate は Android ターゲットのビルド時にネイティブ C コードのコンパイルが必要で、`ANDROID_NDK_HOME`（または `NDK_HOME`）環境変数と NDK の `clang` が見つからないとビルドに失敗する。**`cargo check`（デフォルトのdesktopターゲット）だけでは検出できず**、`cargo check --target aarch64-linux-android` や実際の `npm run tauri:android:build[:debug]` を通さないと問題が判明しない。ローカル開発機でこの手のネイティブ依存クレートを新規追加した場合は、Androidターゲットでのビルドも一度は試すこと（Android SDK/NDK が `AppData/Local/Android/Sdk` 等にインストール済みでも、シェルの環境変数 `ANDROID_HOME` / `ANDROID_NDK_HOME` が未設定だと同じエラーになる点に注意）。
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

## デバッグビルドでは検出できない不具合

- デバッグビルドは R8（難読化・最適化）が無効なため、ProGuard keep ルール漏れなどの不具合はリリースビルドでしか再現しない。Android 実機確認が必要なタスク（JNI 呼び出し・ProGuard 絡みの変更）は、必ずリリースビルドで最終確認すること。
- Android の署名鍵（アップロード用キーストア）は既存のものを変更禁止。鍵が変わると署名不一致で自己更新に失敗する。
- APK の出力パスは Tauri / AGP のバージョンで階層が変わるため、CI では固定パスではなく検索により動的に解決している。
