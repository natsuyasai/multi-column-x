# Linux カラム WebView の配置・クリッピング仕様（正式仕様）

実装ファイル・落とし穴・テスト方針は [linux-webview-notes.md](linux-webview-notes.md) を参照。

Windows / macOS ではカラムは `window.add_child()` の子 WebView で、親ウィンドウのクライアント領域によって自動的にクリップされる。一方 **Linux ではカラムが独立した `WebviewWindow`（OS ネイティブウィンドウ）** のため親クリップが効かず、横スクロールで画面端にはみ出すカラムの表示を Rust 側の座標計算で明示的に制御する。このロジックは `resize_column_webview`（`src-tauri/src/commands/webview/column.rs`）の純粋関数 `linux_column_layout` に集約されている。

仕様（横スクロール時の各カラムの可視領域）:

- **ウィンドウは常に画面内（論理 X 座標 `>= 0`）に配置する**。Linux の WM はウィンドウ X 座標を画面内へクランプするため、負の座標を指定して「スクリーン左端で自然クリップ」させる方式は機能しない（左端カラムが全幅のまま左端に居座り、完全に画面外になるまで縮まないデグレードを引き起こす）。
- **左右対称の「幅クリップ」**: 画面端にはみ出したカラムは、はみ出した分だけ幅を縮めて表示する（左端・右端とも同じ挙動）。可視領域は `left = max(0, x)` 〜 `right = min(x + width, ウィンドウ幅)` で求め、幅 `right - left` で配置する。
- **完全に画面外**（`x + width <= 0` または `x >= ウィンドウ幅`）のカラムは `hide()` する。
- **起動時は `visible(false)` で非表示作成**し、全カラム作成後に `recalculateAllBounds`（→ `resize_column_webview`）で WM が確定した座標へ配置してから `show()` する。WM がウィンドウ位置を確定する前に誤った座標で可視化すると WebKit WebProcess が不正状態で起動し、カラムが空白になる。

`linux_column_layout` は純粋関数として example テストとプロパティテスト（`x_offset >= 0` など WM クランプ回避の不変条件）で仕様を固定している。**このクリッピング挙動を変更する場合は、必ず `linux_column_layout` のテストで仕様を表現してから実装すること**（過去にインライン実装のままテストなしで挙動が変わりデグレードした経緯がある）。

## WebProcess クラッシュ対策（横スクロール・スリープ復帰）

Linux の独立 `WebviewWindow` は WebKitGTK の WebProcess で描画されるが、(1) 横スクロールで `resize_column_webview` が高頻度に連続発火したとき、(2) スリープ復帰後などに、WebProcess がクラッシュして白画面/フリーズになることがある。次の3層で予防と復旧を行う:

- **予防（スクロール）**: スクロールバー操作 → 全カラム再配置を `rafThrottle`（`src/lib/rafThrottle.ts`）で 1 フレーム 1 回に間引き、`resize_column_webview` の連続発火を抑える（`useDesktopColumns.handleScrollbarScroll`）。
- **自動復旧**: カラム作成時に webkit2gtk の `connect_web_process_terminated` を接続し、クラッシュ時に `column-webview-crashed`（payload=columnId）を emit する。TS 側 `useColumnCrashRecovery` が当該カラムを再生成して自動復旧する。無限ループを防ぐため復旧には二重のガードを設ける: (a) 直近再生成から `CRASH_RECOVERY_COOLDOWN_MS`（5秒）以内の重複クラッシュは無視、(b) 同一カラムの連続再生成が `MAX_CRASH_RECOVERY_ATTEMPTS`（3回）に達したら自動復旧を諦めて手動再読込に委ねる。ただし `CRASH_RECOVERY_STABILITY_RESET_MS`（60秒）以上安定稼働してからのクラッシュは新規事象として試行回数をリセットする（スリープ復帰などでの再発は再び自動復旧できる=バックオフ）。
- **手動復旧**: カラムヘッダの「⟳ ページを再読み込み」ボタンはデスクトップでは `location.reload` ではなく WebView 自体の再生成（`recreateColumnWebview`）を行い、`location.reload` が効かない白画面からも復旧できる。モバイル（Android ネイティブ WebView）は従来どおりページ再読み込み。

webkit2gtk は wry と同一バージョン（`=2.0.2`, `v2_40`）を `[target.'cfg(target_os = "linux")'.dependencies]` でピン留めする（`PlatformWebview::inner()` の戻り型を一致させるため）。

## AppImage への GStreamer 同梱（必須）

`tauri.conf.json` の `bundle.linux.appimage.bundleMediaFramework` は **`true` を維持すること**。AppImage は `LD_LIBRARY_PATH` を同梱ライブラリに向けて動作するため、GStreamer プラグイン（`appsink`=gst-plugins-base、`autoaudiosink`=gst-plugins-good ほか）を同梱しないと、同梱 WebKit が動画/音声再生時に見つからないメディア要素（NULL）へ `g_signal_connect` して **WebProcess がクラッシュ（reason=Crashed）** する。x.com の home タイムラインは動画を含むため、可視状態のカラムが起動直後からクラッシュ → 上記自動復旧が延々と再生成する無限ループに陥る（システムに GStreamer が入っていても AppImage 内からは参照されないため `npm run tauri:dev` や素のバイナリ実行では再現せず、AppImage 起動でのみ再現する点に注意）。

同種の不足を deb 版でも防ぐため、`bundle.linux.deb.depends` に `gstreamer1.0-plugins-{base,good,bad}` と `gstreamer1.0-libav` を明記している。

なお、AAC デコーダ（AAC-LC プロファイル限定の `libfdk-aac` + GStreamer `fdkaac` プラグイン）は、AAC-LC のコア特許が失効済みと判断し、CI で `gst-plugins-bad` から `fdkaac` エレメントのみを自前ビルドして AppImage に実際に同梱している。一方 H.264 デコーダ（Cisco OpenH264）は、Cisco の特許ロイヤリティ負担が「Cisco 自身の配布チャネルから直接ダウンロードする」場合にのみ適用されるため AppImage に同梱できず、Cisco 公式サーバーから直接ダウンロードする方式（Firefox/Chromium と同じ方式）の Rust コマンド `download_and_enable_h264` を用意している。欠如検出の `check_media_codec_support` コマンドと `scripts/install.sh` の案内表示も残しているが、アプリ内の案内 UI（起動時チェック・案内ダイアログ）は削除済みで、現在フロントからの呼び出し口は無い。詳細は `docs/development/linux-webview-notes.md`「AppImage の H.264/AAC コーデック対応」を参照。
