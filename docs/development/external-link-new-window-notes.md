# 外部リンクの新規ウィンドウ処理（iframe 内リンク対応）

## 症状

ツイートの YouTube 埋め込み（`x.com/i/cards-frame` 内の `https://www.youtube.com/embed/...` iframe）の中のリンクを
クリックしても、既定ブラウザで開かない。YouTube に限らず、**x.com 以外のオリジンの iframe 内の `target=_blank` リンク全般**で起きる。
ツイート本文の t.co リンク（メインフレーム）は従来から開けた。

## 根本原因

- `tauri-plugin-opener` の注入スクリプト（`init-iife.js`）は `js_init_script` として**全フレーム**で動く。
  クリックされた `target=_blank` リンクを `preventDefault()` したうえで IPC `plugin:opener|open_url` を呼ぶ。
- iframe の origin（youtube.com 等）は `src-tauri/capabilities/column-webview.json` の `remote.urls`（x.com / twitter.com のみ）に無く、
  IPC は `Command plugin:opener|open_url not allowed by ACL` で拒否される。既定動作は先に潰されているので何も起きない。
- メインフレーム（x.com）からの `open_url` は成功する。

## 設計判断

IPC・capability に頼らず、**Rust 側の `on_new_window`（Tauri 2.11 の `WebviewBuilder` / `WebviewWindowBuilder`）で新規ウィンドウ要求を処理する**。

- デスクトップでは opener の自動クリックスクリプトを無効化する（`src-tauri/src/lib.rs` の `opener_js_links_on_click()`、mobile のみ有効）。
- `src-tauri/src/commands/webview/external_link.rs` の `new_window_handler` を、カラム / ポップアップ / コンポーズの**全 WebView builder** に付ける。
  - URL スキームが http / https / mailto / tel のときだけ Rust から外部ブラウザで開く（`OpenerExt::open_url`）。
  - 応答は常に `NewWindowResponse::Deny`（アプリ内に空ウィンドウを作らない）。
  - `javascript:` / `file:` / `data:` / `ms-msdt:` / `about:blank` 等は何も開かず Deny。
- 不採用案: capability の `remote.urls` に youtube を足す（iframe に IPC 権限を渡すことになり、YouTube 以外にも効かない）。
- Android は WebView が別実装のため挙動を変えない（opener 自動スクリプトは mobile では従来どおり有効）。

### 落とし穴

- **新しい WebView builder を追加したら必ず `.on_new_window(external_link::new_window_handler(app.clone()))` を付ける。**
  `commands/webview/mod.rs` の契約テスト（`全てのwebview生成箇所に新規ウィンドウハンドラが付いている`）が
  `column.rs` / `popup.rs` / `compose.rs` の builder 数とハンドラ数の一致を検査する。別ファイルに builder を足す場合はこのテストの対象にも加えること。
- `commands/account.rs` のアカウント追加・再認証ウィンドウの builder は意図的に**対象外**（OAuth 系のポップアップログインが必要になり得るため、従来動作を維持）。
- `window.open()` / `target=_blank` は全て Deny になる。従来の「WebView2 の新規ウィンドウをアプリ内で開く」挙動は無くなった。
- Windows では、`NewWindowResponse<Wry>` など**ランタイム型を実体化するテストはテストバイナリが起動しない**（`STATUS_ENTRYPOINT_NOT_FOUND`）。
  そのため「常に Deny を返す」ことは単体テストで直接検証できない（`handle_new_window` は `open_if_openable` の呼び出し + `Deny` 返却だけの薄い関数）。実機検証で担保した。

## 実機での検証方法（WebView2 + CDP）

カラムはアカウントごとに別のデータディレクトリ（= 別の WebView2 環境）を使うため、固定ポートでは最初の環境しか掴めない。

1. アプリを終了し、`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=0` を設定して起動する（開発なら `npm run tauri:dev`）。
2. 各データディレクトリ（`%APPDATA%\com.natsuyasai.multicolumnx\accounts\<account>\EBWebView\DevToolsActivePort` など）の 1 行目がポート番号。
3. `http://127.0.0.1:<port>/json` で各カラム（`type: page`）と YouTube の iframe（`type: iframe`）が列挙される。
4. `Input.dispatchMouseEvent` で本物のマウスクリックを送る。外部ブラウザが開いたかは、既定ブラウザのウィンドウタイトル変化で判定できる。

検証結果（2026-10-03、Windows / WebView2 / 開発ビルド）:

- 修正前: iframe（youtube.com）から `plugin:opener|open_url` を呼ぶと `not allowed by ACL` で拒否される。
- 修正後: YouTube カードをクリックして出た埋め込みプレイヤー内のタイトルをクリックすると、既定ブラウザで YouTube の動画ページが開く。
  iframe 内クリックでも `on_new_window` が発火する。アプリ内に余計なウィンドウは作られない。本文の t.co リンクも従来どおり開く。
- 未確認（手動テスト項目）: Linux / macOS、ポップアップ・コンポーズ内のリンク、Android で挙動が変わらないこと。
