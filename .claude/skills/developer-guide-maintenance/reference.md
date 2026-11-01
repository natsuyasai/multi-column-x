# 開発者ガイド 部品・データ API リファレンス

`docs/developer-guide/` のページ骨格と、`assets/common.js` が提供する部品の HTML / データの書き方。新しいページ・図・フロー・一覧を足すときに参照する。

## ファイル構成

```
docs/developer-guide/
  index.html      全体像（このガイドの入口）
  react.html      フロントエンド（React/TS）
  rust.html       バックエンド（Rust/Tauri）
  android.html    Android ネイティブ層（Kotlin）
  inject.html     X の画面に注入するスクリプト
  howto.html      機能追加ハウツー（チェックリスト）
  assets/common.css
  assets/common.js
  assets/data/index.js    データ初期化と全ページ横断検索の見出し索引（build-index.mjs が生成）
  assets/data/<page>.js   各ページの一覧データ・フロー定義（index ページは index-page.js）
```

- 外部 CDN・Web フォント・ES module・fetch() は**使用禁止**（file:// で直接開くため）。`<script src>` のクラシックスクリプトのみ。
- 読み込み順: `assets/data/index.js` → `assets/data/<page>.js` → `assets/common.js`（`defer` なし、`</body>` 直前）。
- localStorage は必ず try/catch。使えなくても表示は壊れないこと。
- ページ固有の CSS は原則書かない。部品が足りなければ `assets/common.*` を拡張し、全ページの表示を確認する。

## ページ骨格（全ページ共通・この形を厳守）

```html
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="mcx-synced-commit" content="68b23eed" />
    <title>React 層 | MCX 開発者ガイド</title>
    <link rel="stylesheet" href="assets/common.css" />
  </head>
  <body data-page="react">
    <div id="mcx-header"></div>
    <!-- common.js がナビ・検索・テーマ切替を描画 -->
    <div class="layout">
      <nav id="mcx-toc"></nav>
      <!-- common.js が main 内の h2/h3 から目次生成 -->
      <main id="content">
        <h1>…</h1>
        <p class="lead">このページで分かること…</p>
        <section id="overview">
          <h2>…</h2>
          …
        </section>
        …
      </main>
    </div>
    <aside id="mcx-detail" hidden></aside>
    <!-- 詳細パネル（common.js が制御） -->
    <script src="assets/data/index.js"></script>
    <script src="assets/data/react.js"></script>
    <script src="assets/common.js"></script>
  </body>
</html>
```

- `data-page` の値: index / react / rust / android / inject / howto（ナビの現在地表示に使う）
- h2 / h3 には必ず**見出し要素そのものに** `id` を付ける（`<section id>` に付けると目次・横断検索から漏れる。チェックスクリプトが検出する）。h2 の構成は「外部設計」系 → 「詳細設計」系 → 「落とし穴・関連資料」の順を推奨。

## データ置き場

各 `assets/data/<page>.js` は次の形で**追記**する（上書きしない）:

```js
window.MCX_DATA = window.MCX_DATA || { flows: {}, catalogs: {}, details: {} };
Object.assign(window.MCX_DATA.flows, {
  /* id: flow */
});
Object.assign(window.MCX_DATA.catalogs, {
  /* id: catalog */
});
Object.assign(window.MCX_DATA.details, {
  /* id: detail */
});
```

- id はページ接頭辞付き（例 `react.startup`, `rust.commands`）で衝突回避。

## コンポーネント（common.js が提供）

### 1. 用語ツールチップ

`<span class="term" data-term="WebView の説明文">WebView</span>` → ホバー/フォーカス/タップで説明表示。

### 2. クリック可能な構成図（diagram）

HTML/CSS の箱で描く（SVG 手描きは不要）:

```html
<div class="diagram" data-diagram>
  <div class="dg-group" data-layer="react">
    <div class="dg-title">メインウィンドウ（React）</div>
    <button class="dg-node" data-detail="react.app">App.tsx</button>
    <button class="dg-node" data-detail="react.store">useAppStore</button>
  </div>
  <div class="dg-arrow" data-label="invoke / event">⇅</div>
  <div class="dg-group" data-layer="rust">…</div>
</div>
```

- `.dg-node[data-detail=ID]` をクリックすると `MCX_DATA.details[ID]` を詳細パネルに表示し、そのノードを選択状態にする。
- detail の形:

```js
{ title: "useAppStore", layer: "react",          // layer: react|rust|android|inject|common
  summary: "1〜2文で役割",
  body: "<p>HTML 可。責務・入出力・状態・注意点</p>",
  files: ["src/store/useAppStore.ts"],           // リポジトリルートからの相対パス（存在必須）
  docs: ["../development/settings-file-crash-safety-notes.md"],  // 関連資料（任意）
  related: ["react.app"] }                       // 他 detail への導線（任意）
```

- 詳細パネル内の `files` は `<code class="path">` で表示し、`related` はクリックで別 detail に切替。Esc / × で閉じる。
- `data-layer` で色分け（react=青系, rust=橙系, android=緑系, inject=紫系, common=灰）。
- 方向付きの配置が必要なら `.diagram.dg-row`（横並び）/ `.dg-col`（縦並び）クラスで調整。

### 3. 処理フローのステップ再生（シーケンス図）

```html
<div class="flow" data-flow="index.startup"></div>
```

```js
flows["index.startup"] = {
  title: "アプリ起動",
  description: "起動からカラム表示までの流れ",
  actors: [
    { id: "rs", label: "Rust (lib.rs setup)", layer: "rust" },
    { id: "ui", label: "React (App)", layer: "react" },
  ],
  steps: [
    {
      from: "rs",
      to: "rs",
      label: "設定ファイル検査・復旧",
      detail: "<p>…</p>",
      files: ["src-tauri/src/lib.rs"],
    },
    {
      from: "ui",
      to: "rs",
      label: "invoke('get_settings')",
      kind: "invoke",
      detail: "…",
    },
    { from: "rs", to: "ui", label: "emit('xxx')", kind: "event" },
  ],
};
```

- common.js が SVG のシーケンス図（アクター縦線 + 矢印）を描画し、[⏮ 最初][◀ 前][▶ 再生/⏸][次 ▶] とステップ番号を付ける。
- 現在ステップの矢印と両端アクターを強調、それ以前は通常、それ以降は薄く表示。下部に現在ステップの label・detail・files を表示。
- 矢印 `kind`: call(既定・実線) / invoke(実線+ラベル色) / event(破線) / return(点線)。from===to は自己ループ。
- 再生は 1.8 秒間隔。キーボード ←/→ でも移動（フロー要素にフォーカス時）。

### 4. 検索・フィルタ可能な一覧（catalog）

```html
<div class="catalog" data-catalog="rust.commands"></div>
```

```js
catalogs["rust.commands"] = {
  title: "Tauri コマンド一覧",
  columns: [
    { key: "name", label: "コマンド", code: true },
    { key: "summary", label: "概要" },
    { key: "platform", label: "対象" },
  ],
  filters: [
    { key: "platform", label: "対象" },
    { key: "area", label: "領域" },
  ], // 値の一覧は items から自動生成しチップ表示
  items: [
    {
      name: "get_settings",
      summary: "…",
      platform: "共通",
      area: "設定",
      detail: "<p>引数・戻り値・呼び出し元など</p>",
      files: ["src-tauri/src/commands/settings.rs"],
    },
  ],
};
```

- 上部に検索ボックス（全列＋detail のテキストを部分一致、大文字小文字無視）とフィルタチップ（複数選択可、同一キー内は OR、キー間は AND）、件数表示。
- 行クリックで行の直下に detail と files を展開。
- ヘッダー全体検索（#mcx-header の検索）はページ内の h2/h3 見出し・catalog 項目・details をまとめて検索し、結果クリックでその場所へスクロール / 詳細表示。**全ページ横断検索**のため、見出し索引 `MCX_DATA.index` を `assets/data/index.js` に持つ（index.js を読まないページでも common.js が動的に読み込む）。見出しを追加・変更したら `node .claude/skills/developer-guide-maintenance/scripts/build-index.mjs` で再生成する（手で編集しない）。

### 5. チェックリスト（ハウツー）

```html
<ol class="checklist" data-checklist="howto.add-command">
  <li>
    <b>build.rs の AppManifest にコマンド名を追加</b>
    <div class="ck-body">
      説明・<code class="path">src-tauri/build.rs</code>
    </div>
  </li>
</ol>
```

- common.js が各 li にチェックボックスを付け、localStorage（キー `mcx-guide:checklist:<id>`）に保存、進捗バー（n / m）とリセットボタンを付ける。

### 6. その他の部品（CSS のみ）

- 注意書き: `<div class="callout note|tip|warn|danger"><b>見出し</b><p>…</p></div>`
- タブ切替: `<div class="tabs"><div class="tab" data-tab="desktop" data-label="デスクトップ">…</div><div class="tab" data-tab="mobile" data-label="Android">…</div></div>`（common.js がタブボタン生成）
- 折りたたみ: `<details><summary>…</summary>…</details>`
- ファイルパス: `<code class="path">src/App.tsx</code>`（存在するパスのみ。チェックスクリプトが検証する）
- 層バッジ: `<span class="badge" data-layer="rust">Rust</span>`
- 表: 通常の `<table>`（common.css で整形）
- 関連資料リンク: `<a href="../development/xxx.md">`（相対パスで存在すること）

## テーマ

- `:root` に色トークン、`@media (prefers-color-scheme: dark)` で `:root:not([data-theme="light"])` を上書き、`:root[data-theme="dark"]` でも同値。ヘッダーのボタンで auto/light/dark 切替（localStorage `mcx-guide:theme`）。
- 幅 900px 未満では目次を折りたたみ（ボタンで開閉）、詳細パネルは全画面シート。

## 正確性ルール

- 調査は `codegraph explore "<シンボル名や質問>"`（シェル）を最初に使い、必要最小限のファイルだけ読む。既存 `docs/development/*.md`・`CLAUDE.md`・`README.md` を一次資料として活用。
- 記載するファイルパス・コマンド名・イベント名・型名は**実在を確認したものだけ**。確認できない事項は書かないか、`<span class="badge warn">要確認</span>` を付ける。推測で書かない。
- desktop / mobile（`#[cfg(desktop)]` / `#[cfg(mobile)]`）で実装が異なる箇所は必ず両方を書き分ける（タブ部品が便利）。
