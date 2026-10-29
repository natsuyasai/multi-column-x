# 開発ノート一覧

> 初めてこのプロジェクトに触れる人は、先に [開発者ガイド（docs/developer-guide/index.html）](../developer-guide/index.html) で全体像と各層の設計、機能追加のレシピを確認するとよい（ブラウザで直接開ける HTML。構成図・処理フローの再生・一覧検索つき）。

過去の機能実装時に得られた、`CLAUDE.md` の要約だけでは伝わらない設計判断・落とし穴・仕様の背景を記録したドキュメント群。コードを変更する前に、関連する領域のノートに目を通すことを推奨する。

- [column-layout-notes.md](column-layout-notes.md) — グリッドレイアウト、カラム並べ替え、モバイルのカラム切り替え（スワイプバー）
- [compose-popup-topbar-notes.md](compose-popup-topbar-notes.md) — 投稿ポップアップ、アカウントセッション切り替え、TopBar、ウィンドウ位置永続化
- [android-notes.md](android-notes.md) — Android のアカウント追加・モバイルタブバー・APK 自己更新・Cookie 共有
- [inject-ipc-shortcuts-notes.md](inject-ipc-shortcuts-notes.md) — inject スクリプトの TypeScript ビルド化、ログプラグイン、IPC 定数の同期箇所、キーボードショートカット
- [linux-webview-notes.md](linux-webview-notes.md) — Linux カラム WebView の配置・クリッピング仕様、WebProcess クラッシュ対策
- [release-theme-reauth-notes.md](release-theme-reauth-notes.md) — 意図的にスコープ外とした判断、リリース CI / 自動更新、テーマ切替、更新進捗表示、再認証（Cookie 上書き）
- [api-rate-limit-operations-notes.md](api-rate-limit-operations-notes.md) — API レート制限モニターのヘッダ仕様、severity 判定ロジック、operationName（bucketKey）一覧
- [topbar-column-reorder-notes.md](topbar-column-reorder-notes.md) — TopBar（desktop）のカラム並び替え（dnd-kit）のドラッグしきい値・click 抑制・Storybook play 上の注意
- [backup-restore-notes.md](backup-restore-notes.md) — バックアップ／リストア（ファイル形式、ホワイトリスト出力、アカウント紐づけ、復元手順、退避、Android SAF、xUserId 取得）。手動テスト項目は [backup-restore/integration-test.md](backup-restore/integration-test.md)
- [settings-file-crash-safety-notes.md](settings-file-crash-safety-notes.md) — settings.json のアトミック書き込み、起動時の検査と復旧、`.prev` 世代、読み込み失敗時の保存ガード
- [browser-extensions-notes.md](browser-extensions-notes.md) — ブラウザ拡張機能（Windows のみ）：永続化（`browserExtensions` キー）、reconcile、WebView2 の PoC で確認した事実、不採用案、落とし穴、macOS / Linux を見送った調査結果。手動テスト項目は [browser-extensions/integration-test.md](browser-extensions/integration-test.md)
- [i18n-notes.md](i18n-notes.md) — 多言語対応（日本語／英語）：辞書とキーの規約、名前空間、用語集、新規文言の追加手順、React 外・純粋関数での翻訳、`expectNoJapanese` によるテスト
- [ui-scale-notes.md](ui-scale-notes.md) — アプリUI表示サイズ（端末倍率への追従と設定での上書き）：`<html>` の font-size による倍率、UI 寸法の rem 規約、ネイティブ bounds 用の rem 定数、Android のパネル型ダイアログ全画面化
- [external-link-new-window-notes.md](external-link-new-window-notes.md) — 外部リンクの新規ウィンドウ処理：`on_new_window` で http/https/mailto/tel を既定ブラウザで開き常に Deny する仕組み（iframe 内リンク対応）、`.disable_drag_drop_handler()`
- [desktop-file-drop/integration-test.md](desktop-file-drop/integration-test.md) — デスクトップ版の画像ファイルドラッグ&ドロップ添付の手動テスト項目

## リファレンス

- [project-structure.md](project-structure.md) — `src/` / `src-tauri/` / Android Kotlin 層のファイル構成
- [tauri-commands.md](tauri-commands.md) — アプリ独自 Tauri コマンド一覧と ACL（capability）更新ルール
- [architecture-overview.md](architecture-overview.md) — z-index・remote capability・更新セキュリティ・serde・条件コンパイル・inject ビルド・グリッドの注意点
- [linux-column-spec.md](linux-column-spec.md) — Linux カラム WebView 配置・クリッピングの正式仕様、クラッシュ対策、GStreamer 同梱
