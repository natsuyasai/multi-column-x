# 設計: 投稿カラムを「/home のインライン投稿フォームのみ表示」方式へ

（2026-07-24。`aidlc-docs/post-page-column-plan.md` の投稿カラム方式を**根本的に置き換える**再設計。）

## 背景 / 解決したい問題

現行の投稿カラムは X の投稿ページ `https://x.com/compose/post` を表示し、URL 遷移が起きたら
inject（`post_page_lock.ts`）で `location.assign("/compose/post")` により投稿ページへ戻す方式。

この方式は根本的な問題を抱える:

- `/compose/post` は投稿完了時に `/home` へ遷移する。戻すために `location.assign` でフルリロードすると、
  **ページ遷移前に `window.alert`（beforeunload 相当の確認ダイアログ）が挟まりブロックされる**。
- 「完了トースト検知後に戻す」等のタイミング調整を重ねても、遷移＝フルリロードである以上この
  ブロッキングダイアログは避けられない。

## 方針（承認済み）

投稿カラムの表示先を **`/home`** に変更し、inject で **`/home` のインライン投稿フォーム以外を隠す**。
インライン投稿はページ遷移を起こさない（投稿後も `/home` に留まることを実機で確認済み）ため、
`location.assign` も beforeunload の `window.alert` も発生せず、**URL遷移ロック機構ごと不要**になる。

分離方式は **案A: スポットライトCSS**（承認済み）を採用する。

## 実 DOM 調査結果（claude-in-chrome、狭幅=500px で実測）

`/home` の投稿フォーム周辺構造:

```
primaryColumn
└ div[aria-label="ホームタイムライン"]（子5つ・aria-labelはロケール依存）
   ├ [0] ヘッダー（ホーム / おすすめ・フォロー中タブ）
   ├ [1] 空
   ├ [2] ★インライン投稿フォーム領域（tweetTextarea_0 + tweetButtonInline を含む）
   ├ [3] 空
   └ [4] タイムライン（cellInnerDiv 群）
```

投稿フォームの locale 非依存な特定法（採用）:

- 文字数カウントの `role="progressbar"`（`aria-valuenow` 付き円形インジケータ）の**親は子を2つだけ持ち、
  一方が progressbar 本体、もう一方が `tweetTextarea_0` + `tweetButtonInline` を含む投稿フォーム**である。
- ただし `/home` には**タイムライン読込スピナーも `role="progressbar"`** で存在するため、
  「**親（または近傍）に `tweetTextarea_0` を持つ progressbar**」に絞って投稿フォームを特定する。

投稿ボタンは `[data-testid="tweetButtonInline"]`（`/compose/post` の `tweetButton` とは別 testid）。

## コンポーネント設計

### 追加: `src-tauri/src/inject/_src/compose_only.ts`（案A: スポットライトCSS）

- **フォーム特定**: `role="progressbar"` を走査し、その要素の投稿フォーム側の兄弟（= `tweetTextarea_0` を
  含む要素）を持つものから「keep ノード」（投稿フォーム領域）を得る。得られなければ何もしない（安全側）。
- **スポットライト**: keep ノードから `<body>` までの各階層で、**経路外の全兄弟**にマーカー属性
  （例 `data-mcx-compose-hidden`）を付与し、注入 `<style>` で `display:none` 相当にする。
  経路上の要素・keep ノード配下は表示のまま残す。ページ全体の非フォーム領域（サイドバー等）も
  この階層走査で自然に隠れる。
- **完了トーストは表示を残す**: `[data-testid="toast"]`（およびその祖先の toast 表示レイヤ）は
  非表示対象から除外（whitelist）。投稿成功フィードバックを残すため。
- **追従**: `MutationObserver`（`document.documentElement`, `childList:true, subtree:true`）で
  React 再描画・SPA 更新時に再適用。過剰発火を避けるため `requestAnimationFrame` 等で間引く。
- IIFE。注入可否は Rust 側で制御（`page_type == "compose"` のときのみ注入）。
- 同ディレクトリに `compose_only.test.ts`（jsdom 合成DOM）。純粋ロジック（keep ノード特定・
  祖先チェーン以外が隠れる・progressbar の兄弟に textarea がある場合のみ対象・toast は除外）を検証。
  実 DOM 検証は claude-in-chrome で完了時に実施。

### 配線（inject-script-dev スキルのカラム個別経路）

- `vite.inject.config.ts` の `plainEntries` に `"compose_only"` を追加。
- `src-tauri/src/inject/mod.rs`: `InitScriptParams` に `compose_only_enabled: bool` を追加、
  `build_init_script` で条件付き `include_str!("compose_only.js")`。`default_params()` にも追加。
- `src-tauri/src/commands/webview/column.rs`: `build_column_init_script` で
  `compose_only_enabled: column.page_type == "compose"` を渡す。
- `src-tauri/src/inject/_src/types.d.ts`: 必要なら `MultiColumnXConfig`/`MultiColumnXAPI` を更新
  （本 inject は設定フラグ参照不要のため最小限）。

### URL 変更

- `src-tauri/src/commands/webview/column.rs` の `resolve_url`: `"compose" => "https://x.com/home"`
  （旧: `/compose/post`）。

### 削除（旧方式の撤去）

- `src-tauri/src/inject/_src/post_page_lock.ts` / `post_page_lock.test.ts` と生成物参照。
- `vite.inject.config.ts` の `plainEntries` から `"post_page_lock"`。
- `mod.rs` の `InitScriptParams.post_page_lock_enabled` と `build_init_script` 配線・`default_params`・テスト。
- `column.rs` の `post_page_lock_enabled` 引き渡し。
- `ColumnSettings.postPageRedirectEnabled`（`src/types/index.ts` + `src-tauri/src/commands/settings.rs`）、
  `DEFAULT_COLUMN_SETTINGS` の該当行、対応表コメント。
- `SettingsPanel.tsx` の投稿ページ遷移ロックのトグルとそのテスト。
- 上記に紐づく既存テストの調整。

## リスク / 実装時に実DOMで要検証

- **実カラム幅（~380px 等）で /home にインライン投稿フォームが表示されるか**。500px では表示を確認済みだが、
  より狭い実カラム幅で X が FAB（フローティング作成ボタン）のみに切り替える可能性がある。実装時に
  claude-in-chrome で実カラム相当幅を確認する。出ない場合の代替（例: focus 誘導）を検討。
- **フォームの折りたたみ状態**: 初期が単一行「いまどうしてる？」の場合の見え方。必要なら focus で展開。
- **スポットライトの追従漏れ**: X の再描画で keep ノードの祖先構造が変わるケース。MutationObserver 再適用で吸収。

## テスト / 完了処理

- `npm run build:inject`（`compose_only.js` 生成）
- `npm run typecheck` / `npm run lint`
- `npm test`（Vitest。`compose_only` テスト含む。削除に伴う既存テスト調整）
- `npm run lint:rust`（clippy -D warnings）/ `cargo test`
- claude-in-chrome で実 X 実カラム相当幅での目視・DOM 検証
- 全グリーン確認後に push

## 実装方針

- 実装は TDD（t-wada）で単位ごとにコミット。実装作業は `model: sonnet` サブエージェントへ委譲し、
  メインは統括（レビュー・進行・品質チェック・コミット）に徹する（CLAUDE.md 準拠）。
