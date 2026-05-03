# カラム並び替え機能 設計ドキュメント

**日付:** 2026-05-02  
**対象:** Twitter Viewer (Tauri v2 + React)

---

## 概要

ColumnHeader に「←」「→」ボタンを追加し、隣のカラムと `order` をswapすることで並び替えを実現する。

---

## 要件

- ColumnHeader のボタン配置: `↺ ← → ⚙ ✕`
- 先頭カラムの「←」ボタンは disabled
- 末尾カラムの「→」ボタンは disabled
- 並び替え後に WebView の位置を即時更新する
- 並び替え後の順序を永続化する（tauri-plugin-store 経由）

---

## 設計

### データモデル

変更なし。`Column.order: number` を隣接カラムとswapする。

### 変更ファイル

#### 1. `src/store/useAppStore.ts`

`moveColumn(columnId: string, direction: 'left' | 'right')` アクションを追加する。

ロジック:

1. `columns` を `order` でソートして配列を作る
2. 対象カラムのインデックスを特定する
3. `direction === 'left'` なら `index - 1`、`'right'` なら `index + 1` の隣カラムを取得する
4. 境界チェック（先頭で left、末尾で right なら何もしない）
5. 二つのカラムの `order` 値をswapして `updateColumn` で両方更新する
6. `save_settings` を呼んで永続化する

#### 2. `src/hooks/useColumns.ts`

`handleMoveColumn(columnId: string, direction: 'left' | 'right')` を追加して公開する。

ロジック:

1. `moveColumn(columnId, direction)` を呼ぶ
2. `recalculateAllBounds()` を呼んで WebView 位置を更新する

#### 3. `src/components/ColumnHeader/ColumnHeader.tsx`

props に `onMoveLeft` / `onMoveRight` / `isFirst` / `isLast` を追加する。

```typescript
interface ColumnHeaderProps {
  // 既存
  column: Column;
  account: Account;
  onReload: (columnId: string) => void;
  onSettings: (columnId: string) => void;
  onClose: (columnId: string) => void;
  // 追加
  onMoveLeft: (columnId: string) => void;
  onMoveRight: (columnId: string) => void;
  isFirst: boolean;
  isLast: boolean;
}
```

ボタン配置（actionsコンテナ内）:

```
↺ ← → ⚙ ✕
```

「←」は `disabled={isFirst}`、「→」は `disabled={isLast}`。

#### 4. `src/App.tsx`

- `useColumns` から `handleMoveColumn` を受け取る
- カラムを `order` でソートして `isFirst` / `isLast` を計算する
- `ColumnHeader` に `onMoveLeft` / `onMoveRight` / `isFirst` / `isLast` を渡す

---

## データフロー

```
ユーザーが「←」「→」クリック
  → ColumnHeader の onMoveLeft/onMoveRight
  → App.tsx の handleMoveColumn
  → useColumns.ts の handleMoveColumn
  → useAppStore の moveColumn（order swap + save_settings）
  → recalculateAllBounds（WebView 位置更新）
```

---

## 境界条件

| 状態              | 動作                         |
| ----------------- | ---------------------------- |
| 先頭カラムで「←」 | ボタン disabled → 何もしない |
| 末尾カラムで「→」 | ボタン disabled → 何もしない |
| カラムが1つ       | 両方 disabled                |

---

## 影響範囲

- Rust 側の変更なし（`save_settings` は既存コマンド）
- 新規コンポーネント・ファイルなし
- 既存の `recalculateAllBounds` ロジックをそのまま流用

---

## スコープ外

- ドラッグ＆ドロップ並び替え
- カラム幅の変更
