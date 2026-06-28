---
name: linux-column-clip-spec
description: Linuxカラムの横スクロール時クリッピング仕様と過去のデグレード経緯
metadata:
  type: project
---

Linux ではカラムが独立 `WebviewWindow`（親クリップが効かない）ため、横スクロール時のはみ出し表示を `resize_column_webview` の純粋関数 `linux_column_layout`（src-tauri/src/commands/webview/column.rs）で制御する。

**仕様**: ウィンドウは常に論理X座標 `>= 0` に配置（Linux WM が負座標をクランプするため）。左右対称の幅クリップ＝`left=max(0,x)` 〜 `right=min(x+width, win)` の可視幅で表示。完全に画面外（`x+width<=0` か `x>=win`）は hide。起動時は `visible(false)` 作成→全カラム作成後 `recalculateAllBounds` で配置してから show（誤座標可視化での WebKit 空白カラム対策）。

**Why**: この左右対称幅クリップは過去 e99d82a で実装済みだったが、インライン実装＆テスト無しのため「いつの間にかデグレード」した。2026-06-28 セッションでも私が「負の screen_x でスクリーン左端クリップ（案A）」に変えて再デグレード（左端カラムが全幅のまま左端に居座り、完全に画面外になるまで縮まない）→ 実機指摘で修正。案A は WM クランプで機能しない。

**How to apply**: このクリッピング挙動を変えるときは必ず `linux_column_layout` のテスト（example＋プロパティ `x_offset>=0`＋回帰テスト「全幅で居座らない」）で仕様を表現してから実装する。テストは実装をなぞるのでなく仕様（x_offset>=0・幅クリップ）をエンコードすること（案A時はテストが実装に追従して壊れていた）。仕様は README.md「Linux カラム WebView の配置・クリッピング仕様」にも記載。
