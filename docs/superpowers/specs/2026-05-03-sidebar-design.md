# サイドバー設計書

**日付:** 2026-05-03  
**フェーズ:** Phase 1 — ボタン配置のみ（機能は後続フェーズ）

---

## 概要

アプリ最左端に固定サイドバーを追加する。左右スクロールに影響されず常に表示され、開閉トグルで幅が変わる。

---

## レイアウト

```
┌──────┬──────────────────────────────────────┐
│      │  Col1 Header │ Col2 Header │ Col3 ... │
│ Side │──────────────────────────────────────│
│ bar  │  WebView area (child webviews)        │
│      │                                      │
│      ├──────────────────────────────────────│
│      │  底部スクロールバー                   │
└──────┴──────────────────────────────────────┘
```

サイドバーは `position: fixed; left: 0; top: 0; bottom: 0` で左端に固定。  
メインコンテンツ（`.app`）は `padding-left: サイドバー幅` でオフセット。

---

## サイドバー仕様

### 幅

| 状態 | 幅 |
|------|----|
| 閉じ（デフォルト） | 40px |
| 開き | 70px |

幅の変化は CSS transition でアニメーション（200ms ease）。

### ボタン配置（上から）

1. **✏ ツイート入力ボタン**（上部固定、強調色 #1d9bf0）
2. **区切り線**
3. **カラムジャンプボタン群**（columns を order 順に並べる、スクロール可）
4. **スペーサー**（flex: 1）
5. **＋ カラム追加ボタン**
6. **👤 アカウント管理ボタン**
7. **≪ / ≫ 開閉ボタン**（最下部固定）

### 閉じ状態（40px）

- アイコンのみ表示
- ホバー時にツールチップ（`title` 属性）

### 開き状態（70px）

- アイコン + ラベルテキスト（縦2行 or 横並び）
- カラムジャンプボタンにはカラムの `label` または pageType を表示

### 開閉ボタン

- 閉じ状態: `»`（右向き矢印）
- 開き状態: `«`（左向き矢印）
- クリックでトグル

---

## WebView x座標オフセット

サイドバーは `position: fixed` で React レイアウト外に存在するため、子 WebView（Tauri native）の x 座標を手動でオフセットする必要がある。

### 変更箇所: `useColumns.ts`

`calculateBounds` に `sidebarWidth` パラメータを追加する：

```ts
const calculateBounds = (columnIndex, allColumns, containerWidth, containerHeight, scrollLeft, sidebarWidth) => {
  let x = sidebarWidth;  // ← サイドバー幅を加算
  for (let i = 0; i < columnIndex; i++) {
    x += allColumns[i].width;
  }
  return {
    x: x - scrollLeft,
    y: HEADER_HEIGHT,
    width: allColumns[columnIndex].width,
    height: containerHeight - HEADER_HEIGHT - SCROLLBAR_HEIGHT,
  };
};
```

`sidebarWidth` は `useAppStore` に保持し、サイドバー開閉時に更新 → `recalculateAllBounds()` を呼ぶ。

---

## 状態管理

`useAppStore`（Zustand）に以下を追加：

```ts
sidebarExpanded: boolean   // デフォルト false（閉じ）
setSidebarExpanded: (v: boolean) => void
```

`sidebarWidth` は `sidebarExpanded ? 70 : 40` として派生値（useMemo）で計算。

---

## 新規コンポーネント

`src/components/Sidebar/Sidebar.tsx` + `Sidebar.module.scss`

Props:
```ts
interface SidebarProps {
  columns: Column[];
  expanded: boolean;
  onToggleExpand: () => void;
  onAddColumn: () => void;
  onAccountManager: () => void;
  onComposeTweet: () => void;        // Phase 1 はダミー（何もしない）
  onJumpToColumn: (columnId: string) => void;  // Phase 1 はダミー
}
```

---

## scrollbarWidth の修正

`App.tsx` の `scrollbarWidth` 計算からツールバー幅の参照（`toolbarRef`）を削除し、代わりに `sidebarWidth` を先頭に足す：

```ts
const scrollbarWidth = useMemo(() => {
  const columnsWidth = columns.reduce((sum, c) => sum + c.width, 0);
  return columnsWidth + sidebarWidth;  // サイドバー幅を加算
}, [columns, sidebarWidth]);
```

また、現在のヘッダー右端にある `.toolbar`（カラム追加・アカウント管理ボタン）は **サイドバーに移動するため削除**する。

---

## Phase 2（後続）

- ✏ ツイート入力ボタン: `https://x.com/compose/post` をポップアップで開く
- カラムジャンプ: `scrollRef.current.scrollLeft` を操作して対象カラムにスクロール
- デフォルトアカウント設定: `useAppStore` の accounts に `isDefaultForCompose` フィールド追加

---

## 影響ファイル

| ファイル | 変更種別 |
|---------|---------|
| `src/App.tsx` | Sidebar コンポーネント追加、toolbar 削除、padding-left 追加 |
| `src/App.module.scss` | toolbar スタイル削除、padding-left 対応 |
| `src/hooks/useColumns.ts` | calculateBounds に sidebarWidth 追加 |
| `src/store/useAppStore.ts` | sidebarExpanded 状態追加 |
| `src/components/Sidebar/Sidebar.tsx` | 新規作成 |
| `src/components/Sidebar/Sidebar.module.scss` | 新規作成 |
