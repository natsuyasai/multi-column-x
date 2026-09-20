# TopBar カラム並び替え 開発ノート

TopBar（desktop のみ）のカラムを、列グループ領域ごとのドラッグで並び替える機能に関する設計判断・落とし穴を記録する。

## 対象ファイル

- `src/components/TopBar/SortableColumnGroups.tsx` — dnd-kit による並び替え本体（`SortableGroup` / `DRAG_ACTIVATION_DISTANCE`）
- `src/components/TopBar/TopBar.module.scss` — `.columnGroup` のカーソル・ドラッグ中スタイル
- `src/components/TopBar/TopBar.test.tsx` — jsdom での単体・結合テスト（ドロップ通知・Tab 停止位置など）
- `src/components/TopBar/TopBar.stories.tsx` — 実ポインタを使う Storybook play（chromium）
- `src/lib/columnOrder.ts` — 列グループの構築・移動先解決（`buildGroups` / `resolveGroupMove`）。並び替えロジックはここに閉じており、UI 変更では触らない

## 設計判断

- **つまみを置かず、列グループ領域全体をドラッグの取っ手にする。** `useSortable` が返す `listeners` だけをグループの `<div>` にスプレッドし、ジャンプ／閉じるボタン上からも掴める。動かす単位は従来どおり同じ `gridCol` の列グループ全体。
- **`attributes`（`role="button"` / `tabIndex=0` / `aria-*`）はスプレッドしない。** キーボード並び替え（`KeyboardSensor`）を廃止したため不要で、付けるとグループが Tab 停止位置になり、内側のカラムボタンとの入れ子（ボタンの中にボタン）にもなる。キーボードでの並び替えはアプリ設定の「カラム配置」タブ側で行う。
- 対象は desktop の TopBar のみ（`!isMobile` でのみ描画）。Rust / inject / Android への影響はない。

## しきい値とクリックの区別

- `PointerSensor` の `activationConstraint` は `distance: 8`（`DRAG_ACTIVATION_DISTANCE`）。距離のみで `delay` は使わない。
- 8px 未満の移動は通常の `click` がそのままボタンに届く（ジャンプ・閉じる）。
- ドラッグ成立後の `click`（ドラッグ終了時の誤ジャンプ・誤クローズ）は、dnd-kit が document の capture フェーズで `stopPropagation` する標準機能に依存して抑制している。自前のフラグ管理は持たない。dnd-kit のアップデート時はこの挙動が維持されているか Storybook で確認すること。

## テスト上の注意

- jsdom では実ポインタによる D&D が成立しない（`getBoundingClientRect` が 0 を返す）。`TopBar.test.tsx` は `DndContext` の `onDragEnd` を捕捉して並び替え通知を検証するに留め、**8px のしきい値・click 抑制は Storybook play（chromium）で検証している。**
- dnd-kit は click 抑制リスナーをドラッグ終了の 50ms 後に外す。このリスナーは全インスタンス共通の関数のため、Story を連続実行すると直前のストーリーのタイマーが今のストーリーのリスナーを外し、ドラッグ直後の `click` が抑制されずにジャンプが発火することがある。各 play 冒頭の `prepareStory` でタイマーが切れるまで待機して回避している。**実操作では起こらないテスト実行特有の事象**で、play を新設するときも冒頭で `prepareStory` を呼ぶこと。
- CSS Modules のクラス名はハッシュ化されるため、ドラッグ中の判定は `data-dragging` 属性で行う（`aria-pressed` は `attributes` を付けないので出ない）。
- 元機能（つまみ版）の手動テスト項目 #1（つまみ）と #8（キーボード）は、つまみとキーボード並び替えの廃止により不要になった。

## 変更時の落とし穴

- `{...attributes}` をスプレッドしない（Tab 停止位置の増加・ボタン入れ子の再発）。
- ジャンプ／閉じるボタンに `onPointerDown={(e) => e.stopPropagation()}` などを付けない（ボタン上から掴めなくなる）。
- `DRAG_ACTIVATION_DISTANCE` を変えたら、閾値付近の移動量（未満 7px・超過 12px）を使う Story の期待値も見直す。
- 設定画面（`ColumnLayoutTab`）の並び替え UI は別実装（`dragHandle` と ▲▼ボタンを持つ）。TopBar の変更は影響しないし、揃える必要もない。
