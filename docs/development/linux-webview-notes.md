# Linux カラム WebView 開発ノート

Linux 環境固有のカラム WebView 配置・クリッピング・WebProcess クラッシュ対策に関する実装知見を記録する。配置・クリッピングの正式仕様は `README.md`「Linux カラム WebView の配置・クリッピング仕様」に明記されているので、変更時は必ずそちらも参照・更新すること。

## 対象ファイル

- `src-tauri/src/commands/webview/column.rs` — `linux_column_layout`（純粋関数）、`resize_column_webview`
- `src/lib/rafThrottle.ts` — スクロール→再配置のフレーム間引き
- `src-tauri/Cargo.toml` — webkit2gtk のバージョンピン留め

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
