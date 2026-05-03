# Column Reorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ColumnHeader に「←」「→」ボタンを追加し、隣のカラムと `order` をswapすることでカラムの並び替えを実現する。

**Architecture:** `useAppStore` に `moveColumn` アクションを追加して `order` をswapし、`useColumns` でWebView位置の再計算を行う。`ColumnHeader` にボタンを追加し、`App.tsx` で `isFirst`/`isLast` を計算して渡す。

**Tech Stack:** React 19 + TypeScript + Zustand + Tauri v2 (Vitest でテスト)

---

## File Map

| ファイル                                       | 変更種別 | 内容                                                                 |
| ---------------------------------------------- | -------- | -------------------------------------------------------------------- |
| `src/store/useAppStore.ts`                     | Modify   | `moveColumn` アクション追加                                          |
| `src/hooks/useColumns.ts`                      | Modify   | `handleMoveColumn` 追加・公開                                        |
| `src/components/ColumnHeader/ColumnHeader.tsx` | Modify   | `onMoveLeft`/`onMoveRight`/`isFirst`/`isLast` props 追加、ボタン追加 |
| `src/App.tsx`                                  | Modify   | `handleMoveColumn` を受け取り ColumnHeader に渡す                    |

---

### Task 1: `useAppStore` に `moveColumn` を追加する

**Files:**

- Modify: `src/store/useAppStore.ts`

- [ ] **Step 1: `moveColumn` をインターフェースに追加する**

`src/store/useAppStore.ts` の `AppStore` インターフェースに以下を追加する:

```typescript
interface AppStore {
  accounts: Account[];
  columns: Column[];
  globalSettings: GlobalSettings;
  isLoaded: boolean;
  loadSettings: () => Promise<void>;
  saveSettings: () => Promise<void>;
  addAccount: (account: Account) => void;
  removeAccount: (id: string) => void;
  addColumn: (column: Column) => void;
  removeColumn: (id: string) => void;
  updateColumn: (id: string, patch: Partial<Column>) => void;
  updateGlobalSettings: (patch: Partial<GlobalSettings>) => void;
  moveColumn: (columnId: string, direction: "left" | "right") => void; // 追加
}
```

- [ ] **Step 2: `moveColumn` の実装を `create` ブロックに追加する**

`updateGlobalSettings` の後に以下を追加する:

```typescript
  moveColumn: (columnId, direction) => {
    const { columns } = get();
    const sorted = [...columns].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((c) => c.id === columnId);
    const neighborIdx = direction === 'left' ? idx - 1 : idx + 1;
    if (neighborIdx < 0 || neighborIdx >= sorted.length) return;
    const target = sorted[idx];
    const neighbor = sorted[neighborIdx];
    set((state) => ({
      columns: state.columns.map((c) => {
        if (c.id === target.id) return { ...c, order: neighbor.order };
        if (c.id === neighbor.id) return { ...c, order: target.order };
        return c;
      }),
    }));
    get().saveSettings();
  },
```

- [ ] **Step 3: TypeScript のコンパイルエラーがないか確認する**

```bash
npx tsc --noEmit
```

Expected: エラーなし（または既存のエラーのみ）

- [ ] **Step 4: コミット**

```bash
git add src/store/useAppStore.ts
git commit -m "feat: add moveColumn action to useAppStore"
```

---

### Task 2: `useColumns` に `handleMoveColumn` を追加する

**Files:**

- Modify: `src/hooks/useColumns.ts`

- [ ] **Step 1: `useAppStore` から `moveColumn` を取得する**

`useColumns.ts` の `const { columns, accounts, addColumn, removeColumn, updateColumn } = useAppStore();` を以下に変更する:

```typescript
const { columns, accounts, addColumn, removeColumn, updateColumn, moveColumn } =
  useAppStore();
```

- [ ] **Step 2: `handleMoveColumn` を追加する**

`handleRemoveColumn` の後に以下を追加する:

```typescript
// カラム移動
const handleMoveColumn = useCallback(
  async (columnId: string, direction: "left" | "right") => {
    moveColumn(columnId, direction);
    await recalculateAllBounds();
  },
  [moveColumn, recalculateAllBounds],
);
```

- [ ] **Step 3: return に `handleMoveColumn` を追加する**

`return` ブロックに `handleMoveColumn` を追加する:

```typescript
return {
  columns,
  containerRef,
  scrollRef,
  scrollbarRef,
  restoreColumns,
  handleAddColumn,
  handleRemoveColumn,
  handleMoveColumn, // 追加
  handleUpdateColumn,
  recalculateAllBounds,
  hideColumnWebviews,
  handleHeaderScroll,
  handleScrollbarScroll,
};
```

- [ ] **Step 4: TypeScript のコンパイルエラーがないか確認する**

```bash
npx tsc --noEmit
```

Expected: エラーなし

- [ ] **Step 5: コミット**

```bash
git add src/hooks/useColumns.ts
git commit -m "feat: add handleMoveColumn to useColumns"
```

---

### Task 3: `ColumnHeader` に「←」「→」ボタンを追加する

**Files:**

- Modify: `src/components/ColumnHeader/ColumnHeader.tsx`

- [ ] **Step 1: props インターフェースを更新する**

```typescript
interface ColumnHeaderProps {
  column: Column;
  account: Account;
  onReload: (columnId: string) => void;
  onMoveLeft: (columnId: string) => void; // 追加
  onMoveRight: (columnId: string) => void; // 追加
  onSettings: (columnId: string) => void;
  onClose: (columnId: string) => void;
  isFirst: boolean; // 追加
  isLast: boolean; // 追加
}
```

- [ ] **Step 2: コンポーネントの引数に新props を追加する**

```typescript
export const ColumnHeader: React.FC<ColumnHeaderProps> = ({
  column,
  account,
  onReload,
  onMoveLeft,
  onMoveRight,
  onSettings,
  onClose,
  isFirst,
  isLast,
}) => {
```

- [ ] **Step 3: ボタンを追加する**

`actions` コンテナ内のボタンを以下の順序に変更する（`↺ ← → ⚙ ✕`）:

```tsx
<div className={styles.actions}>
  <button
    className={styles.actionBtn}
    onClick={() => {
      onReload(column.id);
      reset();
    }}
    aria-label="更新"
    title="更新"
  >
    ↺
  </button>
  <button
    className={styles.actionBtn}
    onClick={() => onMoveLeft(column.id)}
    disabled={isFirst}
    aria-label="左に移動"
    title="左に移動"
  >
    ←
  </button>
  <button
    className={styles.actionBtn}
    onClick={() => onMoveRight(column.id)}
    disabled={isLast}
    aria-label="右に移動"
    title="右に移動"
  >
    →
  </button>
  <button
    className={styles.actionBtn}
    onClick={() => onSettings(column.id)}
    aria-label="設定"
    title="設定"
  >
    ⚙
  </button>
  <button
    className={styles.actionBtn}
    onClick={() => onClose(column.id)}
    aria-label="カラムを閉じる"
    title="カラムを閉じる"
  >
    ✕
  </button>
</div>
```

- [ ] **Step 4: TypeScript のコンパイルエラーがないか確認する**

```bash
npx tsc --noEmit
```

Expected: `App.tsx` で props が足りないというエラーが出る（次のタスクで解消する）

- [ ] **Step 5: コミット**

```bash
git add src/components/ColumnHeader/ColumnHeader.tsx
git commit -m "feat: add move buttons to ColumnHeader"
```

---

### Task 4: `App.tsx` で `handleMoveColumn` を ColumnHeader に渡す

**Files:**

- Modify: `src/App.tsx`

- [ ] **Step 1: `useColumns` から `handleMoveColumn` を取得する**

`App.tsx` の `useColumns()` の分解を更新する:

```typescript
const {
  columns,
  containerRef,
  scrollRef,
  scrollbarRef,
  restoreColumns,
  handleAddColumn,
  handleRemoveColumn,
  handleMoveColumn, // 追加
  handleUpdateColumn,
  recalculateAllBounds,
  hideColumnWebviews,
  handleHeaderScroll,
  handleScrollbarScroll,
} = useColumns();
```

- [ ] **Step 2: `isFirst`/`isLast` の計算と ColumnHeader への props 追加**

`columns.slice().sort(...)` でレンダリングしている部分を以下に変更する:

```tsx
{
  (() => {
    const sorted = columns.slice().sort((a, b) => a.order - b.order);
    return sorted.map((column, idx) => {
      const account = accounts.find((a) => a.id === column.accountId);
      if (!account) return null;
      return (
        <div key={column.id} style={{ width: column.width, flexShrink: 0 }}>
          <ColumnHeader
            column={column}
            account={account}
            onReload={handleReload}
            onMoveLeft={(id) => handleMoveColumn(id, "left")}
            onMoveRight={(id) => handleMoveColumn(id, "right")}
            onSettings={setSettingsColumnId}
            onClose={handleRemoveColumn}
            isFirst={idx === 0}
            isLast={idx === sorted.length - 1}
          />
        </div>
      );
    });
  })();
}
```

- [ ] **Step 3: TypeScript のコンパイルエラーがないか確認する**

```bash
npx tsc --noEmit
```

Expected: エラーなし

- [ ] **Step 4: コミット**

```bash
git add src/App.tsx
git commit -m "feat: wire handleMoveColumn into App and ColumnHeader"
```

---

### Task 5: 動作確認

- [ ] **Step 1: アプリを起動する**

```bash
npm run tauri:dev
```

- [ ] **Step 2: 動作を確認する**

以下をすべて確認する:

1. カラムを2つ以上追加した状態で、ヘッダーに「←」「→」ボタンが表示される
2. 先頭カラムの「←」が disabled（クリックできない・薄く表示）
3. 末尾カラムの「→」が disabled
4. 「→」を押すと右隣のカラムと入れ替わる（WebView も即座に動く）
5. 「←」を押すと左隣のカラムと入れ替わる
6. アプリを再起動しても並び順が保持されている
7. カラムが1つのとき、両方 disabled

- [ ] **Step 3: 最終コミット（問題があれば修正してから）**

```bash
git add -A
git commit -m "feat: complete column reorder with arrow buttons"
```
