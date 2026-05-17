# 並び替えボタン表示制御 & モバイル幅設定非表示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** グローバル設定から並び替えボタン(← →)の表示をON/OFFできるようにし、モバイル版ではカラム幅設定を非表示にする。

**Architecture:** `GlobalSettings` に `showSortButtons` フラグを追加し、`App.tsx` から `ColumnHeader` と `MobileTabBar` へ props 経由で渡す。`SettingsPanel` には `isMobile` prop を追加して幅設定セクションを条件付き非表示にする。

**Tech Stack:** React 19, TypeScript, Vitest, @testing-library/react

---

## ファイルマップ

| ファイル                                               | 変更内容                                                                                     |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `src/types/index.ts`                                   | `GlobalSettings` に `showSortButtons: boolean` 追加、デフォルト値設定                        |
| `src/components/ColumnHeader/ColumnHeader.tsx`         | `showSortButtons` prop 追加、← → ボタンを条件付きレンダリング                                |
| `src/components/ColumnHeader/ColumnHeader.test.tsx`    | `defaultProps` に `showSortButtons: true` 追加、新テスト追加                                 |
| `src/components/MobileTabBar/MobileTabBar.tsx`         | `showSortButtons` prop を `Props` と `TabItemProps` に追加、← → ボタンを条件付きレンダリング |
| `src/components/MobileTabBar/MobileTabBar.test.tsx`    | `defaultProps` に `showSortButtons: true` 追加、新テスト追加                                 |
| `src/components/AppSettingsPanel/AppSettingsPanel.tsx` | `showSortButtons` の state と checkbox 追加                                                  |
| `src/components/SettingsPanel/SettingsPanel.tsx`       | `isMobile` prop 追加、幅セクションを条件付き非表示                                           |
| `src/App.tsx`                                          | `ColumnHeader`・`MobileTabBar` に `showSortButtons`、`SettingsPanel` に `isMobile` を渡す    |

---

## Task 1: GlobalSettings 型に showSortButtons を追加

**Files:**

- Modify: `src/types/index.ts`

- [ ] **Step 1: `GlobalSettings` インターフェースに `showSortButtons` を追加する**

`src/types/index.ts` の `GlobalSettings` インターフェースを以下のように変更：

```ts
export interface GlobalSettings {
  theme: "dark" | "light";
  customCSS: string;
  windowBounds: { x: number; y: number; width: number; height: number };
  defaultAccountId?: string;
  defaultAutoReloadEnabled: boolean;
  defaultAutoReloadInterval: number; // 秒
  popupEscCloseEnabled: boolean;
  videoAutoPlayStopEnabled: boolean;
  showSortButtons: boolean;
}
```

- [ ] **Step 2: `DEFAULT_GLOBAL_SETTINGS` にデフォルト値を追加する**

```ts
export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  theme: "dark",
  customCSS: "",
  windowBounds: { x: 0, y: 0, width: 1400, height: 900 },
  defaultAutoReloadEnabled: true,
  defaultAutoReloadInterval: 600,
  popupEscCloseEnabled: true,
  videoAutoPlayStopEnabled: false,
  showSortButtons: true,
};
```

- [ ] **Step 3: 型チェックを実行**

```bash
npx tsc --noEmit
```

TypeScript エラーが出る場合、後続タスクで修正する（現時点では ColumnHeader/MobileTabBar 等がまだ対応していないのでエラーが出ることがある）。

- [ ] **Step 4: コミット**

```bash
git add src/types/index.ts
git commit -m "feat: GlobalSettings に showSortButtons フラグを追加"
```

---

## Task 2: ColumnHeader に showSortButtons prop を追加

**Files:**

- Modify: `src/components/ColumnHeader/ColumnHeader.tsx`
- Modify: `src/components/ColumnHeader/ColumnHeader.test.tsx`

- [ ] **Step 1: 失敗するテストを書く**

`src/components/ColumnHeader/ColumnHeader.test.tsx` を開き、以下の2点を変更する：

**① `defaultProps` に `showSortButtons: true` を追加：**

```ts
const defaultProps = {
  column: mockColumn,
  account: mockAccount,
  onReload: vi.fn(),
  onMoveLeft: vi.fn(),
  onMoveRight: vi.fn(),
  onSettings: vi.fn(),
  onClose: vi.fn(),
  isFirst: false,
  isLast: false,
  showSortButtons: true,
};
```

**② describe ブロックの末尾に新テストを追加：**

```ts
it("showSortButtons=false のとき左右移動ボタンが非表示になる", () => {
  render(<ColumnHeader {...defaultProps} showSortButtons={false} />);
  expect(screen.queryByLabelText("左に移動")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("右に移動")).not.toBeInTheDocument();
});

it("showSortButtons=true のとき左右移動ボタンが表示される", () => {
  render(<ColumnHeader {...defaultProps} showSortButtons={true} />);
  expect(screen.getByLabelText("左に移動")).toBeInTheDocument();
  expect(screen.getByLabelText("右に移動")).toBeInTheDocument();
});
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
npx vitest run src/components/ColumnHeader/ColumnHeader.test.tsx
```

Expected: `showSortButtons=false のとき左右移動ボタンが非表示になる` が FAIL。

- [ ] **Step 3: ColumnHeader コンポーネントを実装する**

`src/components/ColumnHeader/ColumnHeader.tsx` を以下のように変更：

**① `ColumnHeaderProps` に `showSortButtons` を追加：**

```ts
interface ColumnHeaderProps {
  column: Column;
  account: Account;
  onReload: (columnId: string) => void;
  onMoveLeft: (columnId: string) => void;
  onMoveRight: (columnId: string) => void;
  onSettings: (columnId: string) => void;
  onClose: (columnId: string) => void;
  isFirst: boolean;
  isLast: boolean;
  showSortButtons: boolean;
}
```

**② コンポーネントの props に `showSortButtons` を追加：**

```ts
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
  showSortButtons,
}) => {
```

**③ ← → ボタンを `showSortButtons` で条件付きレンダリング：**

`<div className={styles.actions}>` 内の ← → ボタン2つを `{showSortButtons && (...)}` で囲む：

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
  {showSortButtons && (
    <>
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
    </>
  )}
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

- [ ] **Step 4: テストが通ることを確認**

```bash
npx vitest run src/components/ColumnHeader/ColumnHeader.test.tsx
```

Expected: 全テスト PASS。

- [ ] **Step 5: コミット**

```bash
git add src/components/ColumnHeader/ColumnHeader.tsx src/components/ColumnHeader/ColumnHeader.test.tsx
git commit -m "feat: ColumnHeader に showSortButtons prop を追加して移動ボタンを制御"
```

---

## Task 3: MobileTabBar に showSortButtons prop を追加

**Files:**

- Modify: `src/components/MobileTabBar/MobileTabBar.tsx`
- Modify: `src/components/MobileTabBar/MobileTabBar.test.tsx`

- [ ] **Step 1: 失敗するテストを書く**

`src/components/MobileTabBar/MobileTabBar.test.tsx` を開き、以下の2点を変更する：

**① `defaultProps` に `showSortButtons: true` と不足している props を追加：**

```ts
const defaultProps = {
  accounts: [acc1],
  activeColumnId: "col-1",
  onSelectColumn: vi.fn(),
  onOpenSettings: vi.fn(),
  onMoveLeft: vi.fn(),
  onMoveRight: vi.fn(),
  onRemoveColumn: vi.fn(),
  onAddColumn: vi.fn(),
  onAccountManager: vi.fn(),
  onAppSettings: vi.fn(),
  onOpenLinkPopup: vi.fn(),
  showSortButtons: true,
};
```

**② describe ブロックの末尾に新テストを追加：**

```ts
it("showSortButtons=false のとき TabItem の左右移動ボタンが非表示になる", () => {
  render(
    <MobileTabBar
      {...defaultProps}
      columns={[col1]}
      showSortButtons={false}
    />,
  );
  expect(screen.queryByLabelText("左に移動")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("右に移動")).not.toBeInTheDocument();
});

it("showSortButtons=true のとき TabItem の左右移動ボタンが表示される", () => {
  render(
    <MobileTabBar
      {...defaultProps}
      columns={[col1]}
      showSortButtons={true}
    />,
  );
  expect(screen.getByLabelText("左に移動")).toBeInTheDocument();
  expect(screen.getByLabelText("右に移動")).toBeInTheDocument();
});
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
npx vitest run src/components/MobileTabBar/MobileTabBar.test.tsx
```

Expected: `showSortButtons=false のとき` テストが FAIL。

- [ ] **Step 3: MobileTabBar コンポーネントを実装する**

`src/components/MobileTabBar/MobileTabBar.tsx` を以下のように変更：

**① `TabItemProps` に `showSortButtons` を追加：**

```ts
interface TabItemProps {
  column: Column;
  account: Account | undefined;
  isActive: boolean;
  isFirst: boolean;
  isLast: boolean;
  onSelect: () => void;
  onOpenSettings: () => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onRemove: () => void;
  showSortButtons: boolean;
}
```

**② `TabItem` の props に `showSortButtons` を追加して ← → ボタンを条件付きレンダリング：**

```tsx
const TabItem: React.FC<TabItemProps> = ({
  column,
  account,
  isActive,
  isFirst,
  isLast,
  onSelect,
  onOpenSettings,
  onMoveLeft,
  onMoveRight,
  onRemove,
  showSortButtons,
}) => {
  const { remaining } = useAutoReload({
    columnId: column.id,
    enabled: column.settings.autoReloadEnabled,
    intervalSec: column.settings.autoReloadInterval,
  });
  const showCountdown =
    isActive && column.settings.showCountdown && remaining !== null;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={isActive ? "true" : undefined}
      className={`${styles.tab} ${isActive ? styles.active : ""}`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div
        className={styles.accountColor}
        style={{ backgroundColor: account?.color ?? "#888" }}
      />
      <span className={styles.label}>{getTabLabel(column)}</span>
      {showCountdown && <span className={styles.countdown}>{remaining}s</span>}
      {isActive && (
        <>
          {showSortButtons && (
            <>
              <button
                className={styles.tabBtn}
                aria-label="左に移動"
                title="左に移動"
                disabled={isFirst}
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveLeft();
                }}
              >
                ←
              </button>
              <button
                className={styles.tabBtn}
                aria-label="右に移動"
                title="右に移動"
                disabled={isLast}
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveRight();
                }}
              >
                →
              </button>
            </>
          )}
          <button
            className={styles.tabBtn}
            aria-label="設定"
            title="設定"
            onClick={(e) => {
              e.stopPropagation();
              onOpenSettings();
            }}
          >
            ⚙
          </button>
          <button
            className={styles.tabBtn}
            aria-label="削除"
            title="削除"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            ✕
          </button>
        </>
      )}
    </div>
  );
};
```

**③ `Props` インターフェースに `showSortButtons` を追加：**

```ts
interface Props {
  columns: Column[];
  accounts: Account[];
  activeColumnId: string | null;
  onSelectColumn: (id: string) => void;
  onOpenSettings: (id: string) => void;
  onMoveLeft: (id: string) => void;
  onMoveRight: (id: string) => void;
  onRemoveColumn: (id: string) => void;
  onAddColumn: () => void;
  onAccountManager: () => void;
  onAppSettings: () => void;
  onOpenLinkPopup: () => void;
  showSortButtons: boolean;
}
```

**④ `MobileTabBar` の props に `showSortButtons` を追加して `TabItem` へ渡す：**

```tsx
export const MobileTabBar: React.FC<Props> = ({
  columns,
  accounts,
  activeColumnId,
  onSelectColumn,
  onOpenSettings,
  onMoveLeft,
  onMoveRight,
  onRemoveColumn,
  onAddColumn,
  onAccountManager,
  onAppSettings,
  onOpenLinkPopup,
  showSortButtons,
}) => {
  const sorted = [...columns].sort((a, b) => a.order - b.order);
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={styles.tabBar}>
      <div className={styles.tabs}>
        {sorted.map((col, idx) => {
          const account = accounts.find((a) => a.id === col.accountId);
          const isActive = col.id === activeColumnId;
          return (
            <TabItem
              key={col.id}
              column={col}
              account={account}
              isActive={isActive}
              isFirst={idx === 0}
              isLast={idx === sorted.length - 1}
              onSelect={() => onSelectColumn(col.id)}
              onOpenSettings={() => onOpenSettings(col.id)}
              onMoveLeft={() => onMoveLeft(col.id)}
              onMoveRight={() => onMoveRight(col.id)}
              onRemove={() => onRemoveColumn(col.id)}
              showSortButtons={showSortButtons}
            />
          );
        })}
      </div>

      <button
        className={styles.toggleBtn}
        onClick={() => setExpanded((prev) => !prev)}
        title="メニュー表示の切り替え"
      >
        {expanded ? "»" : "«"}
      </button>
      {expanded && (
        <div className={styles.actions}>
          <button
            className={styles.actionBtn}
            aria-label="URLをポップアップで開く"
            title="URLをポップアップで開く"
            onClick={onOpenLinkPopup}
          >
            🔗
          </button>
          <button
            className={styles.actionBtn}
            aria-label="アプリ設定"
            title="アプリ設定"
            onClick={onAppSettings}
          >
            ⚙
          </button>
          <button
            className={styles.actionBtn}
            aria-label="アカウント管理"
            title="アカウント管理"
            onClick={onAccountManager}
          >
            👤
          </button>
          <button
            className={styles.actionBtn}
            aria-label="カラムを追加"
            title="カラムを追加"
            onClick={onAddColumn}
          >
            ＋
          </button>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 4: テストが通ることを確認**

```bash
npx vitest run src/components/MobileTabBar/MobileTabBar.test.tsx
```

Expected: 全テスト PASS。

- [ ] **Step 5: コミット**

```bash
git add src/components/MobileTabBar/MobileTabBar.tsx src/components/MobileTabBar/MobileTabBar.test.tsx
git commit -m "feat: MobileTabBar に showSortButtons prop を追加して移動ボタンを制御"
```

---

## Task 4: AppSettingsPanel に showSortButtons 設定を追加

**Files:**

- Modify: `src/components/AppSettingsPanel/AppSettingsPanel.tsx`

- [ ] **Step 1: state と submit に showSortButtons を追加する**

`src/components/AppSettingsPanel/AppSettingsPanel.tsx` を以下のように変更：

**① `useState` に `showSortButtons` を追加（既存の `videoAutoPlayStopEnabled` の後）：**

```ts
const [showSortButtons, setShowSortButtons] = useState(
  settings.showSortButtons,
);
```

**② `handleSubmit` の `onApply` 呼び出しに `showSortButtons` を追加：**

```ts
const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault();
  onApply({
    defaultAutoReloadEnabled: autoReloadEnabled,
    defaultAutoReloadInterval: autoReloadInterval,
    popupEscCloseEnabled: popupEscCloseEnabled,
    videoAutoPlayStopEnabled: videoAutoPlayStopEnabled,
    showSortButtons: showSortButtons,
  });
  onClose();
};
```

**③ 「カラムのデフォルト設定」セクションの末尾（`<p className={styles.hint}>` の直前）に checkbox を追加：**

```tsx
<label className={styles.checkLabel}>
  <input
    type="checkbox"
    checked={showSortButtons}
    onChange={(e) => setShowSortButtons(e.target.checked)}
  />
  並び替えボタンを表示する
</label>
```

- [ ] **Step 2: 型チェックを実行**

```bash
npx tsc --noEmit
```

Expected: エラーなし（App.tsx はまだ未修正なのでエラーが出る場合は Task 6 完了後に再確認）。

- [ ] **Step 3: コミット**

```bash
git add src/components/AppSettingsPanel/AppSettingsPanel.tsx
git commit -m "feat: アプリ設定パネルに並び替えボタン表示制御を追加"
```

---

## Task 5: SettingsPanel に isMobile prop を追加

**Files:**

- Modify: `src/components/SettingsPanel/SettingsPanel.tsx`

- [ ] **Step 1: `SettingsPanelProps` に `isMobile` を追加してカラム幅セクションを条件付き非表示にする**

`src/components/SettingsPanel/SettingsPanel.tsx` を以下のように変更：

**① `SettingsPanelProps` に `isMobile` を追加：**

```ts
interface SettingsPanelProps {
  column: Column;
  onApply: (columnId: string, settings: ColumnSettings, width: number) => void;
  onClose: () => void;
  isMobile: boolean;
}
```

**② コンポーネントの props に `isMobile` を追加：**

```ts
export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  column,
  onApply,
  onClose,
  isMobile,
}) => {
```

**③ 「カラム」セクションを `!isMobile` のときのみ表示：**

```tsx
{
  !isMobile && (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>カラム</h3>
      <label className={styles.fieldLabel}>
        幅（px）
        <input
          type="number"
          className={styles.numberInput}
          min={200}
          max={1200}
          value={width}
          onChange={(e) => setWidth(Number(e.target.value))}
        />
      </label>
    </section>
  );
}
```

- [ ] **Step 2: コミット**

```bash
git add src/components/SettingsPanel/SettingsPanel.tsx
git commit -m "feat: SettingsPanel にisMobile prop を追加してモバイル時に幅設定を非表示"
```

---

## Task 6: App.tsx で props を配線する

**Files:**

- Modify: `src/App.tsx`

- [ ] **Step 1: ColumnHeader に showSortButtons を渡す**

`src/App.tsx` の `<ColumnHeader ... />` に `showSortButtons` を追加：

```tsx
<ColumnHeader
  column={column}
  account={account}
  onReload={handleReload}
  onMoveLeft={(id) => handleMoveColumn(id, "left")}
  onMoveRight={(id) => handleMoveColumn(id, "right")}
  onSettings={setSettingsColumnId}
  onClose={handleRemoveColumn}
  isFirst={idx === 0}
  isLast={idx === sortedColumns.length - 1}
  showSortButtons={globalSettings.showSortButtons}
/>
```

- [ ] **Step 2: MobileTabBar に showSortButtons を渡す**

`src/App.tsx` の `<MobileTabBar ... />` に `showSortButtons` を追加：

```tsx
<MobileTabBar
  columns={columns}
  accounts={accounts}
  activeColumnId={activeColumnId}
  onSelectColumn={setActiveColumn}
  onOpenSettings={setSettingsColumnId}
  onMoveLeft={(id) => handleMoveColumn(id, "left")}
  onMoveRight={(id) => handleMoveColumn(id, "right")}
  onRemoveColumn={handleRemoveColumn}
  onAddColumn={() => setShowAddColumn(true)}
  onAccountManager={() => setShowAccountManager(true)}
  onAppSettings={() => setShowAppSettings(true)}
  onOpenLinkPopup={handleOpenLinkPopup}
  showSortButtons={globalSettings.showSortButtons}
/>
```

- [ ] **Step 3: SettingsPanel に isMobile を渡す**

`src/App.tsx` の `<SettingsPanel ... />` に `isMobile` を追加：

```tsx
<SettingsPanel
  column={col}
  onApply={handleApplySettings}
  onClose={() => setSettingsColumnId(null)}
  isMobile={isMobile}
/>
```

- [ ] **Step 4: 型チェックと全テストを実行**

```bash
npx tsc --noEmit && npm run test
```

Expected: 型エラーなし、全テスト PASS。

- [ ] **Step 5: コミット**

```bash
git add src/App.tsx
git commit -m "feat: App.tsx で showSortButtons と isMobile を各コンポーネントに配線"
```
