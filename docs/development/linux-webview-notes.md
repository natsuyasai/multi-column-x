# Linux カラム WebView 開発ノート

Linux 環境固有のカラム WebView 配置・クリッピング・WebProcess クラッシュ対策に関する実装知見を記録する。配置・クリッピングの正式仕様は `README.md`「Linux カラム WebView の配置・クリッピング仕様」に明記されているので、変更時は必ずそちらも参照・更新すること。

## 対象ファイル

- `src-tauri/src/commands/webview/column.rs` — `linux_column_layout`（純粋関数）、`resize_column_webview`
- `src/lib/rafThrottle.ts` — スクロール→再配置のフレーム間引き
- `src-tauri/Cargo.toml` — webkit2gtk のバージョンピン留め
- `src-tauri/src/commands/media_codec.rs` — `check_media_codec_support`（H.264/AAC デコーダ欠如検出）
- `src/hooks/useMediaCodecCheck.ts` / `src/components/CodecWarningDialog/CodecWarningDialog.tsx` / `src/components/TopBar/TopBar.tsx` — 検出結果の案内 UI
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

`README.md`「AppImage への GStreamer 同梱（必須）」にあるとおり `bundle.linux.appimage.bundleMediaFramework` は `true` を維持し `gst-plugins-base`/`gst-plugins-good` を同梱している。H.264/AAC についても以下の方式で対応済み:

- **AAC**: AAC-LC プロファイルのコア特許は失効済み（Fedora が2017年以降 `fdk-aac-free` として採用している判断に準拠）。CI（`.github/workflows/release.yml`）が `gst-plugins-bad`（GStreamerモノレポ `subprojects/gst-plugins-bad`）から `fdkaac` エレメントのみを自前ビルドし、`tauri.conf.json` の `bundle.linux.appimage.files` で AAC-LC 本体（`libfdk-aac.so.2`、Ubuntu universe の `libfdk-aac-dev` 由来）とともに AppImage へ直接同梱している。**同梱するのは AAC-LC 限定ビルドのみ**（HE-AAC 等の拡張プロファイルは対象外）。
- **H.264**: Cisco OpenH264 の特許ロイヤリティ負担は「Cisco 自身の配布チャネルから直接ダウンロードする」場合にのみ適用されるため（`openh264.org/faq.html`）、AppImage に同梱すると特許ライセンス上問題がある。そのため `gst-plugins-bad` の `openh264` エレメント（LGPL/BSDのグルーコードのみ、Ciscoバイナリ本体は含まない）だけを同梱し、実体の `libopenh264.so.7` はユーザーが `CodecWarningDialog` から明示的に「ダウンロードして有効化」を選んだ時のみ、Cisco 公式サーバーから直接ダウンロード・SHA256検証して取得する（Debian/Ubuntu の `libopenh264-cisco7` パッケージ、および Firefox/Chromium と同じ方式）。

- **deb 版**: 引き続き `bundle.linux.deb.depends` に `gstreamer1.0-plugins-{base,good,bad}` と `gstreamer1.0-libav` を明記しており、パッケージマネージャが依存解決するため利用者が追加作業をする必要はない。

**ローカルでのフルビルド**: `tauri.conf.json` の `bundle.linux.appimage.files` は上記の `libgstfdkaac.so` / `libgstopenh264.so` / `libfdk-aac.so.2` を `src-tauri/gstreamer-plugins/`（`.gitignore` 対象）から読む設定になっている。このディレクトリは CI（`.github/workflows/release.yml`）が `gst-plugins-bad` を自前ビルドして初めて生成されるため、ローカルで `npm run tauri:build` / `npm run tauri:build:debug` を実行して AppImage のフルビルドを試す場合は、事前に `./scripts/build-linux-codec-plugins.sh` を実行して `src-tauri/gstreamer-plugins/` にプラグインを配置しておく必要がある（release.yml の該当ステップと同じロジックをスクリプト化したもの）。未実行のまま `tauri:build` を実行すると `Failed to copy custom files: "gstreamer-plugins/libgstopenh264.so" does not exist` のようなエラーで失敗する。なお `npm run tauri:dev` はこのファイルを参照しないため影響を受けない。

検出・案内の仕組み:

- `src-tauri/src/commands/media_codec.rs` の `check_media_codec_support` Tauri コマンドが、Linux desktop に限り `gst-inspect-1.0 <element名>` をサブプロセス実行し、H.264（`avdec_h264`/`openh264dec`）・AAC（`avdec_aac`/`faad`/`fdkaacdec`）デコーダの有無を判定する。非 Linux または非 desktop（Windows/macOS/mobile）では常に「利用可能」を返すダミー実装になる。
- `src/hooks/useMediaCodecCheck.ts` が起動時（カラム復元完了後、`App.tsx` で `columnsRestored` を `ready` として渡す）に一度だけ `check_media_codec_support` を呼び出し、欠如を検出すると `src/components/CodecWarningDialog/CodecWarningDialog.tsx` を自動表示する。H.264欠如時は「ダウンロードして有効化」ボタンを表示し、`src-tauri/src/commands/openh264_fetch.rs` の `download_and_enable_h264` コマンドを呼ぶ。ダウンロード成功後は GStreamer のレジストリキャッシュを削除し、アプリの再起動を促す（`src/services/updater.ts` と同じ `@tauri-apps/plugin-process` の `relaunch()` を使用）。
- `src/components/TopBar/TopBar.tsx` は欠如検出中、警告アイコンを常駐表示し、クリックすると再度ダイアログを開ける。
- `scripts/install.sh` の `print_codec_hint()` は、AppImage同梱が何らかの理由で機能しなかった場合のフォールバック案内として維持している（`/etc/os-release` からディストロ系統を自動判定し、手動インストールコマンドを表示）。

Cisco OpenH264 ダウンロードの実装詳細:

- `src-tauri/src/linux_codec_env.rs`: アプリ起動時、ダウンロード先ディレクトリ（`$XDG_DATA_HOME` または `$HOME/.local/share` 配下の `com.natsuyasai.multicolumnx/gstreamer-openh264`）を `LD_LIBRARY_PATH` に含めた状態で自プロセスを再実行する（動的リンカが `LD_LIBRARY_PATH` を解釈するのはプロセス起動時一度きりのため、後から `set_var` しても反映されない）。
- `src-tauri/src/commands/openh264_fetch.rs`: `download_and_enable_h264` コマンドが Cisco 公式サーバー（`ciscobinary.openh264.org`、バージョン・SHA256はコード内に固定）から直接ダウンロード・検証・展開し、上記ディレクトリへ配置する。main ウィンドウ以外からの呼び出しは拒否する。

**変更時の注意点**: `CodecWarningDialog.tsx` に書かれている手動インストールコマンド文字列と `install.sh` の `print_codec_hint()` に書かれている同コマンド文字列は完全一致させること。一方だけ更新すると案内内容がアプリ内とインストーラで食い違う。Cisco OpenH264 のバージョン・SHA256（`openh264_fetch.rs` の定数）を更新する場合は、`apt-get download libopenh264-cisco7 && dpkg-deb -e` で実際の postinst スクリプトから最新値を取得して反映すること（憶測で埋めない）。
