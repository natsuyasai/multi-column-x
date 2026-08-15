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

## AppImage の H.264/AAC コーデック欠如検出

`README.md`「AppImage への GStreamer 同梱（必須）」にあるとおり、`bundle.linux.appimage.bundleMediaFramework` は `true` を維持し `gst-plugins-base`/`gst-plugins-good` を同梱しているが、**H.264/AAC デコーダを提供する `gst-plugins-bad`/`gst-libav` は意図的に同梱していない**。これは特許問題の回避が理由で、`gst-plugins-base`/`gst-plugins-good` は GStreamer プロジェクト自体が「LGPL・特許的にクリーンな要素のみ」と分類しているため同梱を継続している。

- **deb 版**: `bundle.linux.deb.depends` に `gstreamer1.0-plugins-{base,good,bad}` と `gstreamer1.0-libav` を明記しており、パッケージマネージャが依存解決するため利用者が追加作業をする必要はない。
- **AppImage 版**: 特許問題のあるコーデックをバイナリに同梱しない方針のため、H.264/AAC デコーダの導入はシステム側インストールに委ねる。そのため欠如を検出してユーザーに案内する仕組みを用意している。

検出・案内の仕組み:

- `src-tauri/src/commands/media_codec.rs` の `check_media_codec_support` Tauri コマンドが、Linux desktop に限り `gst-inspect-1.0 <element名>` をサブプロセス実行し、H.264（`avdec_h264` または `openh264dec` のいずれか）・AAC（`avdec_aac` または `faad` のいずれか）デコーダの有無を判定する。非 Linux または非 desktop（Windows/macOS/mobile）では常に「利用可能」を返すダミー実装になる。
- `src/hooks/useMediaCodecCheck.ts` が起動時（カラム復元完了後、`App.tsx` で `columnsRestored` を `ready` として渡す）に一度だけ `check_media_codec_support` を呼び出し、欠如を検出すると `src/components/CodecWarningDialog/CodecWarningDialog.tsx` の案内ダイアログを自動表示する。ダイアログには Debian/Ubuntu 系・Fedora 系・Arch 系それぞれのインストールコマンド例を表示する。
- `src/components/TopBar/TopBar.tsx` は欠如検出中、警告アイコンを常駐表示し、クリックすると再度ダイアログを開ける。
- `scripts/install.sh` の `print_codec_hint()` は、AppImage のインストール完了時に `/etc/os-release` からディストロ系統を自動判定し、同様のインストールコマンド案内をターミナルに表示する。

**変更時の注意点**: `CodecWarningDialog.tsx` に書かれているインストールコマンド文字列（`sudo apt install gstreamer1.0-plugins-bad gstreamer1.0-libav` など）と `install.sh` の `print_codec_hint()` に書かれている同コマンド文字列は完全一致させること。一方だけ更新すると案内内容がアプリ内とインストーラで食い違う。
