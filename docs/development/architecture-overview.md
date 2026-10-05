# アーキテクチャ上の注意点

Tauri / WebView / セキュリティ / 条件コンパイルまわりの設計上の制約と背景。

## Tauri 子 WebView と z-index

Tauri v2 の `window.add_child()` で作成した子 WebView は OS ネイティブウィンドウのため、CSS の `z-index` が効かない。ダイアログ表示中は全カラム WebView を画面外（x: -9999）に退避し、閉じたときに座標を復元する。

## 外部 WebView への IPC 注入（remote capability）

x.com などの外部 URL を表示するカラム / ポップアップ WebView には、`src-tauri/capabilities/column-webview.json` の `remote` 設定によって IPC（`window.__TAURI__`）が注入される。inject スクリプト（新着数報告・横スクロール中継・メディアポップアップ等）はこの IPC を通じて Tauri コマンドを invoke する。リモートページにアプリのコマンドを開放する設定であるため、`remote.urls` の対象ドメインは必要最小限に保つこと。

なお、ログイン完了の検出だけは IPC ではなく、デスクトップでは Rust 側の tokio タスクが URL を 500ms ごとにポーリングして行う（ログイン画面の遷移を JS 注入に依存させないため）。

## remote capability のドメイン限定

`src-tauri/capabilities/column-webview.json` の `remote.urls` はカラム/ポップアップ WebView に IPC（`window.__TAURI__`）を注入する対象を制御する。inject スクリプト（`auto_reload.ts` / `scroll_event.ts` / `image_popup.ts` 等）が x.com 上で `invoke` を使うため IPC 注入自体は必要だが、`https://*` のような全ドメイン許可はリモートページに全カスタムコマンドの呼び出しを許してしまう（サプライチェーン侵害・任意 https サイトへのリンクポップアップ経由での攻撃面拡大）。

- **対象ドメイン**: `https://x.com/*` / `https://*.x.com/*` / `https://twitter.com/*` / `https://*.twitter.com/*` のみ。`http://*` は許可しない。
- **縮退挙動**: 上記以外のドメイン（リンクポップアップで開いた外部サイト等）では IPC が注入されないため、ページ表示自体は正常に行われるが、ツールバーの invoke 系機能（新着バッジ通知・画像ポップアップ等）は無効化される。inject スクリプトは `if (invoke)` 等のガードで未注入時も例外を出さない設計。
- **多層防御**: ドメイン限定に加え、破壊的コマンド（`delete_account_data` / `eval_in_webview` / `close_window` / `save_settings`）は呼び出し元ウィンドウが `main` であることを要求する（`commands::require_main_caller`）。x.com 自体がリモートコンテンツであるため、ドメイン限定だけに依存せず両輪で防御する。

## アップデート方式のセキュリティ

更新の配信・適用は改ざんを前提に多層で検証する。

- **デスクトップ**: `tauri-plugin-updater` が `tauri.conf.json` の `pubkey`（minisign 公開鍵）で `latest.json` と成果物の署名を検証してから適用する。エンドポイントは自リポジトリの GitHub Releases（HTTPS）に固定。
- **Android（APK 自己更新）**: `install_apk_update` コマンドを 3 層で検証する。
  1. **呼び出し元制限**: 純関数 `validate_install_request`（`commands/update.rs`）が呼び出し元ウィンドウを `main` に限定する。x.com を表示するカラム/ポップアップ WebView（remote capability で IPC が注入される）からの invoke を拒否する。
  2. **URL 許可リスト**: ダウンロード URL は自リポジトリの GitHub Releases（`https://github.com/natsuyasai/multi-column-x/releases/download/` プレフィックス）配下の `.apk` のみ許可。`..` / `\` / `?` / `#` / `@` / 空白などパストラバーサル・リダイレクト誘導・userinfo トリックに使われる文字を拒否する。
  3. **SHA-256 検証（fail-closed）**: 期待ハッシュは GitHub Releases API（`/releases/latest`）の APK アセットの `digest` フィールド（`sha256:<hex>`）から取得する（`githubRelease.ts` の `parseDigestSha256`）。API は CORS ヘッダ（`Access-Control-Allow-Origin: *`）を返すため WebView から読める。TS 側（`updater.ts` / `githubRelease.ts`）がこの期待ハッシュを `install_apk_update` に渡し、Kotlin の `ApkHashVerifier` がダウンロード後に照合してから OS インストーラを起動する。`digest` が取得できない・不正な場合はインストールを中止する。
     - **なぜ API digest か**: リリースの `.apk` ダウンロード URL（`release-assets.githubusercontent.com`）は CORS ヘッダを返さないため、WebView の `fetch()` で直接ハッシュ（サイドカー等）を取得すると reject されて更新が中断する。CORS の効く API レスポンスに含まれる `digest` を使うことでこれを回避する。`release.yml` が併載する `.apk.sha256` はアプリでは使わず、`sha256sum -c` 等の手動検証用アーティファクトとして残している。
- **CI/配信**: `release.yml` / `ci.yml` の GitHub Actions はすべてコミット SHA にピン留めし（タグ差し替え攻撃対策。特に署名鍵が渡る `tauri-action`）、署名鍵・keystore を扱う `desktop` / `android` ジョブは `environment: release` 下に置く（承認ゲート・Secrets 保護）。

`MainActivity.downloadAndInstallApk` のシグネチャを変更した場合は、`proguard-rules.pro` の keep ルールも同時に更新すること（R8 難読化でのリリースビルド限定 `NoSuchMethodException` を防ぐ）。

## serde の camelCase / snake_case

Tauri v2 は JS → Rust の自動ケース変換を行わない。JS 側が camelCase で送るフィールドには `#[serde(rename = "camelCaseName")]` が必要。

## desktop / mobile 条件コンパイル

機能を `#[cfg(desktop)]` / `#[cfg(mobile)]` で分岐している。

- **desktop**: `window.add_child()` で子 WebView を作成。URL を 500ms ポーリングしてログイン完了を検出し `account-login-complete` イベントを emit する。
- **mobile (Android)**: カラム WebView はネイティブ Android WebView を content FrameLayout のオーバーレイとして JNI 経由（`android_bridge.rs` → `MainActivity.kt`）で生成する。アカウント追加はセンチネルファイル方式で、`AddAccount.kt` が `add_account_login_complete` ファイルを書き込み、`open_add_account_window` が tokio でポーリングしてブロックする。

## inject スクリプトのビルドフロー

`src-tauri/src/inject/_src/` に TypeScript / React ソースを置き、`vite.inject.config.ts` でバンドルして `src-tauri/src/inject/*.js` に出力する。`npm run tauri:dev` / `tauri:build` は前段で `build:inject` を実行するため、`_src` を変更したら再ビルドが必要。ビルド済み `.js` は管理対象外のため、直接作成編集は禁止。

## グリッドレイアウト

`Column.gridRow` / `Column.gridCol` でカラムをマトリクス状に配置する。同じ `gridCol` に複数カラムを配置すると縦積みになり、`heightMode`（`auto` / `fixed`）と `heightValue` / `heightUnit`（`px` / `%`）で各カラムの高さを制御する。`src/lib/gridLayout.ts` の `calculateGridBounds` が各カラムの絶対座標を計算して Rust に渡す。
