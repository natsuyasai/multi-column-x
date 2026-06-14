# モバイル: 専用フリック帯によるカラム切替 設計

- 日付: 2026-06-14
- 対象: Android（モバイル）のカラム切替操作
- ステータス: 設計合意済み（実装計画待ち）

## 背景・課題

Android ではカラム切替をスワイプ操作で行っている。現在は通常の左右スワイプがカラム内操作（X 自身の横スワイプ＝おすすめ/フォロー中タブ切替、画像カルーセル等）と干渉するため、「逆方向に引いてから折り返す」ブーメランジェスチャー（`BoomerangGestureDetector`）で誤検知を抑えている。しかしブーメラン方式でも画像拡大時の単指パンで誤検知する。ユーザーの主目的は「片手で・指の移動を最小に」カラムを切り替えたいことであり、下部タブバーのタップでは指の移動が手間。

当初は「下部 `MobileTabBar` の帯の上を横フリックする」案を採ったが、`MobileTabBar` の `.tabs` は `overflow-x: auto`（`MobileTabBar.module.scss`）で**横スクロール可能**であり、各タブは `min-width: 100px`。カラムが増えてタブが帯内に収まらなくなるとタブリストが横スクロールするため、タブバーへ付けた横フリック検出が**スクロール操作と衝突**する。フリックが本来狙う「カラムが複数ある」場面でこそ衝突するため、この案は破棄した。

## 目標

- 画像ズーム中のパンや X 自身の横スワイプと**構造的に衝突しない**カラム切替手段を提供する。
- タブバーの横スクロールとも**構造的に衝突しない**。
- 片手・最小の指移動で前後カラムへ送れる操作にする。
- ネイティブ（Kotlin / `dispatchTouchEvent` / ProGuard / システムジェスチャー除外）に手を入れず、React/TS のみで完結させ Vitest でテスト可能にする。

## 非目標（YAGNI）

- スワイプ作用域をコンテンツ領域全体へ広げること。
- ボリュームキー切替（メディア音量と競合するため不採用）。
- 2本指スワイプ（片手操作に適さないため不採用）。
- ブーメランジェスチャーの撤去（本スコープ外。実機確認後の後続タスク）。

## 採用案: タブバー直上の専用フリック帯

`MobileTabBar` の**直上に独立した専用フリック帯（`MobileSwipeBar`）を置く**。帯はメイン React UI 層に描画し、横にフリックすると隣のカラムへ送る。

- 左フリック（指を左へ）＝次カラム（order 昇順で次）
- 右フリック（指を右へ）＝前カラム

### なぜ衝突しないか（アーキテクチャ上の根拠）

- コンテンツは子 WebView（OS ネイティブの別ウィンドウ）で最前面にある。タブバー／フリック帯はメイン React UI に描画されている。
- JS の touch ハンドラはメイン UI 層のタッチしか拾えない。コンテンツ WebView は上に乗った別ウィンドウなので JS には届かない。→ 画像ズーム中のパンも X の横スワイプもコンテンツ領域で起きるため自動的に分離される。
- フリック帯は**専用の独立要素で横スクロールしない**（`MobileTabBar` の `.tabs` のようなスクロール領域を持たない）。そのためタブバー横スクロールとも衝突しない。
- 帯はメイン UI 層にあるため、最前面の column WebView に覆われると touch を受け取れない。よって帯の高さぶん column WebView を縮めて帯を露出させる（タブバー 56px を空けているのと同じ手法。JS の bounds 変更のみで完結し、ネイティブ変更は不要）。

## コンポーネント設計

### 新規 `MobileSwipeBar`（`src/components/MobileSwipeBar/`）

横フリック検出専用の帯コンポーネント。

Props:

- `height: number` — 帯の高さ（px）
- `swipeState?: { direction: "left" | "right"; phase: "progress" | "switching" } | null`
- `onSwipeNavigate?: (direction: "left" | "right") => void`

表示（アフォーダンス）:

- 帯に薄い背景色と中央のグリップドット（⠿ 相当）、両端に `‹` `›` を出し「ここを横フリックで切替」と分かるようにする。
- 切替時は既存 `swipeState` インジケータ表示を流用し、`phase: "switching"` を一瞬出してフィードバックする。

検出ロジック（`useRef` で状態保持）:

- `flickStart: { x: number; y: number; time: number } | null`

判定パラメータ（定数）:

- `MIN_FLICK_PX = 40` — 横方向の最小移動量（px）
- `MAX_FLICK_MS = 600` — この時間内に完了したものだけフリックとみなす
- 横移動が縦移動より大きいこと（`|dx| > |dy|`）

挙動:

1. `onTouchStart`: 先頭タッチ座標と時刻を `flickStart` に記録。
2. `onTouchEnd`（`onTouchMove` では確定しない）:
   - `flickStart` が無ければ何もしない。
   - 経過時間が `MAX_FLICK_MS` 超過なら破棄。
   - `dx = endX - startX`、`dy = endY - startY`。
   - `|dx| >= MIN_FLICK_PX` かつ `|dx| > |dy|` を満たすときのみ確定。
   - `dx < 0`（左へ）→ `onSwipeNavigate("left")`、`dx > 0`（右へ）→ `onSwipeNavigate("right")`。
   - `flickStart` をクリア。
3. `onTouchCancel`: `flickStart` をクリア。

帯は非スクロールなので、当初案で必要だったスクロール判別トリックは不要。素直な横フリック判定でよい。

### `MobileTabBar` の変更

- 先行コミットで追加したルート要素への横フリック検出（`onTouchStart`/`onTouchEnd`/`onTouchCancel` と `onSwipeNavigate` prop）を**撤去**する（横スクロールと衝突するため）。
- タップ（特定カラムへジャンプ）と長押し（タブアクション）は現状維持。

### `useMobileColumns` の `navigateColumn`（既存・維持）

カラム切替ロジックは `navigateColumn(direction)` に切り出し済み（order ソート → 現在 index → 隣 index → 範囲外無視 → `swipeState` 一時表示 → `setActiveColumn`）。ネイティブジェスチャー経路（`COLUMN_SWIPE_NAVIGATE`）とフリック帯経路の両方から共有する。

## グローバル設定（3点同期）

`GlobalSettings` に 2 項目を追加する。

- `mobileSwipeAreaEnabled: boolean` — デフォルト `true`。`false` のとき帯を**描画せず、column WebView をフル高さに戻す**。
- `mobileSwipeAreaHeight: number` — 帯の高さ（px）。デフォルト `28`（タブバー 56px の半分）。クランプ範囲 16–56。

更新が必要な箇所（既存のデフォルト二重定義・契約テストの規約に従う）:

- `src/types/index.ts` — `GlobalSettings` interface と `DEFAULT_GLOBAL_SETTINGS`
- `src-tauri/src/commands/settings.rs` — `GlobalSettingsData` struct・`impl Default`・camelCase 用 `#[serde(rename = "...")]`
- `contracts/default-settings.json` — fixture 再生成
- `src/components/AppSettingsPanel/AppSettingsPanel.tsx` — トグル（有効/無効）＋高さの数値入力

## 幾何・データフロー

```
画面下部（下から）
┌───────────────────────────────┐
│ x.com コンテンツ [column WebView]  │  h = innerHeight - reservedBottom
├───────────────────────────────┤
│ MobileSwipeBar (mobileSwipeAreaHeight) │  ← enabled 時のみ。横フリックで切替
├───────────────────────────────┤
│ MobileTabBar (MOBILE_TAB_BAR_HEIGHT)   │  ← タップ/長押し
└───────────────────────────────┘

reservedBottom = MOBILE_TAB_BAR_HEIGHT + (enabled ? mobileSwipeAreaHeight : 0)
```

- `useMobileColumns` の `setActiveColumn` / `restoreMobileColumns`、および `hideColumnWebviews` 等の column WebView の resize 計算で、予約高さに帯高を反映する。実装時に現行の bounds 算出箇所（`MOBILE_TAB_BAR_HEIGHT` を参照している全箇所）を確認し、`reservedBottom` の算出に統一する。
- 切替フロー:

```
[フリック帯の横フリック (JS touch)]
  → MobileSwipeBar.onSwipeNavigate("left"|"right")
  → App.tsx 経由で useMobileColumns.navigateColumn(direction)
      - columns を order ソート → activeColumnId の index → 隣 index（範囲外無視）
      - swipeState = { direction, phase: "switching" } を一時表示
      - setActiveColumn(targetId)
```

既存のネイティブ経路（`COLUMN_SWIPE_NAVIGATE` → 同じ `navigateColumn`）と統合される。

## エラー処理・エッジケース

- カラムが1個のみ: 隣が無いので何もしない（範囲外無視で吸収）。
- ダイアログ表示中: 既存の `dialogOpenRef` ガードで抑止（`navigateColumn` 内で判定済み）。
- 縦フリック（`|dy| >= |dx|`）・短い移動（`< MIN_FLICK_PX`）・規定時間超過（`> MAX_FLICK_MS`）: 切替しない。
- `mobileSwipeAreaEnabled === false`: 帯を描画せず、コンテンツをフル高さに戻す。
- `onSwipeNavigate` 未指定: 例外を出さない。

## テスト計画（Vitest, テスト名は日本語）

`src/components/MobileSwipeBar/MobileSwipeBar.test.tsx`（新規）:

- 「左へフリックすると onSwipeNavigate が left で呼ばれる」
- 「右へフリックすると onSwipeNavigate が right で呼ばれる」
- 「移動量がしきい値未満のタッチはフリックと判定されない」
- 「縦方向の移動が横より大きい場合はフリックと判定されない」
- 「規定時間を超えたゆっくりした移動はフリックと判定されない」
- 「onSwipeNavigate 未指定でもフリックでエラーにならない」

`src/components/MobileTabBar/MobileTabBar.test.tsx`:

- 先行コミットで追加したタブバー横フリックのテストを撤去する。
- タップ（onSelectColumn）・長押し（onTabAction）のリグレッションが無いことを確認。

`AppSettingsPanel` / 設定:

- 「スワイプ領域の有効/無効トグルが切り替わる」
- 「スワイプ領域の高さを変更できる（クランプされる）」
- `DEFAULT_GLOBAL_SETTINGS` 契約テスト（TS/Rust/fixture）を新フィールドに合わせて更新。

App 統合:

- 「mobileSwipeAreaEnabled が false のとき MobileSwipeBar が描画されない」

## 受け入れ基準

- タブバー直上の帯の横フリックで前後カラムへ切り替わる。
- タブのタップ・長押し、タブバーの横スクロールが従来どおり機能する（フリックと衝突しない）。
- コンテンツ領域（画像ズーム中のパン、X の横スワイプ）はフリック切替の影響を受けない。
- グローバル設定で帯の有効/無効と高さを変更でき、無効時は帯が消えてコンテンツがフル高さになる。
- 追加・更新テストを含め `npm test` がオールグリーン。フォーマッターもパス。
