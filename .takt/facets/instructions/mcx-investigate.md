実装計画を立てる前に、実環境で事実を調査する。コードは変更しない。

## 手順

1. `mcx-real-webview-investigation` ポリシーの発動条件を判定し、結果を最初に書く。
   - 発動しない（Rust 単体、設定 UI、React 画面のみ、ドキュメントのみ等）: 「実DOM調査: 対象外（理由）」と書いて終了する。
   - 発動する（inject スクリプト、X の実 DOM に依存するロジック）: 手順 2 以降へ進む。
2. `docs/development/inject-ipc-shortcuts-notes.md` の既存知見を先に確認し、重複調査を避ける。
3. 実 X サイトの確認: `claude-in-chrome` が使えるとき、調査用タブを前面にして行う。使えない場合は理由を書き、「Chrome での確認なし」と明記する。
4. 実アプリ固有の条件（カラム寸法など）: `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=0 --remote-allow-origins=*"` を付けて `npm run tauri:dev` をバックグラウンド起動し、`%APPDATA%\com.natsuyasai.multicolumnx\accounts\<id>\EBWebView\DevToolsActivePort` の 1 行目のポートで CDP 接続して調べる。調査後は起動したプロセスを必ず終了する。
5. 手段・セレクタ・DOM 構造・タイミング・実測値を、事実として書く。確認できなかった項目は「未確認」と理由を書く。

## 禁止事項

- 投稿・フォロー等の副作用がある操作をしない。alert / confirm を発火させない。
- 未ログインのまま、ログインが必要な画面を確認したと書かない。ログインが必要なら「ユーザー確認が必要」と書く。
- ファイルを変更しない。
