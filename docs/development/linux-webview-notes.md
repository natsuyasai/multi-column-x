# Linux カラム WebView 開発ノート

Linux 環境固有のカラム WebView 配置・クリッピング・WebProcess クラッシュ対策に関する実装知見を記録する。配置・クリッピングの正式仕様は `docs/development/linux-column-spec.md`に明記されているので、変更時は必ずそちらも参照・更新すること。

## 対象ファイル

- `src-tauri/src/commands/webview/column.rs` — `linux_column_layout`（純粋関数）、`resize_column_webview`
- `src/lib/rafThrottle.ts` — スクロール→再配置のフレーム間引き
- `src-tauri/Cargo.toml` — webkit2gtk のバージョンピン留め
- `src-tauri/src/commands/media_codec.rs` — `check_media_codec_support`（H.264/AAC デコーダ欠如検出）
- `src-tauri/src/commands/openh264_fetch.rs` — `download_and_enable_h264`（Cisco OpenH264 のオンデマンド取得）
- `src-tauri/src/linux_codec_env.rs` — `ensure_openh264_ld_library_path`（再実行）/ `configure_gstreamer_env`（GStreamer 環境変数）
- `src/hooks/useH264Setup.ts` / `src/components/H264SetupDialog/` / `src/components/AppSettingsPanel/LinuxVideoPlaybackSection.tsx` — H.264 取得の案内 UI
- `scripts/build-linux-codec-plugins.sh` / `scripts/verify-appimage-media.sh` — 同梱プラグインのビルドと AppImage 検査
- `scripts/install.sh` の `print_codec_hint()` — AppImage インストール時の案内

## Linux カラム WebView のクリッピング（デグレ注意）

Linux ではカラムが独立 `WebviewWindow`（親クリップが効かない）ため、横スクロール時のはみ出し表示を `resize_column_webview` の純粋関数 `linux_column_layout`（`src-tauri/src/commands/webview/column.rs`）で制御する。要点:

- ウィンドウは**常に論理 X 座標 `>= 0` に配置**する。Linux WM が負座標をクランプするため、「負の `screen_x` でスクリーン左端クリップ」方式は機能しない（左端カラムが全幅のまま居座るデグレードになる）。
- 左右対称の**幅クリップ**（はみ出し分だけ幅を縮める）。完全に画面外は `hide()`。起動時は `visible(false)` 作成 → 全カラム作成後に `recalculateAllBounds` で配置してから `show()`（誤座標可視化での WebKit 空白カラム対策）。

**この挙動は過去にインライン実装・テスト無しで複数回デグレードしている。変更する場合は必ず `linux_column_layout` のテスト（example＋プロパティ `x_offset>=0`＋左右の「全幅で居座らない」回帰テスト）で先に仕様を表現すること。テストは実装をなぞらず仕様をエンコードする（過去、実装に追従してテストが壊れていた案があった）。**

## Linux WebProcess クラッシュ対策（横スクロール・スリープ復帰）

WebKitGTK の WebProcess は横スクロールでの `resize_column_webview` 連続発火やスリープ復帰でクラッシュ（白画面/フリーズ）し得る。3層で予防・復旧する:

- **予防**: スクロール → 再配置を `src/lib/rafThrottle.ts` で 1 フレーム 1 回に間引く（`useDesktopColumns.handleScrollbarScroll`）。
- **自動復旧**: カラム作成時に webkit2gtk `connect_web_process_terminated` を接続 → `column-webview-crashed`（payload=columnId）emit → TS `useColumnCrashRecovery` が再生成（同一カラム `CRASH_RECOVERY_COOLDOWN_MS` クールダウン）。
- **手動復旧**: ヘッダ「⟳」はデスクトップで `recreateColumnWebview`（WebView 再生成）。モバイルは従来の `location.reload`。
- webkit2gtk は wry と同一 `=2.0.2`/`v2_40` をピン留め（`PlatformWebview::inner()` の型一致のため）。バージョンを上げる際は wry 側のピンと同時に変更すること。

## AppImage の H.264/AAC コーデック対応

`docs/development/linux-column-spec.md`「AppImage への GStreamer 同梱（必須）」にあるとおり `bundle.linux.appimage.bundleMediaFramework` は `true` を維持し `gst-plugins-base`/`gst-plugins-good` を同梱している。H.264/AAC は以下の方式で対応している。

### 根本原因

X の動画は MP4（`video/x-h264, stream-format=avc`）で、同梱の `openh264dec` は `stream-format=byte-stream` しか受け付けない。両者をつなぐ `h264parse`（gst-plugins-bad の `videoparsersbad`）が AppImage に無かったため、デコーダが見つからず動画が再生できなかった（`avdec_h264` も未同梱で代替も無い）。deb 版は `gstreamer1.0-plugins-bad` / `gstreamer1.0-libav` に依存するため影響しない。AppImage 固有の問題。

### 同梱物の構成

`tauri.conf.json` の `bundle.linux.appimage.files` で `src-tauri/gstreamer-plugins/`（`.gitignore` 対象、`scripts/build-linux-codec-plugins.sh` が生成）の成果物を次のように配置する。

- **AppImage 直下（`usr/lib` 系。linuxdeploy が依存解決してよいもの）**: `libgstfdkaac.so` / `libfdk-aac.so.2`（AAC-LC）、`libgstvideoparsersbad.so`（`h264parse`）、`libgstcodecparsers-1.0.so.0`、`libgstcodecs-1.0.so.0`
- **`usr/share/multicolumnx/gst-optional/{plugins,lib}`**: `plugins/libgstopenh264.so`（OpenH264 のグルー）、`plugins/libgstva.so`（VA プラグイン）、`lib/libgstva-1.0.so.0`

`gst-optional` を `usr/lib` の外に置くのは、linuxdeploy の依存解決の対象外にするため。linuxdeploy は `usr/bin`・`usr/lib` 配下の ELF の依存ライブラリを自動で同梱するが、Tauri は linuxdeploy に `--exclude-library` を渡せない。`libgstopenh264.so` / `libgstva.so` を `usr/lib` 側に置くと `libopenh264.so.7` / `libva` が自動で同梱されてしまう（実際、以前の AppImage には CI ランナーの Ubuntu パッケージ由来の `libopenh264.so.7` が混入していた）。`usr/share` 配下は走査されないため、これらは同梱されずに済む。

`gst-optional` 配下の ELF は `scripts/build-linux-codec-plugins.sh` が patchelf で rpath を設定し、`usr/lib` の同梱 GStreamer ライブラリ（`libgstvideo` など）を解決させる（`plugins/*.so` は `$ORIGIN/../lib:$ORIGIN/../../../../lib`、`lib/*.so.0` は `$ORIGIN/../../../../lib`）。

### libopenh264 を同梱しない理由と取得方法

Cisco OpenH264 の特許ロイヤリティ負担は「Cisco 自身の配布チャネルから直接ダウンロードする」場合にのみ適用される（`openh264.org/faq.html`）。Ubuntu パッケージ由来のバイナリを同梱するのはこの条件の対象外のため、AppImage には同梱しない。実体の `libopenh264.so.7` は、ユーザーの同意を得たうえで `download_and_enable_h264` が Cisco 公式サーバーから直接ダウンロード・SHA256 検証して取得する（Firefox/Chromium と同じ方式）。

### libva はホストのものを使う

`libgstva.so` は同梱するが `libva` 本体は同梱せず、ホストの `libva` とドライバ（`/usr/lib/x86_64-linux-gnu/dri/*_drv_video.so` など）を使う。同梱 `libva` とホストのドライバの ABI が噛み合わなくなるのを避けるため。ホストに `libva` / ドライバが無い場合、GStreamer は VA プラグインを無効化し、`openh264dec` に自動でフォールバックする。

### 起動時の環境構築（`configure_gstreamer_env`）

`run()` 冒頭で `ensure_openh264_ld_library_path()`（`LD_LIBRARY_PATH` を整えて自プロセスを再実行）の**直後**に呼ぶ（再実行後のプロセスで実行する）。WebKit の WebProcess は起動時の環境変数を継承するため、Tauri 構築前の `set_var` で反映される。

- `APPDIR` があれば `GST_PLUGIN_PATH_1_0` に `$APPDIR/usr/share/multicolumnx/gst-optional/plugins` を追加する。
- `settings.json` の `appSettings.globalSettings.hardwareVideoDecodeEnabled` を読み、`false` なら `GST_PLUGIN_FEATURE_RANK` に HW デコーダ群（`HW_VIDEO_DECODERS`: `vah264dec` / `vaapi*` / `nv*dec` / `v4l2sl*dec` など）を `:NONE` で追加する。読めない・壊れている・キー欠落は有効扱い（既定 `true`）。AppImage / deb 共通で Linux desktop のみ。

**冪等に作ってある理由**: 設定を変えて `relaunch` すると、環境変数が子プロセスへ継承された状態でもう一度この関数が走る。パスは既に含まれていれば追加しない。ランクは継承された `HW_VIDEO_DECODERS` のエントリを毎回取り除いてから付け直す（HW デコードを無効から有効へ戻したとき、前回の `:NONE` が残って効かなくなるのを防ぐ）。ユーザー自身が設定した他のランク指定は保持する。この組立ては純粋関数（`append_plugin_path` / `hw_decode_rank_override` / `read_hw_decode_enabled`）に切り出してテストしている。

### H.264 可否判定（`check_media_codec_support`）

Linux desktop に限り判定する。非 Linux / mobile は常に「利用可能」を返すダミー実装。戻り値は `h264Available` / `aacAvailable` / `h264DownloadApplicable`（camelCase）。

- **AppImage 起動**（`APPIMAGE` と `APPDIR` の両方が設定されている）: ホストの `gst-inspect-1.0` は同梱環境と一致しないため使わない。`h264Available` = パーサ（`$APPDIR/usr/lib/gstreamer-1.0/libgstvideoparsersbad.so`）が存在 **かつ** デコーダ（`openh264_lib_dir()/libopenh264.so.7`）が存在。AAC は fdkaac 同梱のため常に `true`。`h264DownloadApplicable = true`。
- **deb など非 AppImage の Linux**: 従来どおり `gst-inspect-1.0` で `avdec_h264`/`openh264dec`（H.264）、`avdec_aac`/`faad`/`fdkaacdec`（AAC）の有無を判定する。`h264DownloadApplicable = false`。

デコーダの判定はダウンロード先のファイル基準。ホストに `libopenh264-7` が入っていればダウンロード前でも再生できるが、案内は出る（許容している）。

### 取得案内の UI

状態は `useH264Setup`（`src/hooks/useH264Setup.ts`）が持ち、`App.tsx` で 1 インスタンスを生成して案内ダイアログ（`H264SetupDialog`）と設定画面で共有する。

- **起動時の案内**: `columnsRestored` が true になってから一度だけ `check_media_codec_support` を呼ぶ。`h264DownloadApplicable && !h264Available && !h264DownloadPromptDismissed` のときだけダイアログを出す（HW デコードが使える環境でも出す）。判定の invoke が失敗したときは fail-open（案内しない）。
- **拒否は設定に記憶**: 「今はしない」で `h264DownloadPromptDismissed: true` を保存し、次回以降は案内しない。Escape・「後で」・失敗後の「閉じる」は拒否を保存しない閉じる操作（誤操作で案内が拒否扱いにならないようにするため）。ダウンロード失敗も拒否扱いにはせず、エラー表示と「再試行」を出す（次回起動で再び案内される）。
- **設定画面**（`LinuxVideoPlaybackSection`、Linux のみ）: AppImage では H.264 の「有効化」ボタン（取得済みなら「有効化済み」表示、成功後は再起動案内）。ハードウェアデコードのチェックボックスは AppImage / deb とも表示し、起動時に読んだ値から変更されたら「再起動後に反映されます」を表示する。拒否後でもここから有効化できる。
- **`anyDialogOpen` への追加が必須**: カラム WebView は OS ネイティブウィンドウで CSS の `z-index` が効かないため、`App.tsx` の `anyDialogOpen` に `h264Setup.isDialogOpen` を含めないとダイアログがカラム WebView の下に隠れる（`docs/development/column-layout-notes.md` 参照）。新しいダイアログを足すときも同様。
- ダウンロード成功後に `download_and_enable_h264` が GStreamer のレジストリキャッシュを削除する。反映にはアプリの再起動が必要で、ダイアログ・設定画面の「今すぐ再起動」が `relaunch()` を呼ぶ。
- アプリ内にはインストールコマンドを表示しない。そのため `scripts/install.sh` の `print_codec_hint()` との文字列一致を保つ必要は無い（`print_codec_hint()` はアプリ内ダイアログでの取得を案内したうえで、手動インストールコマンドをフォールバックとして表示する）。

### 設定項目（端末依存・バックアップ対象外）

`hardwareVideoDecodeEnabled`（既定 `true`）と `h264DownloadPromptDismissed`（既定 `false`）は端末の環境（GPU/ドライバ、取得済みの libopenh264）に依存するため、バックアップ対象外にしている（`EXCLUDED_GLOBAL_SETTINGS_KEYS` に含め、復元時は `apply_onto` で端末の現在値を保持する）。既定値は Rust `impl Default` / TS `DEFAULT_GLOBAL_SETTINGS` / `contracts/default-settings.json` の 3 箇所を同期させる。

### AAC

AAC-LC プロファイルのコア特許は失効済み（Fedora が2017年以降 `fdk-aac-free` として採用している判断に準拠）。`gst-plugins-bad`（GStreamer モノレポ `subprojects/gst-plugins-bad`）から `fdkaac` エレメントのみを自前ビルドし、AAC-LC 本体の `libfdk-aac.so.2`（Ubuntu universe の `libfdk-aac-dev` 由来）とともに AppImage 直下へ同梱する。**同梱するのは AAC-LC 限定ビルドのみ**（HE-AAC 等の拡張プロファイルは対象外）。

### deb 版

`bundle.linux.deb.depends` に `gstreamer1.0-plugins-{base,good,bad}` と `gstreamer1.0-libav` を明記しており、パッケージマネージャが依存解決するため利用者が追加作業をする必要はない。

### CI 検査（`scripts/verify-appimage-media.sh`）

`verify-appimage-media.sh <AppImage> <libopenh264.so.7 を含むディレクトリ>` は AppImage を展開して次を検査する。第 2 引数の `libopenh264.so.7` だけを一時ディレクトリへ複製して使う（ダウンロード後の状態の代用）。

- **A（含まれない）**: `libopenh264*` と `libva*.so*` が AppImage 内に無い。linuxdeploy が `gst-optional` を辿って再混入したことを検出する。
- **B（含まれる）**: `libgstvideoparsersbad.so` / `libgstcodecparsers-1.0.so.0` / `gst-optional/plugins/{libgstopenh264.so,libgstva.so}` が存在する。
- **C（デコード）**: 同梱環境のみで `scripts/fixtures/h264-high-aac.mp4`（High / I420 + AAC）を `decodebin3` で再生し、30 秒以内に `Got EOS` に到達する（`vah264dec` はランク NONE にして openh264 を使う）。progressive 経路のみの担保で、MSE 経路は手動確認が必要。
- **D（rpath）**: `gst-optional` 配下と `libgstvideoparsersbad.so` を `ldd` し、`libgst*` がすべて AppImage 内（`usr/`）に解決され、`not found` が無い（`libva*` はホスト依存のため許容）。C は `usr/lib` をパスに含むため rpath 自体は検証できず、D が `$ORIGIN/../../../../lib` を担保する。

`release.yml` の `desktop` ジョブ（ubuntu のみ）では、検査を 2 回実行する。

- **事前ゲート（`Build and verify AppImage media bundle`）**: tauri-action の**前**に、`createUpdaterArtifacts:false` で AppImage をビルドして検査する。失敗するとジョブがそこで止まり、tauri-action に到達しないため AppImage はアップロードされない。署名鍵は渡さない。
- **出荷物の再検査（`Re-verify uploaded AppImage media bundle`）**: tauri-action の**後**に、アップロード済みの AppImage（`src-tauri/target/release/bundle/appimage/`）を再度検査する。

既知の制約: tauri-action は別途再バンドルするため、事前に検査した AppImage と出荷物はバイト一致しない可能性がある。そのため事後の再検査も行う。事後検査が失敗した場合、アップロードは済んでいるが、リリースは draft のままで（`publish-release` も自動公開はせず `draft: true` で更新するだけ）、ジョブが赤くなるため、メンテナが公開前に気づける。

### ローカルでのフルビルド

`npm run tauri:build` などで AppImage のフルビルドを試す場合は、事前に `./scripts/build-linux-codec-plugins.sh` で `src-tauri/gstreamer-plugins/` を生成する（未実行だと `Failed to copy custom files: "gstreamer-plugins/..." does not exist` で失敗する）。`npm run tauri:dev` はこのディレクトリを参照しない。

1. 依存: `sudo apt install libfdk-aac-dev libopenh264-dev libgstreamer1.0-dev libgstreamer-plugins-base1.0-dev gstreamer1.0-tools meson ninja-build libva-dev libdrm-dev libgudev-1.0-dev patchelf`
2. `./scripts/build-linux-codec-plugins.sh`
3. `GSTREAMER_PLUGINS_DIR` を **CI 相当のプラグイン集合に固定**してから `npm run build:inject && npx tauri build --bundles appimage -c '{"bundle":{"createUpdaterArtifacts":false}}'`
4. `./scripts/verify-appimage-media.sh src-tauri/target/release/bundle/appimage/*.AppImage /usr/lib/x86_64-linux-gnu`

手順 3 が必要なのは、linuxdeploy-plugin-gstreamer が**システムのプラグインディレクトリ全部**を同梱するため。開発機には `gst-plugins-bad` / libav / vaapi などが入っていることが多く、そのままビルドすると CI と別物になり、検査 A が無関係な理由（システムの openh264 プラグイン経由の `libopenh264` など）で失敗する。CI 相当のディレクトリ（自作 3 種 `libgstfdkaac.so` / `libgstopenh264.so` / `libgstvideoparsersbad.so` を除いた、現行リリース AppImage と同じ `gstreamer-1.0/*.so` をシステムから複製したもの）を用意し、`GSTREAMER_PLUGINS_DIR` に指定する。ビルドログの `Copying plugin: ...` がそのディレクトリ由来であることも確認する。

### 検証時の落とし穴

- 展開ツリー（`--appimage-extract` の `squashfs-root`）で実行する場合は `APPDIR` と `APPIMAGE` を手動で `export` する（AppRun のフックが `${APPDIR}` を使い、未設定だとプラグインパスが空になって検証が無効になる。`APPIMAGE` は AppImage 判定に使う）。実 `.AppImage` で検証してもよい。
- `GST_REGISTRY_1_0` を一時パスに分離する（`~/.cache/gstreamer-1.0` の共有レジストリを汚さない・古いレジストリに惑わされない）。
- `LD_LIBRARY_PATH` に**ホストの lib ディレクトリ（`/usr/lib/x86_64-linux-gnu` など）を入れない**。`LD_LIBRARY_PATH` は RUNPATH より優先されるため、ホスト版の `libgstcodecparsers` などに解決されて同梱側の欠落を見逃す。
- usr/lib 向けにソースビルドした `libgstcodecs` / `libgstcodecparsers` / `libgstvideoparsersbad` は、RUNPATH を AppDir 内の最終配置に合わせて patchelf する（`build-linux-codec-plugins.sh`）。ビルドツリー相対のままだと、システムに `libgstcodecparsers` が無い環境（CI ランナー）で linuxdeploy が `Could not find dependency` で失敗する。開発機にはシステム版があるため見逃しやすい。
- テスト素材は `format=I420` の High プロファイルにする。`x264enc` の既定（High 4:4:4）は openh264 が非対応で偽陰性になる。
- 検証用のホストの GStreamer と同梱側のバージョンは一致させる（CI は同一ランナーのため一致する）。

### HW デコード（VA-API）

VA プラグイン（`libgstva.so`）+ ホストの `libva` で `vah264dec` が選ばれ、`DMABuf` 出力でエラー無く再生できることを確認済み。`GST_PLUGIN_FEATURE_RANK=vah264dec:NONE` にすると `openh264dec` にフォールバックする（設定画面のチェックボックスと同じ仕組み）。

CPU 使用率の参考値（WebKitWebProcess 合計、5 秒間隔 12 サンプル平均、2026-10-09 の調査時の実測）: h264parse 無し（再生不可）33.5%、h264parse 追加＋ openh264 の SW デコード 52.5%。**参考値であり、同一動画・同一条件の比較ではない**（SW デコードでは、再生が成立して自動再生動画を実際にデコードする分だけ CPU が増える。HW デコードの効果は別途手動テストで確認する）。

### 動画タイムラインのスピナー・CPU 高止まり（解決済み）

**症状**: 動画を含むツイートを読み込むと、X のローディングスピナーが回り続け、`WebKitWebProcess` の CPU が高止まりする。動画を手動でクリックすると収まる。

**原因**: GStreamer のデコーダではなく、「動画の自動再生停止」（`videoAutoPlayStopEnabled`、既定 `true`、`src-tauri/src/inject/_src/video_control.ts`）が X のプレイヤーと `play()` / `pause()` の無限ループを起こしていた。旧実装は `play` イベントのたびに `pause()` しており、X は pause されると `play()` を呼び直す。2026-10-09 の実測（Linux、動画 2 個、33 秒）で `play` 2614 回 / `pause` 2613 回（約 79 回/秒）。`readyState` は常に 4 でロードは完了、`waiting` / `stalled` は 0 回。設定を OFF にすると収まる。ユーザーがクリックすると `unlockedVideos` に入りループが止まる。

**対策（全 OS 共通）**: `HTMLMediaElement.prototype.play` を差し替え、未アンロックの `<video>`（mediaviewer 以外）について、(1) 最初の `play()` だけ本物を通す、(2) `playing` 直後に 1 回だけ `pause()` する、(3) 2 回目以降の `play()` は何もせず解決済みの Promise を返す。これで `play` / `pause` イベントが連打されない。`play()` を経ない再生（`autoplay` 属性）には従来どおり `play` イベントでの `pause()` を保険として残し、最初の `play()` 通過中の動画だけ止めない。

**不採用案**:

- すべての `play()` を握りつぶす: ループは止まるが、X の期待する `playing` が来ず、スピナーが残った（実機確認済み）。
- `pause()` を 1 回だけにする: X の再試行が続く限りループが再発する見込みで、スクロールによる再マウントの再発防止（動画自動再生ブロックの無期限化）とも衝突する。
- Linux だけ機能を無効化する: 機能が Linux で効かなくなる。

**未確認**: Windows / Mac / Android での実機動作（手動テスト項目）。他 OS でも同じループは潜在的に起きうるが、実測していない。

### 取得（ダウンロード）の実装詳細

- `src-tauri/src/linux_codec_env.rs`: アプリ起動時、ダウンロード先ディレクトリ（`$XDG_DATA_HOME` または `$HOME/.local/share` 配下の `com.natsuyasai.multicolumnx/gstreamer-openh264`）を `LD_LIBRARY_PATH` に含めた状態で自プロセスを再実行する（動的リンカが `LD_LIBRARY_PATH` を解釈するのはプロセス起動時一度きりのため、後から `set_var` しても反映されない）。
- `src-tauri/src/commands/openh264_fetch.rs`: `download_and_enable_h264` が Cisco 公式サーバー（`ciscobinary.openh264.org`、バージョン・SHA256 はコード内に固定）から直接ダウンロード・検証・展開し、上記ディレクトリへ配置する。main ウィンドウ以外からの呼び出しは拒否する。ファイル名 `libopenh264.so.7` は `OPENH264_LIB_FILENAME` を `media_codec.rs` と共有している。

**変更時の注意点**: Cisco OpenH264 のバージョン・SHA256（`openh264_fetch.rs` の定数）を更新する場合は、`apt-get download libopenh264-cisco7 && dpkg-deb -e` で実際の postinst スクリプトから最新値を取得して反映すること（憶測で埋めない）。
