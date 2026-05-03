# Column Grid Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** カラムを横一列だけでなく縦×横の任意グリッドに配置できるようにし、AppSettingsPanel の「カラム配置」タブから設定・保存できるようにする。

**Architecture:** `Column` 型に `gridRow`/`gridCol`/`heightMode`/`heightValue`/`heightUnit` を追加し、`useColumns.ts` の bounds 計算をグリッド対応に書き換える。React ヘッダーを絶対配置に変更し、各カラムの WebView 上端に正確に重ねる。`AppSettingsPanel` にタブUIを追加し、新設の `ColumnLayoutTab` コンポーネントでグリッドプレビュー＋クリック割り当てを提供する。

**Tech Stack:** React 19 + TypeScript + Zustand + SCSS Modules + Tauri v2 + Vitest

---

## File Structure

| ファイル | 変更内容 |
|---------|---------|
| `src/types/index.ts` | `Column` に gridRow/gridCol/heightMode/heightValue/heightUnit を追加 |
| `src/store/useAppStore.ts` | `loadSettings` で既存カラムへのデフォルト値補完を追加 |
| `src/hooks/useColumns.ts` | bounds 計算をグリッド対応に全面書き換え。`columnBounds` state を追加 |
| `src/App.tsx` | ヘッダーを絶対配置に変更。`columnBounds` を `useColumns` から受け取る |
| `src/App.module.scss` | `.headerRow` 廃止・絶対配置用スタイルを追加 |
| `src/components/AppSettingsPanel/AppSettingsPanel.tsx` | タブUI追加。既存コンテンツを「一般」タブに移動 |
| `src/components/AppSettingsPanel/AppSettingsPanel.module.scss` | タブ用スタイル追加 |
| `src/components/AppSettingsPanel/ColumnLayoutTab.tsx` | 新規作成。グリッドプレビュー＋クリック割り当てUI |
| `src/components/AppSettingsPanel/ColumnLayoutTab.module.scss` | 新規作成 |
| `src/store/useAppStore.test.ts` | マイグレーション処理のテストを追加 |
| `src/hooks/useColumns.test.ts` | 新規作成。グリッド bounds 計算のテスト |
| `src/components/AppSettingsPanel/ColumnLayoutTab.test.tsx` | 新規作成 |

---

## Task 1: Column 型にグリッドフィールドを追加

**Files:**
- Modify: `src/types/index.ts`
- Test: `src/types/index.test.ts`

- [ ] **Step 1: 型定義を更新する**

`src/types/index.ts` の `Column` インターフェースに以下のフィールドを追加する:

```typescript
export interface Column {
  id: string;
  accountId: string;
  pageType: PageType;
  customUrl?: string;
  homeTabName?: string;
  searchQuery?: string;
  listId?: string;
  width: number;
  order: number;
  label?: string;
  settings: ColumnSettings;
  gridRow: number;
  gridCol: number;
  heightMode: "auto" | "fixed";
  heightValue?: number;
  heightUnit?: "px" | "%";
}
```

- [ ] **Step 2: テストの既存 mockColumn を更新する**

`src/types/index.test.ts` は `resolveColumnUrl` のテストのみなので変更不要。

`src/store/useAppStore.test.ts` の `mockColumn` にグリッドフィールドを追加する（型エラー解消）:

```typescript
const mockColumn: Column = {
  id: "col-1",
  accountId: "acc-1",
  pageType: "home",
  homeTabName: "フォロー中",
  width: 350,
  order: 0,
  gridRow: 1,
  gridCol: 1,
  heightMode: "auto",
  settings: {
    autoReloadEnabled: true,
    autoReloadInterval: 60,
    showCountdown: true,
    areaRemoveEnabled: true,
    customCSS: "",
    visibleLinks: [],
  },
};
```

- [ ] **Step 3: テストを実行してエラーがないことを確認する**

```
npm run test -- --run src/types src/store/useAppStore.test.ts
```

Expected: 全テスト PASS（型エラーなし）

- [ ] **Step 4: コミット**

```bash
git add src/types/index.ts src/store/useAppStore.test.ts
git commit -m "feat: add grid layout fields to Column type"
```

---

## Task 2: loadSettings でのマイグレーション処理

**Files:**
- Modify: `src/store/useAppStore.ts`
- Test: `src/store/useAppStore.test.ts`

既存の保存データには `gridRow`/`gridCol`/`heightMode` が存在しない。起動時に補完する。

- [ ] **Step 1: マイグレーション関数のテストを書く**

`src/store/useAppStore.test.ts` に以下のテストを追加する:

```typescript
import { migrateColumn } from "./useAppStore";

describe("migrateColumn", () => {
  it("gridフィールドがない既存カラムにデフォルト値を補完する", () => {
    const legacy = {
      id: "col-1",
      accountId: "acc-1",
      pageType: "home" as const,
      width: 350,
      order: 2,
      settings: {
        autoReloadEnabled: true,
        autoReloadInterval: 60,
        showCountdown: true,
        areaRemoveEnabled: true,
        customCSS: "",
        visibleLinks: [],
      },
    };
    const result = migrateColumn(legacy as Column);
    expect(result.gridRow).toBe(1);
    expect(result.gridCol).toBe(3); // order + 1
    expect(result.heightMode).toBe("auto");
    expect(result.heightValue).toBeUndefined();
    expect(result.heightUnit).toBeUndefined();
  });

  it("gridフィールドがある新しいカラムはそのまま返す", () => {
    const col: Column = {
      ...mockColumn,
      gridRow: 2,
      gridCol: 3,
      heightMode: "fixed",
      heightValue: 400,
      heightUnit: "px",
    };
    const result = migrateColumn(col);
    expect(result.gridRow).toBe(2);
    expect(result.gridCol).toBe(3);
    expect(result.heightMode).toBe("fixed");
    expect(result.heightValue).toBe(400);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

```
npm run test -- --run src/store/useAppStore.test.ts
```

Expected: FAIL（`migrateColumn` が未定義）

- [ ] **Step 3: `migrateColumn` を実装して export する**

`src/store/useAppStore.ts` に追加:

```typescript
export function migrateColumn(col: Partial<Column> & Pick<Column, "id" | "accountId" | "pageType" | "width" | "order" | "settings">): Column {
  return {
    gridRow: 1,
    gridCol: (col.order ?? 0) + 1,
    heightMode: "auto",
    ...col,
  } as Column;
}
```

`loadSettings` 内の `columns: settings.columns.sort(...)` を以下に変更:

```typescript
columns: settings.columns.map(migrateColumn).sort((a, b) => a.order - b.order),
```

- [ ] **Step 4: テストを実行して PASS することを確認する**

```
npm run test -- --run src/store/useAppStore.test.ts
```

Expected: 全テスト PASS

- [ ] **Step 5: コミット**

```bash
git add src/store/useAppStore.ts src/store/useAppStore.test.ts
git commit -m "feat: migrate existing columns to add grid layout defaults"
```

---

## Task 3: useColumns のグリッド対応 bounds 計算

**Files:**
- Modify: `src/hooks/useColumns.ts`
- Create: `src/hooks/useColumns.test.ts`

- [ ] **Step 1: テストファイルを作成して失敗するテストを書く**

`src/hooks/useColumns.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { calculateGridBounds } from "./useColumns";
import type { Column } from "../types";

const baseSettings = {
  autoReloadEnabled: true,
  autoReloadInterval: 60,
  showCountdown: true,
  areaRemoveEnabled: true,
  customCSS: "",
  visibleLinks: [],
};

function makeCol(overrides: Partial<Column> & Pick<Column, "id" | "gridCol" | "gridRow">): Column {
  return {
    accountId: "acc-1",
    pageType: "home",
    width: 350,
    order: 0,
    heightMode: "auto",
    settings: baseSettings,
    ...overrides,
  };
}

describe("calculateGridBounds", () => {
  const opts = {
    containerWidth: 1000,
    containerHeight: 800,
    scrollLeft: 0,
    sidebarWidth: 40,
    headerHeight: 36,
    scrollbarHeight: 12,
  };

  it("横一列（gridCol=1 のみ）の場合、既存と同じ結果を返す", () => {
    const cols = [makeCol({ id: "c1", gridCol: 1, gridRow: 1 })];
    const result = calculateGridBounds(cols, opts);
    expect(result["c1"]).toEqual({ x: 40, y: 36, width: 350, height: 752 });
    // height = 800 - 36 - 12 = 752
  });

  it("同じ gridCol に2つのカラムがある場合、縦に積む（autoは均等分割）", () => {
    const cols = [
      makeCol({ id: "c1", gridCol: 1, gridRow: 1 }),
      makeCol({ id: "c2", gridCol: 1, gridRow: 2 }),
    ];
    const result = calculateGridBounds(cols, opts);
    expect(result["c1"].y).toBe(36);
    expect(result["c1"].height).toBe(376); // 752 / 2 = 376
    expect(result["c2"].y).toBe(36 + 376);
    expect(result["c2"].height).toBe(376);
  });

  it("heightMode=fixed px のカラムは指定高さで、残りは均等割り", () => {
    const cols = [
      makeCol({ id: "c1", gridCol: 1, gridRow: 1, heightMode: "fixed", heightValue: 300, heightUnit: "px" }),
      makeCol({ id: "c2", gridCol: 1, gridRow: 2 }),
    ];
    const result = calculateGridBounds(cols, opts);
    expect(result["c1"].height).toBe(300);
    expect(result["c2"].y).toBe(36 + 300);
    expect(result["c2"].height).toBe(752 - 300); // 残り全部
  });

  it("heightMode=fixed % のカラムはコンテナ高さに対する割合", () => {
    const cols = [
      makeCol({ id: "c1", gridCol: 1, gridRow: 1, heightMode: "fixed", heightValue: 50, heightUnit: "%" }),
      makeCol({ id: "c2", gridCol: 1, gridRow: 2 }),
    ];
    const result = calculateGridBounds(cols, opts);
    expect(result["c1"].height).toBe(376); // 752 * 0.5 = 376
    expect(result["c2"].height).toBe(376);
  });

  it("異なる gridCol は x 座標をずらす", () => {
    const cols = [
      makeCol({ id: "c1", gridCol: 1, gridRow: 1 }),
      makeCol({ id: "c2", gridCol: 2, gridRow: 1 }),
    ];
    const result = calculateGridBounds(cols, opts);
    expect(result["c1"].x).toBe(40);
    expect(result["c2"].x).toBe(40 + 350); // sidebarWidth + c1.width
  });

  it("scrollLeft が x 座標に反映される", () => {
    const cols = [makeCol({ id: "c1", gridCol: 1, gridRow: 1 })];
    const result = calculateGridBounds(cols, { ...opts, scrollLeft: 100 });
    expect(result["c1"].x).toBe(40 - 100);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

```
npm run test -- --run src/hooks/useColumns.test.ts
```

Expected: FAIL（`calculateGridBounds` が未定義）

- [ ] **Step 3: `calculateGridBounds` を実装して export する**

`src/hooks/useColumns.ts` の先頭付近（定数定義の後）に追加:

```typescript
export interface ColumnBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface GridBoundsOptions {
  containerWidth: number;
  containerHeight: number;
  scrollLeft: number;
  sidebarWidth: number;
  headerHeight: number;
  scrollbarHeight: number;
}

export function calculateGridBounds(
  columns: Column[],
  opts: GridBoundsOptions,
): Record<string, ColumnBounds> {
  const { containerHeight, scrollLeft, sidebarWidth, headerHeight, scrollbarHeight } = opts;
  const availableHeight = containerHeight - headerHeight - scrollbarHeight;

  // gridCol でグループ化
  const byCol = new Map<number, Column[]>();
  for (const col of columns) {
    if (!byCol.has(col.gridCol)) byCol.set(col.gridCol, []);
    byCol.get(col.gridCol)!.push(col);
  }

  // gridCol を昇順にソート
  const sortedCols = [...byCol.keys()].sort((a, b) => a - b);

  const result: Record<string, ColumnBounds> = {};
  let xOffset = sidebarWidth;

  for (const colNum of sortedCols) {
    const colGroup = byCol.get(colNum)!.slice().sort((a, b) => a.gridRow - b.gridRow);

    // fixed 高さの合計を計算
    let fixedTotal = 0;
    let autoCount = 0;
    for (const col of colGroup) {
      if (col.heightMode === "fixed" && col.heightValue != null) {
        if (col.heightUnit === "%") {
          fixedTotal += availableHeight * col.heightValue / 100;
        } else {
          fixedTotal += col.heightValue;
        }
      } else {
        autoCount++;
      }
    }
    const autoHeight = autoCount > 0 ? Math.max(0, availableHeight - fixedTotal) / autoCount : 0;

    let yOffset = headerHeight;
    for (const col of colGroup) {
      let height: number;
      if (col.heightMode === "fixed" && col.heightValue != null) {
        height = col.heightUnit === "%" ? availableHeight * col.heightValue / 100 : col.heightValue;
      } else {
        height = autoHeight;
      }
      result[col.id] = {
        x: xOffset - scrollLeft,
        y: yOffset,
        width: col.width,
        height: Math.round(height),
      };
      yOffset += Math.round(height);
    }

    // 同じ gridCol 内の最大 width を使って x を進める
    const colWidth = Math.max(...colGroup.map((c) => c.width));
    xOffset += colWidth;
  }

  return result;
}
```

- [ ] **Step 4: テストを実行して PASS することを確認する**

```
npm run test -- --run src/hooks/useColumns.test.ts
```

Expected: 全テスト PASS

- [ ] **Step 5: `useColumns` 本体を `calculateGridBounds` を使うよう書き換える**

`src/hooks/useColumns.ts` の `useColumns` 関数を以下のように変更する:

1. `columnBounds` state を追加（`useAppStore` の外で管理するため `useState` を import）:

```typescript
import { useCallback, useEffect, useRef, useState } from "react";
```

2. `useColumns` 関数内に state を追加:

```typescript
const [columnBounds, setColumnBounds] = useState<Record<string, ColumnBounds>>({});
```

3. `recalculateAllBounds` を書き換え（`calculateBounds` は削除して `calculateGridBounds` を使う）:

```typescript
const recalculateAllBounds = useCallback(async () => {
  if (!containerRef.current) return;
  const containerHeight = containerRef.current.clientHeight;
  const containerWidth = containerRef.current.clientWidth;
  const scrollLeft = scrollRef.current?.scrollLeft ?? 0;
  const { columns: currentColumns, sidebarExpanded } = useAppStore.getState();
  const sidebarWidth = sidebarExpanded ? SIDEBAR_EXPANDED_WIDTH : SIDEBAR_COLLAPSED_WIDTH;

  const bounds = calculateGridBounds(currentColumns, {
    containerWidth,
    containerHeight,
    scrollLeft,
    sidebarWidth,
    headerHeight: HEADER_HEIGHT,
    scrollbarHeight: SCROLLBAR_HEIGHT,
  });

  setColumnBounds(bounds);

  await Promise.all(
    Object.entries(bounds).map(([columnId, b]) =>
      invoke("resize_column_webview", {
        bounds: { columnId, ...b },
      }).catch(console.error),
    ),
  );
}, []);
```

4. `restoreColumns` を書き換え:

```typescript
const restoreColumns = useCallback(
  async (sidebarWidth: number) => {
    if (!containerRef.current) return;
    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;
    const scrollLeft = scrollRef.current?.scrollLeft ?? 0;
    const { columns: currentColumns, accounts: currentAccounts } = useAppStore.getState();

    const bounds = calculateGridBounds(currentColumns, {
      containerWidth,
      containerHeight,
      scrollLeft,
      sidebarWidth,
      headerHeight: HEADER_HEIGHT,
      scrollbarHeight: SCROLLBAR_HEIGHT,
    });

    setColumnBounds(bounds);

    for (const column of currentColumns) {
      const account = currentAccounts.find((a) => a.id === column.accountId);
      if (!account) continue;
      const b = bounds[column.id];
      if (!b) continue;
      await invoke("create_column_webview", {
        args: {
          column,
          dataDirectory: account.dataDirectory,
          ...b,
        },
      }).catch(console.error);
    }
  },
  [],
);
```

5. `handleAddColumn` を書き換え（`calculateBounds` の呼び出しを `calculateGridBounds` に変更）:

```typescript
const handleAddColumn = useCallback(
  async (column: Column) => {
    const account = accounts.find((a) => a.id === column.accountId);
    if (!account || !containerRef.current) return;

    addColumn(column);

    const containerHeight = containerRef.current.clientHeight;
    const containerWidth = containerRef.current.clientWidth;
    const scrollLeft = scrollRef.current?.scrollLeft ?? 0;
    const { sidebarExpanded, columns: updatedColumns } = useAppStore.getState();
    const sidebarWidth = sidebarExpanded ? SIDEBAR_EXPANDED_WIDTH : SIDEBAR_COLLAPSED_WIDTH;

    // addColumn 後のストアから最新カラムリストを取得して bounds を計算
    const allColumns = [...updatedColumns];
    const bounds = calculateGridBounds(allColumns, {
      containerWidth,
      containerHeight,
      scrollLeft,
      sidebarWidth,
      headerHeight: HEADER_HEIGHT,
      scrollbarHeight: SCROLLBAR_HEIGHT,
    });

    setColumnBounds(bounds);
    const b = bounds[column.id];
    if (!b) return;

    await invoke("create_column_webview", {
      args: { column, dataDirectory: account.dataDirectory, ...b },
    });
  },
  [columns, accounts, addColumn],
);
```

6. return に `columnBounds` を追加:

```typescript
return {
  columns,
  columnBounds,
  containerRef,
  scrollRef,
  scrollbarRef,
  restoreColumns,
  handleAddColumn,
  handleRemoveColumn,
  handleMoveColumn,
  handleUpdateColumn,
  recalculateAllBounds,
  hideColumnWebviews,
  handleHeaderScroll,
  handleScrollbarScroll,
};
```

- [ ] **Step 6: テストを実行して PASS することを確認する**

```
npm run test -- --run
```

Expected: 全テスト PASS

- [ ] **Step 7: コミット**

```bash
git add src/hooks/useColumns.ts src/hooks/useColumns.test.ts
git commit -m "feat: rewrite bounds calculation to support grid layout"
```

---

## Task 4: App.tsx のヘッダー絶対配置対応

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.module.scss`

- [ ] **Step 1: `App.module.scss` を更新する**

`.headerRow` と `.columnHeaders` を削除し、以下を追加:

```scss
.columnHeaderWrapper {
  position: absolute;
  z-index: 10;
  pointer-events: auto;
}
```

`.webviewArea` は変更なし（flex: 1 のまま）。

- [ ] **Step 2: `App.tsx` のヘッダーレンダリングを絶対配置に変更する**

`useColumns` から `columnBounds` を取得:

```typescript
const {
  columns,
  columnBounds,   // 追加
  containerRef,
  // ... 残りは変更なし
} = useColumns();
```

`scrollbarWidth` の計算をグリッド対応に変更（最大 x+width を算出）:

```typescript
const scrollbarWidth = useMemo(() => {
  return Object.values(columnBounds).reduce((max, b) => Math.max(max, b.x + b.width), 0);
}, [columnBounds]);
```

ヘッダーレンダリング部分を以下に変更（`<div className={styles.headerRow}>` ブロック全体を置き換え）:

```tsx
{columns.map((column) => {
  const account = accounts.find((a) => a.id === column.accountId);
  const bounds = columnBounds[column.id];
  if (!account || !bounds) return null;
  const sorted = [...columns].sort((a, b) => a.order - b.order);
  const idx = sorted.findIndex((c) => c.id === column.id);
  return (
    <div
      key={column.id}
      className={styles.columnHeaderWrapper}
      style={{
        left: bounds.x,
        top: bounds.y - HEADER_HEIGHT,
        width: bounds.width,
      }}
    >
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
})}
```

`HEADER_HEIGHT` を import するため、`useColumns.ts` からも export する:

`src/hooks/useColumns.ts` の定数を export:
```typescript
export const HEADER_HEIGHT = 36;
export const SCROLLBAR_HEIGHT = 12;
```

`App.tsx` の import を更新:
```typescript
import {
  useColumns,
  HEADER_HEIGHT,
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_EXPANDED_WIDTH,
} from "./hooks/useColumns";
```

`handleJumpToColumn` もグリッド対応に変更:

```typescript
const handleJumpToColumn = useCallback(
  (columnId: string) => {
    const el = scrollRef.current;
    if (!el) return;
    const bounds = columnBounds[columnId];
    if (!bounds) return;
    // scrollLeft を加算して実際のオフセットを算出
    const scrollEl = scrollbarRef.current;
    const currentScroll = scrollEl?.scrollLeft ?? 0;
    el.scrollLeft = currentScroll + bounds.x - (sidebarExpanded ? SIDEBAR_EXPANDED_WIDTH : SIDEBAR_COLLAPSED_WIDTH);
  },
  [columnBounds, scrollRef, scrollbarRef, sidebarExpanded],
);
```

- [ ] **Step 3: 開発サーバーを起動して動作確認する**

```
npm run tauri:dev
```

確認項目:
- カラムのヘッダーが正しい位置に表示される
- スクロールするとヘッダーが追従する
- ダイアログを開くと WebView が退避し、閉じると戻る

- [ ] **Step 4: コミット**

```bash
git add src/App.tsx src/App.module.scss src/hooks/useColumns.ts
git commit -m "feat: change column headers to absolute positioning for grid layout"
```

---

## Task 5: AppSettingsPanel にタブUIを追加

**Files:**
- Modify: `src/components/AppSettingsPanel/AppSettingsPanel.tsx`
- Modify: `src/components/AppSettingsPanel/AppSettingsPanel.module.scss`

- [ ] **Step 1: タブ用スタイルを `AppSettingsPanel.module.scss` に追加する**

既存ファイルの末尾に追加:

```scss
.tabs {
  display: flex;
  border-bottom: 1px solid #2a2a2a;
  flex-shrink: 0;
  padding: 0 4px;
}

.tab {
  padding: 10px 16px;
  font-size: 13px;
  color: #666;
  cursor: pointer;
  border: none;
  background: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color 0.15s;

  &:hover {
    color: #aaa;
  }
}

.tabActive {
  color: #eee;
  border-bottom-color: #1d9bf0;
}

.tabContent {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
```

- [ ] **Step 2: `AppSettingsPanel.tsx` にタブを追加する**

既存の全コンテンツを「一般」タブに移動し、「カラム配置」タブを追加:

```tsx
import React, { useState } from "react";
import type { GlobalSettings, Column } from "../../types";
import { ColumnLayoutTab } from "./ColumnLayoutTab";
import styles from "./AppSettingsPanel.module.scss";

interface AppSettingsPanelProps {
  settings: GlobalSettings;
  columns: Column[];
  onApply: (patch: Partial<GlobalSettings>) => void;
  onApplyLayout: (columns: Column[]) => void;
  onClose: () => void;
}

export const AppSettingsPanel: React.FC<AppSettingsPanelProps> = ({
  settings,
  columns,
  onApply,
  onApplyLayout,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<"general" | "layout">("general");
  const [autoReloadEnabled, setAutoReloadEnabled] = useState(settings.defaultAutoReloadEnabled);
  const [autoReloadInterval, setAutoReloadInterval] = useState(settings.defaultAutoReloadInterval);
  const [popupEscCloseEnabled, setPopupEscCloseEnabled] = useState(settings.popupEscCloseEnabled);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onApply({
      defaultAutoReloadEnabled: autoReloadEnabled,
      defaultAutoReloadInterval: autoReloadInterval,
      popupEscCloseEnabled: popupEscCloseEnabled,
    });
    onClose();
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <h2 className={styles.title}>アプリ設定</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="閉じる">✕</button>
        </div>

        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${activeTab === "general" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("general")}
          >
            一般
          </button>
          <button
            className={`${styles.tab} ${activeTab === "layout" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("layout")}
          >
            カラム配置
          </button>
        </div>

        <div className={styles.tabContent}>
          {activeTab === "general" && (
            <form onSubmit={handleSubmit} className={styles.form}>
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>カラムのデフォルト設定</h3>
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={autoReloadEnabled}
                    onChange={(e) => setAutoReloadEnabled(e.target.checked)}
                  />
                  自動更新を有効にする
                </label>
                {autoReloadEnabled && (
                  <label className={styles.fieldLabel}>
                    更新間隔（秒）
                    <input
                      type="number"
                      className={styles.numberInput}
                      min={10}
                      max={3600}
                      value={autoReloadInterval}
                      onChange={(e) => setAutoReloadInterval(Number(e.target.value))}
                    />
                  </label>
                )}
                <p className={styles.hint}>新しく追加するカラムに適用されます</p>
              </section>

              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>ポップアップウィンドウ</h3>
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={popupEscCloseEnabled}
                    onChange={(e) => setPopupEscCloseEnabled(e.target.checked)}
                  />
                  Escキーで閉じる
                </label>
              </section>

              <div className={styles.actions}>
                <button type="button" className={styles.cancelBtn} onClick={onClose}>キャンセル</button>
                <button type="submit" className={styles.applyBtn}>適用</button>
              </div>
            </form>
          )}

          {activeTab === "layout" && (
            <ColumnLayoutTab
              columns={columns}
              onApply={(updatedColumns) => {
                onApplyLayout(updatedColumns);
                onClose();
              }}
              onCancel={onClose}
            />
          )}
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 3: `App.tsx` で `AppSettingsPanel` の props を更新する**

`App.tsx` 内の `<AppSettingsPanel>` の呼び出しを変更:

```tsx
{showAppSettings && (
  <AppSettingsPanel
    settings={globalSettings}
    columns={columns}
    onApply={updateGlobalSettings}
    onApplyLayout={(updatedColumns) => {
      updatedColumns.forEach((col) => handleUpdateColumn(col.id, col));
      recalculateAllBounds();
    }}
    onClose={() => setShowAppSettings(false)}
  />
)}
```

- [ ] **Step 4: テストを実行してエラーがないことを確認する**

```
npm run test -- --run
```

Expected: 全テスト PASS（型エラーなし）

- [ ] **Step 5: コミット**

```bash
git add src/components/AppSettingsPanel/AppSettingsPanel.tsx src/components/AppSettingsPanel/AppSettingsPanel.module.scss src/App.tsx
git commit -m "feat: add tab UI to AppSettingsPanel"
```

---

## Task 6: ColumnLayoutTab コンポーネントの実装

**Files:**
- Create: `src/components/AppSettingsPanel/ColumnLayoutTab.tsx`
- Create: `src/components/AppSettingsPanel/ColumnLayoutTab.module.scss`
- Create: `src/components/AppSettingsPanel/ColumnLayoutTab.test.tsx`

- [ ] **Step 1: テストファイルを作成して失敗するテストを書く**

`src/components/AppSettingsPanel/ColumnLayoutTab.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ColumnLayoutTab } from "./ColumnLayoutTab";
import type { Column } from "../../types";

const baseSettings = {
  autoReloadEnabled: true,
  autoReloadInterval: 60,
  showCountdown: true,
  areaRemoveEnabled: true,
  customCSS: "",
  visibleLinks: [],
};

const mockColumns: Column[] = [
  {
    id: "c1", accountId: "acc-1", pageType: "home",
    width: 350, order: 0, gridRow: 1, gridCol: 1, heightMode: "auto",
    settings: baseSettings,
  },
  {
    id: "c2", accountId: "acc-1", pageType: "notifications",
    width: 350, order: 1, gridRow: 1, gridCol: 2, heightMode: "auto",
    settings: baseSettings,
  },
];

describe("ColumnLayoutTab", () => {
  it("グリッドプレビューにカラムが表示される", () => {
    render(<ColumnLayoutTab columns={mockColumns} onApply={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText("home")).toBeInTheDocument();
    expect(screen.getByText("notifications")).toBeInTheDocument();
  });

  it("セルをクリックして高さ設定が表示される", () => {
    render(<ColumnLayoutTab columns={mockColumns} onApply={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText("home"));
    expect(screen.getByText("高さ設定")).toBeInTheDocument();
  });

  it("適用ボタンでonApplyが呼ばれる", () => {
    const onApply = vi.fn();
    render(<ColumnLayoutTab columns={mockColumns} onApply={onApply} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText("適用"));
    expect(onApply).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ id: "c1" }),
    ]));
  });

  it("×ボタンで割り当てを解除すると未割当リストに移動する", () => {
    render(<ColumnLayoutTab columns={mockColumns} onApply={vi.fn()} onCancel={vi.fn()} />);
    // c1 セルの × ボタンをクリック
    const removeButtons = screen.getAllByLabelText("割り当て解除");
    fireEvent.click(removeButtons[0]);
    expect(screen.getByText("未割当")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

```
npm run test -- --run src/components/AppSettingsPanel/ColumnLayoutTab.test.tsx
```

Expected: FAIL（ColumnLayoutTab が未定義）

- [ ] **Step 3: `ColumnLayoutTab.module.scss` を作成する**

```scss
.container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 20px;
  flex: 1;
}

.gridSizeRow {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #ccc;
}

.numberInput {
  width: 52px;
  background: #111;
  border: 1px solid #333;
  border-radius: 4px;
  color: #eee;
  font-size: 13px;
  padding: 4px 8px;
  text-align: center;

  &:focus {
    outline: none;
    border-color: #1d9bf0;
  }
}

.body {
  display: flex;
  gap: 12px;
  flex: 1;
  min-height: 200px;
}

.gridPreview {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.gridRow {
  display: flex;
  gap: 2px;
  flex: 1;
}

.cell {
  flex: 1;
  min-height: 60px;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  padding: 6px 8px;
  cursor: pointer;
  position: relative;
  font-size: 11px;
  background: #2a2a3e;
  border: 2px dashed #444;
  align-items: center;
  justify-content: center;
  color: #555;
  gap: 0;

  &:hover {
    border-color: #666;
  }
}

.cellAssigned {
  background: #1d9bf022;
  border: 2px solid #1d9bf0;
  color: #eee;
  align-items: flex-start;
  justify-content: flex-start;

  &.cellSelected {
    border-color: #f0c01d;
    background: #f0c01d22;
  }
}

.cellLabel {
  font-size: 11px;
  color: #888;
  margin-bottom: 2px;
}

.cellName {
  font-size: 12px;
  color: #eee;
  font-weight: 500;
}

.cellHeight {
  font-size: 10px;
  color: #888;
  margin-top: 2px;
}

.removeBtn {
  position: absolute;
  top: 2px;
  right: 2px;
  background: none;
  border: none;
  color: #666;
  cursor: pointer;
  font-size: 11px;
  padding: 2px 4px;
  line-height: 1;
  border-radius: 2px;

  &:hover {
    color: #f55;
    background: #2a2a2a;
  }
}

.unassigned {
  width: 120px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.unassignedLabel {
  font-size: 11px;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 4px;
}

.unassignedItem {
  background: #2a2a2e;
  border: 1px solid #444;
  border-radius: 4px;
  padding: 6px 8px;
  cursor: pointer;
  font-size: 11px;
  color: #ccc;

  &:hover {
    border-color: #1d9bf0;
    color: #fff;
  }

  &.unassignedItemSelected {
    border-color: #1d9bf0;
    background: #1d9bf022;
  }
}

.unassignedName {
  font-weight: 500;
}

.unassignedAccount {
  font-size: 10px;
  color: #666;
  margin-top: 1px;
}

.heightSettings {
  background: #1e1e2e;
  border: 1px solid #333;
  border-radius: 6px;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.heightSettingsTitle {
  font-size: 11px;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.heightRow {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.radioLabel {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: #ccc;
  cursor: pointer;

  input[type="radio"] {
    accent-color: #1d9bf0;
    cursor: pointer;
  }
}

.fixedInputGroup {
  display: flex;
  align-items: center;
  gap: 4px;
}

.unitSelect {
  background: #111;
  border: 1px solid #333;
  border-radius: 4px;
  color: #eee;
  font-size: 13px;
  padding: 4px 6px;

  &:focus {
    outline: none;
    border-color: #1d9bf0;
  }
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 4px;
  flex-shrink: 0;
}

.cancelBtn {
  background: #2a2a2a;
  border: 1px solid #333;
  border-radius: 4px;
  color: #aaa;
  cursor: pointer;
  font-size: 13px;
  padding: 7px 16px;

  &:hover {
    background: #333;
  }
}

.applyBtn {
  background: #1d9bf0;
  border: none;
  border-radius: 4px;
  color: white;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  padding: 7px 20px;

  &:hover {
    background: #1a8cd8;
  }
}
```

- [ ] **Step 4: `ColumnLayoutTab.tsx` を実装する**

```tsx
import React, { useState, useCallback } from "react";
import type { Column } from "../../types";
import styles from "./ColumnLayoutTab.module.scss";

interface ColumnLayoutTabProps {
  columns: Column[];
  onApply: (columns: Column[]) => void;
  onCancel: () => void;
}

interface CellKey {
  row: number;
  col: number;
}

export const ColumnLayoutTab: React.FC<ColumnLayoutTabProps> = ({
  columns,
  onApply,
  onCancel,
}) => {
  const [draft, setDraft] = useState<Column[]>(() =>
    columns.map((c) => ({ ...c }))
  );
  const [rows, setRows] = useState(() => Math.max(...columns.map((c) => c.gridRow), 1));
  const [cols, setCols] = useState(() => Math.max(...columns.map((c) => c.gridCol), 1));
  const [selectedCellKey, setSelectedCellKey] = useState<CellKey | null>(null);
  const [pendingCell, setPendingCell] = useState<CellKey | null>(null);

  const assigned = draft.filter((c) => c.gridRow >= 1 && c.gridCol >= 1 && c.gridRow <= rows && c.gridCol <= cols);
  const unassigned = draft.filter((c) => !(c.gridRow >= 1 && c.gridCol >= 1 && c.gridRow <= rows && c.gridCol <= cols));

  const getCellColumn = (row: number, col: number) =>
    assigned.find((c) => c.gridRow === row && c.gridCol === col) ?? null;

  const selectedColumn = selectedCellKey
    ? getCellColumn(selectedCellKey.row, selectedCellKey.col)
    : null;

  const handleCellClick = useCallback((row: number, col: number) => {
    const colAtCell = getCellColumn(row, col);
    if (colAtCell) {
      setSelectedCellKey({ row, col });
      setPendingCell(null);
    } else {
      setPendingCell({ row, col });
      setSelectedCellKey(null);
    }
  }, [assigned]);

  const handleAssign = useCallback((columnId: string) => {
    if (!pendingCell) return;
    setDraft((prev) =>
      prev.map((c) =>
        c.id === columnId
          ? { ...c, gridRow: pendingCell.row, gridCol: pendingCell.col }
          : c
      )
    );
    setPendingCell(null);
  }, [pendingCell]);

  const handleRemove = useCallback((columnId: string) => {
    setDraft((prev) =>
      prev.map((c) =>
        c.id === columnId ? { ...c, gridRow: 9999, gridCol: 9999 } : c
      )
    );
    setSelectedCellKey(null);
  }, []);

  const handleHeightChange = useCallback(
    (columnId: string, mode: "auto" | "fixed", value?: number, unit?: "px" | "%") => {
      setDraft((prev) =>
        prev.map((c) =>
          c.id === columnId
            ? { ...c, heightMode: mode, heightValue: value, heightUnit: unit }
            : c
        )
      );
    },
    []
  );

  const getColumnLabel = (col: Column) => col.label ?? col.pageType;

  return (
    <div className={styles.container}>
      <div className={styles.gridSizeRow}>
        <span>グリッドサイズ:</span>
        <span>行</span>
        <input
          type="number"
          className={styles.numberInput}
          min={1}
          value={rows}
          onChange={(e) => setRows(Math.max(1, Number(e.target.value)))}
        />
        <span>×</span>
        <span>列</span>
        <input
          type="number"
          className={styles.numberInput}
          min={1}
          value={cols}
          onChange={(e) => setCols(Math.max(1, Number(e.target.value)))}
        />
      </div>

      <div className={styles.body}>
        <div className={styles.gridPreview}>
          {Array.from({ length: rows }, (_, rIdx) => (
            <div key={rIdx} className={styles.gridRow}>
              {Array.from({ length: cols }, (_, cIdx) => {
                const r = rIdx + 1;
                const c = cIdx + 1;
                const colAtCell = getCellColumn(r, c);
                const isSelected = selectedCellKey?.row === r && selectedCellKey?.col === c;
                const isPending = pendingCell?.row === r && pendingCell?.col === c;

                if (colAtCell) {
                  return (
                    <div
                      key={cIdx}
                      className={`${styles.cell} ${styles.cellAssigned} ${isSelected ? styles.cellSelected : ""}`}
                      onClick={() => handleCellClick(r, c)}
                    >
                      <span className={styles.cellLabel}>{r},{c}</span>
                      <span className={styles.cellName}>{getColumnLabel(colAtCell)}</span>
                      <span className={styles.cellHeight}>
                        {colAtCell.heightMode === "fixed"
                          ? `${colAtCell.heightValue}${colAtCell.heightUnit}`
                          : "均等"}
                      </span>
                      <button
                        className={styles.removeBtn}
                        aria-label="割り当て解除"
                        onClick={(e) => { e.stopPropagation(); handleRemove(colAtCell.id); }}
                      >
                        ×
                      </button>
                    </div>
                  );
                }
                return (
                  <div
                    key={cIdx}
                    className={`${styles.cell} ${isPending ? styles.cellSelected : ""}`}
                    onClick={() => handleCellClick(r, c)}
                  >
                    +
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className={styles.unassigned}>
          <div className={styles.unassignedLabel}>未割当</div>
          {unassigned.map((col) => (
            <div
              key={col.id}
              className={`${styles.unassignedItem} ${pendingCell ? styles.unassignedItemSelected : ""}`}
              onClick={() => pendingCell && handleAssign(col.id)}
            >
              <div className={styles.unassignedName}>{getColumnLabel(col)}</div>
            </div>
          ))}
          {unassigned.length === 0 && (
            <div style={{ fontSize: 11, color: "#444" }}>なし</div>
          )}
        </div>
      </div>

      {selectedColumn && (
        <div className={styles.heightSettings}>
          <div className={styles.heightSettingsTitle}>高さ設定</div>
          <div className={styles.heightRow}>
            <label className={styles.radioLabel}>
              <input
                type="radio"
                name="heightMode"
                checked={selectedColumn.heightMode === "auto"}
                onChange={() => handleHeightChange(selectedColumn.id, "auto")}
              />
              均等（自動）
            </label>
            <label className={styles.radioLabel}>
              <input
                type="radio"
                name="heightMode"
                checked={selectedColumn.heightMode === "fixed"}
                onChange={() =>
                  handleHeightChange(selectedColumn.id, "fixed", selectedColumn.heightValue ?? 400, selectedColumn.heightUnit ?? "px")
                }
              />
              固定:
            </label>
            {selectedColumn.heightMode === "fixed" && (
              <div className={styles.fixedInputGroup}>
                <input
                  type="number"
                  className={styles.numberInput}
                  min={1}
                  value={selectedColumn.heightValue ?? 400}
                  onChange={(e) =>
                    handleHeightChange(selectedColumn.id, "fixed", Number(e.target.value), selectedColumn.heightUnit ?? "px")
                  }
                />
                <select
                  className={styles.unitSelect}
                  value={selectedColumn.heightUnit ?? "px"}
                  onChange={(e) =>
                    handleHeightChange(selectedColumn.id, "fixed", selectedColumn.heightValue ?? 400, e.target.value as "px" | "%")
                  }
                >
                  <option value="px">px</option>
                  <option value="%">%</option>
                </select>
              </div>
            )}
          </div>
        </div>
      )}

      <div className={styles.actions}>
        <button className={styles.cancelBtn} onClick={onCancel}>キャンセル</button>
        <button className={styles.applyBtn} onClick={() => onApply(draft)}>適用</button>
      </div>
    </div>
  );
};
```

- [ ] **Step 5: テストを実行して PASS することを確認する**

```
npm run test -- --run src/components/AppSettingsPanel/ColumnLayoutTab.test.tsx
```

Expected: 全テスト PASS

- [ ] **Step 6: 全テストを実行する**

```
npm run test -- --run
```

Expected: 全テスト PASS

- [ ] **Step 7: コミット**

```bash
git add src/components/AppSettingsPanel/ColumnLayoutTab.tsx src/components/AppSettingsPanel/ColumnLayoutTab.module.scss src/components/AppSettingsPanel/ColumnLayoutTab.test.tsx
git commit -m "feat: implement ColumnLayoutTab for grid placement settings"
```

---

## Task 7: AddColumnDialog で gridRow/gridCol のデフォルト値を設定

**Files:**
- Modify: `src/components/AddColumnDialog/AddColumnDialog.tsx`

新しいカラムを追加するとき、未使用の gridCol に自動配置する。

- [ ] **Step 1: `AddColumnDialog.tsx` を確認して onAdd で渡す Column にデフォルト値を追加する**

`AddColumnDialog.tsx` の `handleSubmit`（または `onAdd` を呼ぶ箇所）で、新規カラムに以下のフィールドを追加:

```typescript
// AddColumnDialog 内の onAdd 呼び出し部分を探して修正
// 既存の columns の最大 gridCol + 1 を使う
onAdd({
  ...columnData,
  gridRow: 1,
  gridCol: existingColumns.length > 0
    ? Math.max(...existingColumns.map((c) => c.gridCol)) + 1
    : 1,
  heightMode: "auto",
});
```

`AddColumnDialog` に `existingColumns: Column[]` props を追加して `App.tsx` から渡す。

`App.tsx` の `<AddColumnDialog>` を更新:

```tsx
{showAddColumn && accounts.length > 0 && (
  <AddColumnDialog
    accounts={accounts}
    globalSettings={globalSettings}
    existingColumns={columns}
    onAdd={(column) => {
      handleAddColumn(column);
      setShowAddColumn(false);
    }}
    onCancel={() => setShowAddColumn(false)}
  />
)}
```

- [ ] **Step 2: テストを実行してエラーがないことを確認する**

```
npm run test -- --run
```

Expected: 全テスト PASS

- [ ] **Step 3: 開発サーバーで動作を確認する**

```
npm run tauri:dev
```

確認項目:
- 新規カラムを追加すると既存カラムの右隣（gridCol が最大値+1）に配置される
- AppSettings → カラム配置タブが開く
- グリッドセルをクリック → 未割当カラムをクリックで割り当てができる
- 割り当て済みセルをクリック → 高さ設定（均等/固定）が表示される
- 「適用」で WebView が再配置される
- 縦に2つ配置したとき、両方のヘッダーが正しい位置に表示される

- [ ] **Step 4: コミット**

```bash
git add src/components/AddColumnDialog/AddColumnDialog.tsx src/App.tsx
git commit -m "feat: set default grid position for newly added columns"
```

---

## Self-Review

**Spec coverage:**
- ✅ Column 型拡張 (Task 1)
- ✅ 既存データのマイグレーション (Task 2)
- ✅ WebView グリッド bounds 計算 (Task 3)
- ✅ ヘッダー絶対配置 (Task 4)
- ✅ AppSettingsPanel タブ追加 (Task 5)
- ✅ グリッドプレビュー＋クリック割り当て UI (Task 6)
- ✅ 高さ設定（均等/固定 px・%） (Task 6)
- ✅ 「適用」で確定 → WebView 再配置 (Task 5 onApplyLayout)
- ✅ 新規カラムのデフォルト配置 (Task 7)

**Placeholder scan:** なし

**Type consistency:**
- `calculateGridBounds` は Task 3 で定義・export → Task 4 (useColumns 本体) で使用 ✅
- `ColumnBounds` は Task 3 で定義・export → Task 4 (App.tsx) で使用 ✅
- `HEADER_HEIGHT` は Task 4 で export 追加 ✅
- `onApplyLayout` は Task 5 で定義 → Task 5 App.tsx 側で使用 ✅
- `existingColumns` props は Task 7 で追加 ✅
