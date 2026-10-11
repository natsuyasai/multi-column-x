実装の完了後に、実際にアプリや Chrome で動作を確認する。確認の過程でソースコードは変更しない。

## 手順

1. 変更ファイル（`git diff --name-only origin/develop...HEAD`）から確認対象を判定する。
   - 確認対象外（Rust 単体のロジック、docs のみ等でアプリ起動の意味が薄い）: 「動作確認: 対象外（理由）」と書く。
   - inject スクリプト（`src-tauri/src/inject/_src/**`）を変更した: `npm run build:inject` 後に、Chrome（`claude-in-chrome`）で確認できる範囲を確認する。使えない場合は理由を書く。
   - アプリの挙動に関わる変更: `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=0 --remote-allow-origins=*"` 付きで `npm run tauri:dev` をバックグラウンド起動し、`DevToolsActivePort` のポートから CDP で確認する。
2. 各確認項目について、手段・操作・期待値・実測値・結果（OK / NG / 未確認）を書く。
3. 確認後、起動したプロセス（tauri:dev、関連する WebView2）を必ず終了する。

## 禁止事項

- 投稿・フォロー等の副作用がある操作をしない。alert / confirm を発火させない。
- ログインが必要で確認できない画面は「未確認」として理由を書く。確認したことにしない。
- 実測していない値を書かない。

## 判定

- 実装の不具合を示す NG がある: 再現手順と観測値を書いて差し戻す。
- NG が無い（OK、対象外、理由付きの未確認のみ）: 完了とする。
- アプリが起動できないなど環境の問題で確認できず、実装の不具合かどうかも切り分けられない: 中止とする。
