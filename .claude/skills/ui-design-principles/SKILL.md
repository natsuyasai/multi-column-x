---
description: "UIの新規作成・修正時に必ず参照するデザイン原則（アプリ向けに翻訳済み）"
user-invocable: true
argument-hint: "対象のコンポーネント名や画面"
---

# UI デザイン原則（アプリ向け翻訳版）

React / SCSS で UI を新規作成・変更するときは、このスキルのチェックリストに従う。設計判断の背景は `docs/development/ui-design-principles-notes.md`、UI 表示サイズ（rem）の仕組みは `docs/development/ui-scale-notes.md` を参照。

## 位置づけ

本アプリは**高密度のデスクトップ / Android UI**（TweetDeck スタイル）であり、LP（ランディングページ）向けの原則はそのままでは当てはまらない。一般的なデザイン原則を下表のとおり**アプリ向けに翻訳**して適用する。

### 対象外（LP 向けのため適用しない）

- 最大幅 1100px の中央寄せ
- セクション間 64〜96px の余白
- 60-30-10 の配色比
- ファーストビュー最適化
- 12 カラムグリッド / 黄金比
- 「HTML のみ出力」などの出力形式の縛り
- Zeigarnik 効果（ステップ UI が無い。あれば進捗表示を出す）

### やらないこと

- 固定バー高さ（`src/lib/gridLayout.ts` の rem 定数）の変更
- 本文 16px 化・行間 1.6 化
- 配色トークンの全面刷新
- カラム WebView 内（x.com の画面）のスタイル

## 原則 → アプリでの扱い（チェックリスト）

### 視覚的階層 / Hick の法則

- [ ] 1 ダイアログ = 主 CTA は 1 つだけ。主 CTA のみ `--mcx-accent-fill` + `--mcx-text-on-accent`
- [ ] 副次ボタンは `--mcx-surface-muted` + `--mcx-border-strong`
- [ ] 破壊的操作は `--mcx-danger` 系
- [ ] 設定項目は既存のタブ / グループ（段階的開示）を維持し、一画面に並べすぎない

### ゲシュタルト（近接・類似）

- [ ] 関連項目は近接（gap 小）、グループ間は gap 大（`t.$space-4` 以上）
- [ ] 同じ役割の要素は同じ見た目（ボタン種別ごとに共通のミキシン / クラス構造）

### Fitts の法則（当たり判定）

- [ ] **Android のみ**、操作要素の当たり判定は 2.75rem（44px）以上、隣接ボタン間隔は 0.5rem 以上（`m.android-tap-target` / `m.android-button-gap`）
- [ ] デスクトップと固定バー（TopBar / ColumnHeader）は密度・高さを維持する（Android には TopBar / ColumnHeader は出ない。MobileTabBar は 3.5rem で既に超過）
- [ ] チェックボックス / ラジオ / トグルは `label` 全体に適用し、`input` 自体は拡大しない

### WCAG（コントラスト・色だけに頼らない）

- [ ] 文字は 4.5:1、UI 境界は 3:1
- [ ] フォーム部品・アウトラインボタンの枠は `--mcx-border-strong`（`--mcx-border` / `--mcx-border-subtle` は装飾用の区切り線にのみ使う）
- [ ] 状態（成功 / 警告 / エラー / 選択中）は色だけで伝えず、アイコン・接頭ラベル・太さのいずれかを併用
- [ ] 白文字を載せる塗り背景は `--mcx-accent-fill`（`--mcx-accent` を背景にしない）

### 8pt グリッド（余白・寸法）

- [ ] `padding` / `margin` / `gap` / `width` / `height` / `min-・max-` / `border-radius` / `top・right・bottom・left` の rem 値は **0.25rem の倍数**
- [ ] `px` 禁止（1px 以下のヘアラインと media query を除く）。`env()` / `0` / `%` / `calc` 内の非 rem は除外
- [ ] 角丸は `t.$radius-sm`（0.25rem）/ `t.$radius-md`（0.5rem）/ `t.$radius-lg`（0.75rem）に集約

### タイポグラフィ

- [ ] 最小 0.75rem（12px）。使うサイズは `0.75 / 0.8125 / 0.875 / 1 / 1.125 / 1.25rem`（`t.$font-size-*`）に集約
- [ ] 丸め対応: `0.8→0.8125`、`0.85・0.9→0.875`、`0.95→1`、`1.1→1.125`、`0.625・0.6875→0.75`
- [ ] 本文 16px 化・行間変更はしない

### ドハティのしきい値（応答の速さ）

- [ ] `transition` は 150〜250ms（`t.$duration-fast` 150ms / `t.$duration-base` 200ms）。`@include m.transition-base(...)` を使う
- [ ] 無限ループのスピナー等（`infinite`）は除外
- [ ] `prefers-reduced-motion: reduce` で全 transition / animation を実質無効化（`src/index.css` のグローバルで担保。コンポーネントで個別対応しない）

### UX / アクセシビリティ

- [ ] 押下要素（button・クリック可能な div / li・input・select）に `:hover` / `:active` / `:focus-visible` / `:disabled`（または `[aria-disabled="true"]`）を定義
- [ ] フォーカスリングは `&:focus-visible { @include m.focus-ring; }`。`outline: none` を単独で書かない
- [ ] ナビ / タブは現在地を `aria-selected` / `aria-current` と見た目の両方で示す（`role="tablist"` / `"tab"`）
- [ ] アイコン・記号のみのボタンに `aria-label`（i18n 経由）。入力欄は `<label htmlFor>` / ラベル包含 / `aria-label`
- [ ] ダイアログは `role="dialog"` `aria-modal="true"` `aria-labelledby`（見出しに `useId()` の id）、Esc で閉じる（`useEscapeKey`）、閉じたらフォーカス復帰（`useRestoreFocus`）

### 美的ユーザビリティ

- [ ] 角丸は上記 3 段階に集約、影は既存 `--mcx-shadow` のみ
- [ ] 色・角丸・影を変えすぎない（既存の値を集約する程度）

## トークン・ミキシンの使い方

共通トークン / ミキシンは SCSS 変数・ミキシンとして用意してある（`src/styles/_tokens.scss` と `src/styles/_mixins.scss`）。

```scss
@use "../../styles/tokens" as t;
@use "../../styles/mixins" as m;
```

- `@use` は**相対パス**（sass では `@/` エイリアスを使わない）。既存の `fs`（`_dialog-fullscreen`）と併存できる
- トークン: `t.$space-1〜7`（0.25 / 0.5 / 1 / 1.5 / 2 / 3 / 4rem）、`t.$radius-sm|md|lg`、`t.$font-size-xs|sm|md|base|lg|xl`、`t.$duration-fast|base`、`t.$tap-target-min`（2.75rem）、`t.$tap-target-comfortable`（3rem）、`t.$focus-ring-width|offset`
- ミキシン:
  - `m.focus-ring`: `&:focus-visible { @include m.focus-ring; }` の形で使う
  - `m.transition-base($props...)`: `@include m.transition-base(color, background-color, border-color);`
  - `m.android-tap-target($min: t.$tap-target-min)`: Android のみ `min-height` と `min-width` を 44px 以上にする。**固定高さのバーの中では使わない。すでに `min-width` を持つ要素（例: `MobileTabBar` の `.tab { min-width: 6.25rem }`）にも使わない**（Android で `min-width` を 2.75rem に上書きして縮む）。その場合は `:global([data-platform="android"]) & { min-height: t.$tap-target-min; }` で高さだけ指定する
  - `m.android-button-gap`: ボタン列の間隔を Android で 8px 以上にする
- `:global([data-platform="android"]) &` は CSS Modules 内でのみ有効。ミキシン内の `&` は呼び出し側セレクタ
- Storybook は `src/index.css` を読まない。`t.$space-*` などの SCSS 変数は問題ないが、`--mcx-*` はストーリー側でテーマ変数を設定しないと未定義になる

## 標準レシピ（`*.module.scss` を整える手順）

1. `@use "../../styles/tokens" as t;` / `@use "../../styles/mixins" as m;` を追加（既存の `fs` と併存可）
2. 余白・サイズ・角丸を 0.25rem の倍数へ（例: `0.375rem→0.25rem|0.5rem`、`0.625rem→0.5rem|0.75rem`、`1.125rem→1rem`、`0.1875rem→0.25rem`、`0.3125rem→0.25rem`）。**ただし**固定高さ連動値と 1px 以下のヘアラインは除く。丸めで折り返し・はみ出しが出ないか Story で確認
3. `font-size` を許可集合（0.75 / 0.8125 / 0.875 / 1 / 1.125 / 1.25rem）へ。0.75rem 未満は 0.75rem へ
4. 押下要素ごとに `:hover` `:active` `:focus-visible { @include m.focus-ring; }` `:disabled`（または `[aria-disabled="true"]`）を定義。`&:focus { outline: none }` は `&:focus-visible` + `m.focus-ring` へ置換（入力欄は `border-color: var(--mcx-accent)` も併用）
5. `transition` を `@include m.transition-base(color, background-color, border-color)` 等へ。時間は 150〜250ms。reduced-motion は `index.css` のグローバルで担保
6. 枠線: フォーム部品・アウトラインボタンは `var(--mcx-border-strong)`。カード / 区切り線は `--mcx-border` のまま可（装飾）
7. 押下要素へ `@include m.android-tap-target;`、ボタン群コンテナへ `@include m.android-button-gap;`。チェックボックス / ラジオ / トグルは**ラベル全体**に適用し、`input` 自体を拡大しない
8. 主 CTA の強調は 1 つだけ（`--mcx-accent-fill`）。複数ある場合は副次を `--mcx-surface-muted` + `border-strong` に落とす（見た目が変わる場合のみ。挙動不変）
9. TSX: ダイアログに `role="dialog"` `aria-modal="true"` `aria-labelledby="<id>"`（見出しに `id`。同一画面で重複しないよう `useId()`）、`useRestoreFocus()`、`useEscapeKey`（未使用なら追加）。アイコンのみ / 記号のみのボタンに `aria-label`（i18n 経由）。入力欄は `<label htmlFor>` またはラベルの包含、または `aria-label`。タブは `role="tablist"` / `"tab"` + `aria-selected`、ナビの現在地は `aria-current`。状態表示は色のみにせずアイコン・接頭ラベル・太さのいずれかを併用
10. `npx vitest run --project unit src/lib/uiDesign.contract.test.ts` で契約テストが緑になることを確認（全 `*.module.scss` が自動で対象。除外リストは無い）
11. Storybook の Story に Android の当たり判定（`expectTapTargets` / `expectAdjacentGap`）とアクセシブルネーム（`expectAccessibleControls`）の検査を足す。ヘルパの使い方は下の「共通ヘルパ」参照

## 禁止事項 / 例外

- **固定バーの高さを変えない**: `ColumnHeader` の `.header { height: 2.25rem }`、TopBar の `$topbar-row-height`、`MobileTabBar` の `.tabBar { height: 3.5rem }`、`App.module.scss` の `.bottomScrollbar` と `&::-webkit-scrollbar` の height。文字を 0.75rem に上げても収まらなければ余白を詰める（バーを高くしない）。`gridLayout.contract.test.ts` が対象セレクタの書式・値を検証している
- **配色トークンの値を変えない**。`src/index.css` の `:root[data-theme="dark"]` / `[data-theme="light"]` ブロックに**新規宣言を足さない**（`themeContrast` / `swipeBarColors` の契約テストがパースする）。グローバル既定（focus-visible / disabled / reduced-motion）は色トークンブロックの**後**に書く
- **`px` 禁止**（1px 以下のヘアラインを除く）。UI 倍率は `<html>` の font-size で変わるため rem で書く
- **本文を 16px 化しない・行間を変えない**
- 既存の Android 全画面ダイアログ用 `fs.*` ミキシンの padding 引数は、panel の元 padding と一致させる（丸めたら引数も同じ値に更新）
- `WhatsNewDialog` の `.notes` 二重スクロール抑止、`TabActionDialog` の `max-height` / `overflow-y`、`NoAccountsPrompt` の `width: min(...)` は `ui-scale-notes.md` の既知対策。消さない
- `MobileTabBar` の `.menu` 横スクロールと `.tabs { min-width: 6.25rem }` を維持する
- `src/App.css` は未使用（Vite テンプレート残骸）。触らない
- i18n: 画面文言は辞書経由。`aria-label` は `t("ns:key")`、ja / en の両方にキーを追加し未使用キーを残さない
- 例外（固定バー高さなど）は**契約テストの定数**（`GRID_EXEMPT` / `ANDROID_TAP_EXEMPT`）に理由付きで集約する。各ファイルに散在させない

## 共通ヘルパ

| ヘルパ                         | 使い方                                                                                                                                                                                                                                         |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/hooks/useRestoreFocus.ts` | ダイアログのコンポーネントの先頭で `useRestoreFocus()`。マウント時（初回レンダー中）の `document.activeElement` を覚え、アンマウント時にフォーカスが空（`body`）なら戻す。StrictMode の擬似アンマウントで `autoFocus` を打ち消さないための条件 |
| `src/components/StatusMark/`   | `<StatusMark kind="success\|warning\|selected" />`。成功・警告・選択中を色だけで伝えないための記号（`aria-hidden`）。隣の本文に意味を持たせる                                                                                                  |
| `src/test-utils/a11y.ts`       | `expectAccessibleControls(container)`: 操作要素が空でないアクセシブルネームを持つこと                                                                                                                                                          |
| `src/test-utils/tapTargets.ts` | Story の play で `const restore = setPlatform("android"); try { await expectTapTargets(canvasElement, 44); await expectAdjacentGap(canvasElement, 8); } finally { restore(); }`                                                                |
| `src/test-utils/storyTheme.ts` | Story で `installThemeTokens()`（`--mcx-*` を有効化）。固定高さのバーなどの高さを実測する play では `const restore = installAppReset();`（border-box リセット）を `try / finally` で使う                                                       |

Storybook の落とし穴（`index.css` を読まない、`:focus-visible` の Story 検査の限界、マウスクリックでリングが出ないことの検証には `vitest/browser` の実クリックが必要、など）は `docs/development/ui-design-principles-notes.md` の「Storybook の落とし穴」を参照。

## 契約テスト

`src/lib/uiDesign.contract.test.ts` が、全 `*.module.scss`（`listModuleScssFiles()`）と `_tokens.scss` / `_mixins.scss` / `index.css` に対して以下を検証する。ルール関数は `src/test-utils/uiDesignRules.ts`。**未移行ファイルの除外リストは無い**ので、新しい `*.module.scss` は自動的に対象になる。

1. 共通トークン（`$space-*` `$radius-*`）が 0.25rem の倍数（`checkTokenGrid`）
2. 寸法宣言の rem 値が 0.25rem の倍数（px は 1px 以下のみ）（`checkGrid`。例外 `GRID_EXEMPT`）
3. `font-size` が 0.75rem 以上（`checkFontSize`）
4. `transition` / `animation` の時間が 150〜250ms（`infinite` は除外）（`checkDuration`）
5. `index.css` に `prefers-reduced-motion: reduce` の上書きがある（`checkReducedMotion`）
6. `cursor: pointer` のブロックに `:hover` / `:active` / `:focus-visible`（または `focus-ring`）がある。input / select / textarea のベースのブロックにも `:focus-visible` が必要（`:focus` だけは不可）（`checkInteractiveStates`）
7. `outline: none` を `:focus-visible` 以外で使っていない（`checkOutlineRemoval`）
8. input / select / textarea と枠付き押下要素の枠色が `--mcx-border-strong` 系（`checkBorderColor`）
9. Android タップ領域（`android-tap-target` または 2.75rem 以上）。`input[type=checkbox]` / `input[type=radio]` は対象外（親 label の `cursor: pointer` ブロックで担保）（`checkAndroidTapTarget`。例外 `ANDROID_TAP_EXEMPT`）
10. Android 用ミキシンが `[data-platform="android"]` 配下にのみ宣言を持つ（`checkAndroidMixins`）
11. 全モジュール SCSS に項目 2〜9 を例外ファイルの指定なしで適用（`checkModuleScss`）。`listModuleScssFiles()` の取りこぼしと、例外定数の陳腐化（実在しない・不要になったエントリ）も検知する

### 例外の追加手順

1. SCSS 側で直せないか先に検討する（丸め、`android-tap-target` の代わりに Android 配下の `min-height` 指定など）
2. 固定バー高さ（bounds 連動）や desktop 専用のバー内要素のように、本当に直せないときだけ `src/test-utils/uiDesignRules.ts` の `GRID_EXEMPT`（ファイル・セレクタ・プロパティ・理由）または `ANDROID_TAP_EXEMPT`（ファイル・セレクタ・理由）にエントリを足す。理由は必須。SCSS にコメントで散在させない
3. 例外が不要になったら（SCSS を直したら）エントリを削除する。陳腐化検知のテストが失敗して知らせる

現在のエントリ: `GRID_EXEMPT` は `TopBar.module.scss` の `.row2` の `padding`（0.125rem を丸めると展開時の TopBar が bounds の 4rem を超える）のみ。`ANDROID_TAP_EXEMPT` は `ColumnHeader.module.scss` の `.actionBtn` / `.unreadBadge` と `TopBar.module.scss` の `.btn`（いずれも desktop 専用の固定高さバー内）。

## 関連

- `docs/development/ui-design-principles-notes.md`（設計判断・不採用案・例外の方針）
- `docs/development/ui-scale-notes.md`（UI 表示サイズ・rem・Android 全画面ダイアログ）
- `.claude/skills/component-create` / `.claude/skills/storybook-dev`（コンポーネント・Story 作成）
- `src/styles/_dialog-fullscreen.scss`（パネル型ダイアログの Android 全画面化）
