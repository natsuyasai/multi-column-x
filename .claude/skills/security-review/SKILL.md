---
description: "Tauri向けセキュリティレビューを実施する（capabilities, CSP, WebView/IPC, inject, パストラバーサル, 依存脆弱性, 署名鍵）"
user-invocable: true
allowed-tools: "Read, Glob, Grep, Bash"
---

# セキュリティレビュー（Tauri）

CLAUDE.mdの「セキュリティルールに従うこと」を、本プロジェクト（Tauri v2 + React + Rust + WebView）向けに具体化したチェックリストに基づいてレビューする。**読み取り専用**で行い、自動修正はしない。

## チェックリスト

### 1. Tauri capabilities / 権限

- [ ] `src-tauri/capabilities/*.json`（`default.json` / `column-webview.json` / `updater.json`）の許可コマンド・permissions が**最小限**か
  - WebView ごとに付与する権限が広すぎないか（特に column WebView は信頼できない x.com を表示する）
  - `core:*` / プラグインの危険な権限（fs / shell / process など）が不必要に許可されていないか
- [ ] 新規コマンドを追加した際、対応する capability の許可リスト更新が伴っているか

### 2. CSP / WebView 設定（`src-tauri/tauri.conf.json`）

- [ ] `app.security.csp` の値を確認する。**現状 `null`（CSP無効）**。アプリ自身の WebView に外部リソースを読み込む箇所があれば CSP 設定を検討する
- [ ] `withGlobalTauri: true` の影響範囲を確認（`window.__TAURI__` が WebView に露出する）。x.com を表示する column WebView から Tauri API が呼べる状態になっていないか（`dangerousRemoteDomainIpcAccess` 等の設定有無）
- [ ] 外部 URL を WebView にロードする際、信頼ドメインの検証があるか

### 3. inject スクリプト（`src-tauri/src/inject/_src/`）

x.com のページに JS を注入するため、DOM操作・スクリプト生成のXSS観点が重要。

- [ ] ユーザー入力（カスタムCSS・NGワード・検索クエリ・ヘッダーカスタマイズ等）を DOM に反映する箇所でエスケープ／サニタイズしているか
  - `innerHTML` / `insertAdjacentHTML` / `document.write` / `new Function` / `eval` の使用箇所を検索
    ```bash
    grep -rnE "innerHTML|insertAdjacentHTML|document\.write|eval\(|new Function" src-tauri/src/inject/_src/
    ```
- [ ] `custom_css.ts` / `ng_word.ts` 等、ユーザー設定値を扱うスクリプトで注入値の検証があるか
- [ ] 変更後は `npm run build:inject` でビルドし、生成 `.js` を直接編集していないか

### 4. IPC コマンド（`src-tauri/src/commands/`, `lib.rs`）

- [ ] JS→Rust に渡る引数（ラベル・パス・スクリプト文字列等）を Rust 側で検証しているか
- [ ] `eval_in_webview` 等、WebView に文字列を流し込むコマンドの入力経路に外部由来の値が混ざらないか
- [ ] serde のフィールドは `#[serde(rename)]` で正しくマッピングされているか（型不整合による想定外挙動の防止）
- [ ] desktop / mobile（`#[cfg(desktop)]` / `#[cfg(mobile)]`）双方の実装で同じ検証が入っているか

### 5. パストラバーサル / ファイルアクセス

- [ ] アカウントのデータディレクトリ等、ユーザー由来の文字列で**パスを構築**している箇所を確認
- [ ] `..` を含むパスの正規化・検証、ベースディレクトリ外への脱出防止があるか
- [ ] `std::fs` / `std::path::Path::join` の引数に未検証の外部入力を直接渡していないか

### 6. 依存関係の脆弱性

```bash
npm audit
cargo audit --manifest-path src-tauri/Cargo.toml   # 未導入なら: cargo install cargo-audit
```

- [ ] high / critical の脆弱性を報告する（devDependencies由来かも切り分ける）

### 7. 機密情報・署名鍵

- [ ] 更新署名鍵（`.tauri-keys/`）/ `keystore.properties` / `upload-keystore.jks` が `.gitignore` 済みで、コミットされていないか
- [ ] ハードコードされたAPIキー・トークン・パスワードがないか
- [ ] ログ出力（`@tauri-apps/plugin-log` / `logError` 等）に機密情報やユーザーの認証状態が漏れていないか

## 実行手順

1. 上記チェックリストを Grep / Glob / Read / Bash（audit系のみ）で確認する
2. 問題は深刻度（Critical / High / Medium / Low）を付けて報告する
3. 修正案を提示する（**自動修正はしない** — 読み取り専用）

## レポート形式

```markdown
## セキュリティレビュー結果

### 検出された問題

| #   | 深刻度 | カテゴリ   | 場所                           | 説明 | 推奨対応 |
| --- | ------ | ---------- | ------------------------------ | ---- | -------- |
| 1   | High   | inject/XSS | src-tauri/src/inject/\_src/... | ...  | ...      |

### 問題なしの項目

- [x] capabilities: 最小権限
- [x] 署名鍵: gitignore済み
- [x] npm audit / cargo audit: high以上なし
```
