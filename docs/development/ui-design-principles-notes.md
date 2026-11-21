# UI デザイン原則 設計ノート

アプリ UI にデザイン原則（視覚的階層・Hick・ゲシュタルト・Fitts・WCAG・8pt グリッド・認知心理・視覚デザイン・UX・a11y）を適用した設計判断（ADR）と、実装時に見つけた落とし穴。実際に UI を書くときのチェックリストと手順は `.claude/skills/ui-design-principles/SKILL.md` を参照。

> 状態: 適用済み。全 `*.module.scss` が契約テスト `src/lib/uiDesign.contract.test.ts` の対象で、未移行ファイルの除外リストは無い。新規・変更する UI も同じ契約テストを通すこと。

## 1. 原則を「アプリ向けに翻訳」した理由

元になる原則集は LP（ランディングページ）を想定しており、最大幅 1100px の中央寄せ、セクション間 64〜96px、60-30-10 配色、ファーストビュー最適化、12 カラムグリッドなどを含む。本アプリは TweetDeck スタイルの高密度デスクトップ / Android UI で、すでに次の資産がある。

- テーマ変数（`--mcx-*`）と、そのコントラスト契約テスト（`themeContrast.contract.test.ts`）
- rem 寸法と UI 表示サイズ（`<html>` の font-size で倍率を変える。`ui-scale-notes.md`）
- ネイティブ WebView の bounds と連動する固定バー高さ（`gridLayout.ts`）

そのため原則をそのまま適用せず、既存の仕組みと衝突しない形に翻訳した。LP 向け項目は対象外とし、固定バー高さ・本文 16px 化・配色トークンの全面刷新・カラム WebView 内（x.com）は**やらない**。翻訳表の全文は SKILL.md を参照。

主な翻訳の理由:

- **Fitts（44px）は Android のみ**: 固定バー（TopBar / ColumnHeader）は WebView の bounds と連動しており、高さを変えるとネイティブ側の配置・契約テストの更新が必要になる。Android には TopBar / ColumnHeader は出ず、MobileTabBar は 3.5rem で既に 44px を超える。desktop はマウス操作で密度を維持した方が価値が高いので、`[data-platform="android"]` 限定の上書きにした。
- **8pt グリッドは 0.25rem（4px）の倍数**: 既存コードが 0.25rem 刻みを多用しており、8px 刻みに揃えると見た目の変化が大きすぎる。倍率は rem で変わるので「4px の倍数」は基準倍率（16px）での値。
- **最小文字 12px**: 本文の 16px 化はしない（密度が落ちるため）。使うサイズを 6 段階に集約するだけにとどめる。

## 2. トークンを SCSS 変数にした理由

共通トークンは CSS カスタムプロパティではなく **SCSS 変数**（`src/styles/_tokens.scss`）で定義している。

- Storybook は `src/index.css` を読み込まないため、`var(--mcx-space-*)` のようなカスタムプロパティは Story で未定義になる。
- SCSS 変数はビルド時にリテラル化されるので Story でも効き、契約テストが値を直接検証できる。
- 既存の SCSS 内取り決め（`$topbar-row-height` 等）とも一貫する。

SCSS から使うときは `@use "../../styles/tokens" as t;` / `@use "../../styles/mixins" as m;`（相対パス。sass では `@/` エイリアスを使わない）。既存の `_dialog-fullscreen.scss`（`fs`）とも併存できる。

### トークン（`src/styles/_tokens.scss`）

| 変数                                                      | 値                                          |
| --------------------------------------------------------- | ------------------------------------------- |
| `$space-1` 〜 `$space-7`                                  | 0.25 / 0.5 / 1 / 1.5 / 2 / 3 / 4rem         |
| `$radius-sm` / `-md` / `-lg`                              | 0.25 / 0.5 / 0.75rem                        |
| `$font-size-xs` / `-sm` / `-md` / `-base` / `-lg` / `-xl` | 0.75 / 0.8125 / 0.875 / 1 / 1.125 / 1.25rem |
| `$duration-fast` / `-base`                                | 150ms / 200ms                               |
| `$tap-target-min` / `-comfortable`                        | 2.75rem（44px）/ 3rem（48px）               |
| `$focus-ring-width` / `-offset`                           | 0.125rem / 0.125rem                         |

### ミキシン（`src/styles/_mixins.scss`）

| ミキシン                                    | 内容                                                                                                                                              |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `focus-ring`                                | `outline: $focus-ring-width solid var(--mcx-accent); outline-offset: $focus-ring-offset`。`&:focus-visible { @include m.focus-ring; }` の形で使う |
| `transition-base($props...)`                | `transition-property` を渡し、時間は `$duration-fast`（150ms）、`ease`                                                                            |
| `android-tap-target($min: $tap-target-min)` | `:global([data-platform="android"]) &` 配下で `min-height` と **`min-width`** を設定する                                                          |
| `android-button-gap($gap: $space-2)`        | 同じく Android 配下で `gap` を設定する（隣接ボタン間隔 8px 以上）                                                                                 |

`:global([data-platform="android"]) &` は CSS Modules 内でのみ有効。ミキシン内の `&` は呼び出し側セレクタ。

## 3. 契約テスト

`src/lib/uiDesign.contract.test.ts` が `src/styles/_tokens.scss`・`src/styles/_mixins.scss`・`src/index.css` と、`listModuleScssFiles()`（`src` 配下の全 `*.module.scss`）に次を検証する。**除外リストは無い**ので、新しい `*.module.scss` は自動的に対象になる。ルール関数は `src/test-utils/uiDesignRules.ts`。

| 項目 | 内容                                                                                                                                                                                           | ルール関数                                           |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 1    | `_tokens.scss` の `$space-*` / `$radius-*` が 0.25rem の倍数                                                                                                                                   | `checkTokenGrid`                                     |
| 2    | 寸法宣言（`padding*` `margin*` `gap` `width` `height` `min-/max-` `border-*-radius` `top/right/bottom/left`）の rem 値が 0.25rem の倍数。px は 1px 以下のみ、em は不可                         | `checkGrid`（例外 `GRID_EXEMPT`）                    |
| 3    | `font-size` が 0.75rem（12px）以上                                                                                                                                                             | `checkFontSize`                                      |
| 4    | `transition` / `animation` の時間が 150〜250ms（`infinite` と 0 は除外）                                                                                                                       | `checkDuration`                                      |
| 5    | `index.css` に `prefers-reduced-motion: reduce` があり `transition-duration` / `animation-duration` を上書きしている                                                                           | `checkReducedMotion`                                 |
| 6    | `cursor: pointer` のブロックに `:hover` / `:active` / `:focus-visible`、入力欄のベースのブロックに `:focus-visible`（`:focus` だけは不可）                                                     | `checkInteractiveStates`                             |
| 7    | `outline: none` / `0` を `:focus-visible` 以外で使わない                                                                                                                                       | `checkOutlineRemoval`                                |
| 8    | 入力欄と枠線付き押下要素の枠色が `--mcx-border` / `--mcx-border-subtle`（装飾用）ではない                                                                                                      | `checkBorderColor`                                   |
| 9    | `cursor: pointer` と入力欄のブロックに Android の当たり判定（`android-tap-target` または Android 配下で `min-height` 2.75rem 以上）。`input[type=checkbox\|radio]` は対象外（親 label で担保） | `checkAndroidTapTarget`（例外 `ANDROID_TAP_EXEMPT`） |
| 10   | Android 用ミキシンが宣言を `[data-platform="android"]` 配下にだけ持つ                                                                                                                          | `checkAndroidMixins`                                 |
| 11   | 全モジュール SCSS に項目 2〜9 が例外ファイルの指定なしで適用される（`checkModuleScss`）。`listModuleScssFiles()` が主要ファイルを取りこぼしていないスモークテストも持つ                        | `checkModuleScss`                                    |
| -    | 例外定数の陳腐化検知: `GRID_EXEMPT` / `ANDROID_TAP_EXEMPT` の各エントリが実在するファイル・セレクタ・宣言に一致し、例外なしで実際に違反になること。理由が空でないこと                          | -                                                    |

SCSS をセレクタ・宣言・include に分解する最小パーサは `src/test-utils/scssBlocks.ts`（`parseScss` / `readScss` / `listModuleScssFiles`）。完全な SCSS パーサではなく、`@media` は親セレクタを引き継ぎ、`&` を展開し、`@include` と宣言を分けて保持する。ルールの追加・変更は `uiDesignRules.test.ts` のフィクスチャ（違反する SCSS と許容される SCSS）を先に書く。

### 例外定数（理由必須・契約テストに集約）

例外は SCSS ファイル側にコメントで散在させず、`src/test-utils/uiDesignRules.ts` の定数に「ファイル・セレクタ（・プロパティ）・理由」付きで持つ。

**`GRID_EXEMPT`（項目 2）**

| ファイル                                   | セレクタ | プロパティ | 理由                                                                                                                                         |
| ------------------------------------------ | -------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/TopBar/TopBar.module.scss` | `.row2`  | `padding`  | 縦 0.125rem を 0.25rem に丸めると展開時の TopBar が 62px から 66px になり、ネイティブ WebView の bounds（4rem = 64px）を超えてカラムに重なる |

**`ANDROID_TAP_EXEMPT`（項目 9）**: 理由はいずれも「固定高さのバー内の desktop 専用コントロールで、Android では描画されない」。

| ファイル                                               | セレクタ       |
| ------------------------------------------------------ | -------------- |
| `src/components/ColumnHeader/ColumnHeader.module.scss` | `.actionBtn`   |
| `src/components/ColumnHeader/ColumnHeader.module.scss` | `.unreadBadge` |
| `src/components/TopBar/TopBar.module.scss`             | `.btn`         |

例外を足すとき: まず本当に例外が必要か（丸め・別の指定で収まらないか）を確認し、定数に理由付きで追加する。例外が不要になったら（SCSS を直したら）エントリも消す。陳腐化検知テストが残骸を失敗にする。

### 例外追加時の注意

- `ANDROID_TAP_EXEMPT` は、固定高さのバーの中の desktop 専用要素にだけ使う。Android に出る要素は例外にせずミキシンを使う
- `GRID_EXEMPT` は、ネイティブ bounds や固定バー高さと連動する値にだけ使う

## 4. 固定高さ（bounds 連動）と TopBar `.row2` の例外

次の値はネイティブ WebView の bounds（`src/lib/gridLayout.ts` の rem 定数）と連動するため、デザイン原則の都合で変えない。`gridLayout.contract.test.ts` が SCSS の書式と値を検証する。

- `ColumnHeader` の `.header { height: 2.25rem }`
- TopBar の `$topbar-row-height`（`.row1`）と展開時の合計 4rem
- `MobileTabBar` の `.tabBar { height: 3.5rem }`
- `App.module.scss` の `.bottomScrollbar` と `&::-webkit-scrollbar` の height（0.75rem）

文字を 0.75rem に上げても収まらないときは、余白を詰める（バーを高くしない）。

TopBar の `.row2` は `padding: 0.125rem 0.25rem` が 0.25rem の倍数ではないが、行の高さが 4rem（64px）の内訳（`.row1` 2rem + `.row2`: border-top 1px + padding 上下合計 0.25rem + ボタン 1.5rem + `.topbar` の border-bottom 1px = 約 62px）に収まるための値。0.25rem に丸めると 66px になって bounds を超え、WebView と重なる。だから唯一の `GRID_EXEMPT` として残している。

## 5. フォーカスリング方針

- `src/index.css` に `:where(a, button, input, select, textarea, summary, [role="button"], [role="tab"], [tabindex]:not([tabindex="-1"])):focus-visible` のグローバル既定がある。`:where()` は詳細度 0 なので、コンポーネント側の指定が常に勝つ。取りこぼしの保険という位置づけ。あわせて `:disabled` / `[aria-disabled="true"]` の `cursor: not-allowed` と、`prefers-reduced-motion: reduce` での transition / animation の実質無効化もグローバルで持つ。
- コンポーネント側は `&:focus-visible { @include m.focus-ring; }` を**明示**する。Storybook は `index.css` を読み込まないため、グローバルだけに頼ると Story でフォーカスリングが再現できない。契約テスト（項目 6・7）が、押せる要素の `:focus-visible` 定義の欠落と `outline: none` を検出する。
- リングの色は `--mcx-accent`（既に全背景で 4.5:1 検証済み）。`outline: none` 単独の記述は原則禁止。`&:focus` + `outline: none` は `&:focus-visible` + `focus-ring` に置換する。入力欄は `border-color: var(--mcx-accent)` も併用する。
- マウスクリックではリングを出さず、キーボード操作でのみ出す（`:focus-visible` を使う理由）。
- グローバル既定を足すときは `:root[data-theme]` の色トークンブロックに**宣言を足さない**。`themeContrast` / `swipeBarColors` の契約テストが最初の `}` までをパースするため、ブロックの**後**に書く。
- 親の `overflow` でリングが切れる要素（TopBar の `.columnList` / `.row2` 内のボタンなど）は、リングを内側に描く: `@include m.focus-ring; outline-offset: -(t.$focus-ring-offset);`
- チェックボックス / ラジオ / トグルは input を視覚的に隠している構造が多い。その場合は親 label に `&:has(input:focus-visible) { @include m.focus-ring; }` でリングを出す（`AppSettingsPanel` / `SettingsPanel` / `ColumnLayoutTab` / `ExtensionsTab` の例）。

## 6. Android のみ 44px にする理由と実装知見

- 操作要素の当たり判定を 2.75rem（44px、推奨 3rem）以上にするのは Android だけ。`[data-platform="android"]` 限定の上書き（ミキシン `android-tap-target`）で実現する。`_dialog-fullscreen.scss` と同じ `:global([data-platform="android"]) &` 方式。
- 理由は、固定バーの高さがネイティブ bounds と連動しており変更できないことと、desktop の操作密度を維持するため。
- チェックボックス / ラジオ / トグルは `label`（`cursor: pointer`）全体に `android-tap-target` を適用し、`input` 自体は拡大しない（見た目が崩れるため）。契約テストは `input[type=checkbox|radio]` を判定から除外し、親 label を検査する。
- **`android-tap-target` は `min-height` と `min-width` の両方を設定する**。すでに `min-width` を持つ要素（例: `MobileTabBar` の `.tab { min-width: 6.25rem }`）に使うと、Android で `min-width: 2.75rem` が上書きし、短いラベルのタブが 100px 未満に縮む。そうした要素にはミキシンを使わず、`:global([data-platform="android"]) & { min-height: t.$tap-target-min; }` で高さだけを指定する（契約テストの `min-height` 2.75rem 以上の判定を満たす）。
- 固定高さのバーの中にミキシンを使わない（バーが高くなって bounds とずれる）。バー内の desktop 専用要素は `ANDROID_TAP_EXEMPT`。

## 7. ダイアログ a11y と `useRestoreFocus`

共通フック `src/hooks/useRestoreFocus.ts` は、**初回レンダー中**に `document.activeElement`（`body` 以外）を覚え、アンマウント時に（DOM に残っていて、フォーカスが誰にも持たれていなければ）フォーカスを戻す。

- 保存を初回レンダー中に行うのは、子の `autoFocus` より前に取得するため。
- 戻す条件を「フォーカスが `body` / `null` のとき」に絞っている。**React StrictMode の開発時の擬似アンマウントで、子の `autoFocus` を打ち消さないため**（絞らないと、擬似アンマウント → 元の要素へフォーカス復帰 → autoFocus した入力欄が失う）。実際のアンマウントではダイアログの DOM が消えてフォーカスは `body` に落ちるので、条件を満たす。他の要素が既にフォーカスを持っている場合は奪わない。

ダイアログには `role="dialog"` / `aria-modal="true"` / `aria-labelledby`（`useId()` による見出し id）を付け、Esc で閉じる（`useEscapeKey`）。**フォーカストラップと `<dialog>` 要素化は実装しない**（挙動変更が大きく要求外）。

## 8. 共通ヘルパ

| ファイル                          | 内容                                                                                         | 使いどころ                                       |
| --------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `src/test-utils/scssBlocks.ts`    | SCSS ブロック分解、`*.module.scss` 列挙                                                      | 契約テスト                                       |
| `src/test-utils/uiDesignRules.ts` | 検査ルール関数と `GRID_EXEMPT` / `ANDROID_TAP_EXEMPT`                                        | 契約テスト、ルールの単体テスト                   |
| `src/test-utils/a11y.ts`          | `expectAccessibleControls(container)`: button / input / select / textarea / `role=button     | tab` がアクセシブルネームを持つ                  | コンポーネントの単体テスト・Story の play |
| `src/test-utils/tapTargets.ts`    | `expectTapTargets(root, minPx)` / `expectAdjacentGap(root, minPx)` / `setPlatform(platform)` | Story の play（Android の 44px・隣接間隔の実測） |
| `src/test-utils/storyTheme.ts`    | `installThemeTokens()` / `installAppReset()`                                                 | Story（下記の落とし穴）                          |
| `src/hooks/useRestoreFocus.ts`    | ダイアログのフォーカス復帰                                                                   | ダイアログ                                       |
| `src/components/StatusMark/`      | `<StatusMark kind="success\|warning\|selected" />`（`✓` / `⚠`、`aria-hidden`）               | 状態を色だけで伝えない                           |

`tapTargets.ts` の使い方（Story の play 内）:

```ts
const restore = setPlatform("android");
try {
  await expectTapTargets(canvasElement, 44); // 44 = 2.75rem（html の font-size が 16px のとき）
  await expectAdjacentGap(canvasElement, 8);
} finally {
  restore(); // 必ず戻す（Story をまたいで data-platform を残さない）
}
```

- `expectTapTargets` は、チェックボックス / ラジオの input と、それを含まない `label`（テキスト欄の見出し）を対象外にする。
- `StatusMark` は読み上げを本文や `aria-*` に任せるため `aria-hidden`。色以外の手がかり（記号）を足すためだけに使う。

## 9. Storybook の落とし穴

- **Storybook は `src/index.css` を読まない**。次の 2 つを使い分ける。
  - `installThemeTokens()`: `index.css` の色トークンのブロック（`:root` / `:root[data-theme=...]`）だけを `<style>` で差し込み、`--mcx-*` を Story で有効にする（`border: 1px solid var(--mcx-border)` が無効値になる、フォーカスリングの `var(--mcx-accent)` が未定義になる、といった問題を防ぐ）。何度呼んでも 1 回だけ差し込む。`html, body { overflow: hidden }` などは持ち込まない。
  - `installAppReset()`: `index.css` 先頭の `*` リセット（`box-sizing: border-box` / `margin`・`padding: 0`）を一時的に有効にし、**元に戻す関数**を返す。固定高さのバー（TopBar / ColumnHeader / MobileTabBar）は border-box 前提の高さなので、**高さに収まるかを実測する Story では必須**（content-box のままだと余白・枠が加算され、実機より大きく測れる）。`try { ... } finally { restore(); }` で戻す。
- **`:focus-visible` の Story 検査には限界がある**。フォーカスリングを自作 CSS で消していても、Chromium の既定リングが出るので Story では「リングが出る」検査を通ってしまう。自作リングの削除（`outline: none` や `:focus-visible` 定義の欠落）は Story ではなく契約テスト（項目 6・7）が検出する。
- **マウスクリックでリングが出ないこと**（`:focus-visible` が効いていること）の検証には、`vitest/browser` の実クリック（`const { page } = await import("vitest/browser"); await page.getByRole(...).click()`）が必要。`element.click()` や合成イベントでは、実際のマウス操作と同じ `:focus-visible` の判定にならない。
- 狭い画面の再現は `vitest/browser` の `page.viewport` を使い、終了時に元へ戻す。`data-platform` と `font-size` もアンマウント時に戻す（`ui-scale-notes.md`）。
- 固定高さのバー（MobileTabBar の Android など）は、バー内の要素の `getBoundingClientRect()` がバーの top / bottom に収まること、タブごとの最小幅（`min-width`）が縮んでいないことまで Story で実測している。

## 10. 実装時に見つけた知見・持ち越し

- `:has(input:focus-visible)` を label に使うと、input を隠したトグル・チェックボックスでもリングを出せる（上記）。
- チェックボックス / ラジオ / トグルの Android 当たり判定は親 label に付ける。`input` 自体には付けない。
- `StrictMode` と `useRestoreFocus`: 擬似アンマウントで `autoFocus` を打ち消さないよう、戻す条件を絞った（上記）。
- 契約テストが偽陽性を出さないよう、入力欄判定は要素セレクタ・末尾クラス名（`*Input` / `*Select` / `*Textarea`）に限っている。意図しない一致は `isFormBlock` / `isCheckableCompound` を直す（フィクスチャを先に足す）。
- **手動確認へ持ち越し（実機）**: TabActionDialog の Android 行間 8px / HelpPopover の Android 44px トリガーが設定行で目立たないか / AccountManager の色パレットが Android 44px で折り返さないか / MobileTabBar の Android でタブが 6.25rem 未満に縮まないこと。
- **既知の割り切り**: NoAccountsPrompt は `role="region"`（非モーダル。`alertdialog` 化は見送り）/ UpdateDialog・LinkPopupDialog は Esc で閉じる / AccountManager の Esc が重なった ConfirmDialog と同時に閉じる（既存挙動・範囲外）/ WhatsNewDialog の `.notes` はキーボードフォーカス不可（見送り）/ ColumnLayoutTab のセル（`role=button`）内に削除 button がネスト（既存構造）/ PresetsTab の読み込む・削除ボタンのアクセシブルネームが同一 / プリセット削除は確認なし（既存）。

## 11. 不採用案

- CSS カスタムプロパティでのスペーシング: Storybook で未定義になる。
- Storybook の `preview.tsx` で `index.css` を読み込む: `html,body{overflow:hidden;height:100%}` で Story のレイアウトが崩れる。
- 固定バー高さの拡大: bounds 連動・契約テスト更新が必要で、要求外。
- フォーカストラップ / 全ダイアログの `<dialog>` 化: 挙動変更が大きく要求外。
- `src/App.css`: どこからも import されていない Vite テンプレートの残骸（`outline: none` が残っているが無効）。**触らない**。
- 未移行ファイルの除外リスト（`PENDING_MODULES`）: 段階移行中だけ使い、全ファイルの移行後に撤去した。常設すると新規ファイルが対象外になる抜け道になる。

## 12. 関連ファイル

- スキル: `.claude/skills/ui-design-principles/SKILL.md`
- 既存: `docs/development/ui-scale-notes.md`（rem・Android 全画面ダイアログ）、`src/lib/gridLayout.ts` と `gridLayout.contract.test.ts`、`src/lib/themeContrast.contract.test.ts`、`src/styles/_dialog-fullscreen.scss`
- 基盤: `src/styles/_tokens.scss`、`src/styles/_mixins.scss`、`src/hooks/useRestoreFocus.ts`、`src/components/StatusMark/`、`src/test-utils/{scssBlocks,uiDesignRules,a11y,tapTargets,storyTheme}.ts`、`src/lib/uiDesign.contract.test.ts`
