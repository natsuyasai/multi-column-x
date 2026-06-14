# モバイル: タブバー横フリックによるカラム切替 設計

- 日付: 2026-06-14
- 対象: Android（モバイル）のカラム切替操作
- ステータス: 設計合意済み（実装計画待ち）

## 背景・課題

Android ではカラム切替をスワイプ操作で行っている。現在は通常の左右スワイプがカラム内操作（X 自身の横スワイプ＝おすすめ/フォロー中タブ切替、画像カルーセル等）と干渉するため、「逆方向に引いてから折り返す」ブーメランジェスチャー（`BoomerangGestureDetector`）で誤検知を抑えている。

しかしブーメラン方式でも、**画像拡大時に表示位置を移動（単指パン）させたいときに誤検知**する。さらにユーザーの主目的は「**片手で・指の移動を最小に**カラムを切り替えたい」ことであり、下部タブバーをタップする現行手段（`MobileTabBar` の `onSelectColumn`）では指の移動が手間。

## 目標

- 画像ズーム中のパンや X 自身の横スワイプと**構造的に衝突しない**カラム切替手段を提供する。
- 片手・最小の指移動で前後カラムへ送れる操作にする。
- ネイティブ（Kotlin / `dispatchTouchEvent` / ProGuard / システムジェスチャー除外）に手を入れず、React/TS のみで完結させ Vitest でテスト可能にする。

## 非目標（YAGNI）

- スワイプ作用域をコンテンツ領域全体へ広げること（帯を高くする＝ネイティブ実装が必要になるため今回は対象外）。
- ボリュームキー切替（メディア音量と競合するため不採用）。
- 2本指スワイプ（片手操作に適さないため不採用）。

## 採用案: タブバー横フリックによる前後送り

画面最下部の `MobileTabBar`（高さ `MOBILE_TAB_BAR_HEIGHT = 56px`）の上を**横にフリックすると隣のカラムへ送る**。

- 左フリック（指を左へ）＝次カラム（order 昇順で次）
- 右フリック（指を右へ）＝前カラム

タップ（特定タブへジャンプ）は従来どおり維持し、同じ帯でフリックとタップを両立させる。

### なぜ衝突しないか（アーキテクチャ上の根拠）

- コンテンツは子 WebView（OS ネイティブの別ウィンドウ）、タブバーはメイン React UI に描画されている。
- そのためタブバーに付けた JS の touch ハンドラは**タブバー領域のタッチしか拾えない**。コンテンツ WebView は上に乗った別ウィンドウなので JS には届かない。
- 結果として、画像ズーム中のパンも X の横スワイプもすべてコンテンツ領域で起きるため、タブバー上のフリックとは**自動的に分離**される。ブーメランの逆引きトリックは不要で、素直な横スワイプ判定でよい。

## コンポーネント設計

### 変更対象

- `src/components/MobileTabBar/MobileTabBar.tsx` — 横フリック検出を追加。

### 検出ロジック（`MobileTabBar` 内）

タブバーのルート要素（`styles.tabBar`）に touch ハンドラを追加する。既存の `TabItem` 内の長押し用 touch ハンドラとは別レイヤー（親要素）で扱い、タップ／長押しと共存させる。

状態（`useRef`）:

- `flickStart: { x: number; y: number; time: number } | null`

判定パラメータ（定数として定義）:

- `MIN_FLICK_PX = 40` — 横方向の最小移動量（px）
- `MAX_FLICK_OFF_AXIS_RATIO = 1.0` — `|dx| > |dy|` を要求（横移動が縦移動より大きい）
- `MAX_FLICK_MS = 600` — この時間内に完了したものだけフリックとみなす

挙動:

1. `onTouchStart`: 先頭タッチ座標と時刻を `flickStart` に記録。
2. `onTouchEnd`（`onTouchMove` では確定しない）:
   - `flickStart` が無ければ何もしない。
   - 経過時間が `MAX_FLICK_MS` 超過なら破棄。
   - `dx = endX - startX`、`dy = endY - startY`。
   - `|dx| >= MIN_FLICK_PX` かつ `|dx| > |dy|` を満たすときのみフリック確定。
   - `dx < 0`（左へ）→ `onSwipeNavigate("left")` 相当（次カラム）、`dx > 0`（右へ）→ 前カラム。
   - `flickStart` をクリア。
3. `onTouchCancel`: `flickStart` をクリア。

タップとの両立: フリック確定時は `TabItem` 側の `onSelect`（クリック）が誤発火しないよう、移動量がしきい値未満（=タップ）の場合のみ通常のタップとして扱われるようにする。`TabItem` は既に `onTouchMove` で 8px 超の移動時に長押しタイマーを解除しているが、クリック自体は発火しうる。親のフリック確定時に `suppressNextClick` 相当のガードを設けるか、フリック判定を親で行いタップは子の `onClick` に委ねる（移動量が小さければ `onClick` がそのまま発火するため、フリックと明確に分離できる）。実装時に既存のクリック挙動を壊さないことをテストで担保する。

### 切替先カラムの決定

`MobileTabBar` は現在 `activeColumnId` と `onSelectColumn(id)` を受け取っている。隣カラム算出は呼び出し側（`App.tsx` 経由で `useMobileColumns`）に既存ロジックがあるため、以下のいずれか:

- 案(i): `MobileTabBar` に新規 prop `onSwipeNavigate(direction: "left" | "right")` を追加し、隣カラム算出は `useMobileColumns` 側（`COLUMN_SWIPE_NAVIGATE` リスナと同じロジック）に集約する。**推奨**（責務の一元化、テスト容易）。
- 案(ii): `MobileTabBar` 内で `columns` を order ソートして隣を求め `onSelectColumn` を呼ぶ。

案(i) を採用する。`useMobileColumns` のスワイプナビゲーションロジック（order ソート → 現在 index → 隣 index → `setActiveColumn`、範囲外は無視、`swipeState` インジケータ表示）を関数として切り出し、ネイティブイベント経路とタブバーフリック経路の両方から呼べるようにする。

### スワイプインジケータの流用

既存の `swipeState`（`{ direction, phase }`）と `MobileTabBar` のインジケータ表示はそのまま利用する。タブバーフリックでも `phase: "switching"` を一時表示して視覚フィードバックを出す。

## データフロー

```
[タブバー上の横フリック (JS touch)]
  → MobileTabBar.onSwipeNavigate("left"|"right")
  → useMobileColumns: navigateColumn(direction)
      - columns を order ソート
      - activeColumnId の index を取得
      - 隣 index を算出（範囲外は無視）
      - swipeState = { direction, phase: "switching" } を一時表示
      - setActiveColumn(targetId)
```

既存のネイティブ経路（`COLUMN_SWIPE_NAVIGATE` イベント → 同じ `navigateColumn`）と統合される。

## 既存ブーメランジェスチャーの扱い

- 第1段階では**併存**させる（ネイティブのブーメランは残したまま、タブバーフリックを追加）。リグレッションを避けつつ実機で新方式を確認するため。
- 実機でタブバーフリックが期待どおり機能することを確認後、別タスクでブーメラン（`BoomerangGestureDetector` + `MainActivity.dispatchTouchEvent` のスワイプ呼び出し）を撤去する。ダブルタップ（先頭スクロール＋リロード）は別機能なので撤去対象外。
- 本設計のスコープはタブバーフリックの追加までとし、ブーメラン撤去は後続タスクとする。

## エラー処理・エッジケース

- カラムが1個のみ: 隣が無いので何もしない（範囲外無視で吸収）。
- ダイアログ表示中: 既存の `dialogOpenRef` ガードと同様に、フリック切替も抑止する。
- 縦フリック（`|dy| >= |dx|`）: 切替しない（タブバーは現状スクロールしないが、誤作動防止）。
- 短い移動（`< MIN_FLICK_PX`）: フリックでなくタップとして従来どおり処理。

## テスト計画（Vitest, テスト名は日本語）

`src/components/MobileTabBar/MobileTabBar.test.tsx` に追加:

- 「タブバーを左へフリックすると次カラムへの onSwipeNavigate が呼ばれる」
- 「タブバーを右へフリックすると前カラムへの onSwipeNavigate が呼ばれる」
- 「移動量がしきい値未満のタッチはフリックと判定されず onSelectColumn(タップ) が維持される」
- 「縦方向の移動が横より大きい場合はフリックと判定しない」
- 「規定時間を超えたゆっくりした移動はフリックと判定しない」

`useMobileColumns` のテスト（必要に応じて）:

- 「navigateColumn(left) で order 上の次カラムがアクティブになる」
- 「navigateColumn が端カラムで範囲外のとき何もしない」

## 受け入れ基準

- タブバー上の横フリックで前後カラムへ切り替わる。
- タブのタップ（特定カラムへジャンプ）と長押し（タブアクション）が従来どおり機能する。
- コンテンツ領域（画像ズーム中のパン、X の横スワイプ）はフリック切替の影響を受けない。
- 追加テストを含め `npm test` がオールグリーン。フォーマッターもパス。
