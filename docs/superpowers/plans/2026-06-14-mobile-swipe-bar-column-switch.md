# モバイル専用フリック帯によるカラム切替 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** タブバー直上に専用の横フリック帯 `MobileSwipeBar` を新設し、片手・最小の指移動で前後カラムを切り替えられるようにする（タブの横スクロール・コンテンツ操作と構造的に非衝突）。

**Architecture:** 帯はメイン React UI 層の独立要素として描画し、その高さぶん column WebView を縮めて露出させる（JS の bounds 変更のみ、ネイティブ変更なし）。フリック検出は `MobileSwipeBar` 内、隣カラム算出は既存 `useMobileColumns.navigateColumn` を共有。帯の有効/無効と高さはグローバル設定に追加（TS型・Rust・契約fixtureの3点同期）。column WebView の bounds 算出は新設の純粋関数 `mobileColumnBounds` に一元化する。

**Tech Stack:** React 19 + TypeScript, Vitest, Zustand (`useAppStore`), Tauri v2 (Rust `settings.rs`), SCSS modules。

---

## 現状の前提（着手前に把握すること）

先行コミット（`d94a92f`）で以下が既に入っている。本計画はこれを土台に進める。

- `useMobileColumns` に `navigateColumn(direction)` を切り出し済み（order ソート→隣 index→範囲外無視→`swipeState` 一時表示→`setActiveColumn`）。`dialogOpenRef` ガードも内包。`useColumns` 経由で `App.tsx` まで公開済み。
- `MobileTabBar` にルート要素への横フリック検出（`onTouchStart`/`onTouchEnd`/`onTouchCancel`）と `onSwipeNavigate` prop が**追加されている**。`MobileTabBar.test.tsx` に「タブバーの横フリックでカラム切替」describe ブロックがある。→ Task 6 でこれらを撤去する。

mobile の column WebView bounds の現状（重要）:

- 高さは全箇所 `window.innerHeight - MOBILE_TAB_BAR_HEIGHT`（`MOBILE_TAB_BAR_HEIGHT = 56`、`src/lib/gridLayout.ts:7`）。
- `y` は作成時（`useColumns.ts:111`, `useColumns.ts:156`, `useMobileColumns.ts` の `restoreMobileColumns` 内 `createColumnWebview`）が `0`。
- 一方 `setActiveColumn`（`useMobileColumns.ts:53-63`）と `restoreMobileColumns` のアクティブ resize（`useMobileColumns.ts:112-117`）はアクティブを `y: MOBILE_TAB_BAR_HEIGHT` にしている。これは作成時 `y:0` と不整合で、アプリは `y:0` で起動・表示できている（作成→表示が `y:0`）。**正しいのは `y:0`** なので、Task 4 で全箇所を `mobileColumnBounds`（`y:0`）に統一する。

## ファイル構成

- `src/types/index.ts` — `GlobalSettings` に2フィールド追加、`DEFAULT_GLOBAL_SETTINGS` 更新（Task 1）。
- `contracts/default-settings.json` — fixture に2フィールド追加（Task 1）。
- `src-tauri/src/commands/settings.rs` — `GlobalSettingsData` に2フィールド + Default + serde rename + テスト（Task 2）。
- `src/lib/gridLayout.ts` — 純粋関数 `mobileColumnBounds` と `resolveSwipeAreaHeight` を追加（Task 3）。
- `src/lib/gridLayout.test.ts` — 上記のユニットテスト（Task 3）。
- `src/hooks/useMobileColumns.ts` / `src/hooks/useColumns.ts` — column WebView bounds 算出を `mobileColumnBounds` に統一（Task 4）。
- `src/components/MobileSwipeBar/MobileSwipeBar.tsx` + `.module.scss` + `.test.tsx` — 新規フリック帯（Task 5）。
- `src/components/MobileTabBar/MobileTabBar.tsx` / `.test.tsx` — フリック検出撤去（Task 6）。
- `src/App.tsx` — `MobileSwipeBar` 描画と配線、`MobileTabBar` の `onSwipeNavigate` 撤去（Task 7）。
- `src/App.test.tsx` — 無効時に帯が描画されないテスト（Task 7）。
- `src/components/AppSettingsPanel/AppSettingsPanel.tsx` / `.test.tsx` — トグル＋高さ入力（Task 8）。

---

## Task 1: GlobalSettings に2フィールドを追加（TS 側 + 契約 fixture）

**Files:**

- Modify: `src/types/index.ts:55-71`（interface）, `src/types/index.ts:138-161`（default）
- Modify: `contracts/default-settings.json`
- Test: `src/types/defaults.contract.test.ts`（既存。再実行で検証）

- [ ] **Step 1: interface にフィールド追加**

`src/types/index.ts` の `GlobalSettings` interface（`ngWords: string[];` の直前）に追加:

```ts
  mobileSwipeAreaEnabled: boolean;
  mobileSwipeAreaHeight: number;
  presets: ColumnPreset[];
  ngWords: string[];
}
```

（`presets` / `ngWords` は既存。新規2行をその上に挿入する位置の目印として記載。）

- [ ] **Step 2: DEFAULT_GLOBAL_SETTINGS に既定値追加**

`src/types/index.ts` の `DEFAULT_GLOBAL_SETTINGS` で `useXAppForCompose: false,` の直後に追加:

```ts
  useXAppForCompose: false,
  mobileSwipeAreaEnabled: true,
  mobileSwipeAreaHeight: 28,
  presets: [],
```

- [ ] **Step 3: 契約 fixture に追加**

`contracts/default-settings.json` の `"useXAppForCompose": false,` の直後に追加:

```json
    "useXAppForCompose": false,
    "mobileSwipeAreaEnabled": true,
    "mobileSwipeAreaHeight": 28,
    "presets": [],
```

- [ ] **Step 4: TS 契約テストを実行して通ることを確認**

Run: `npx vitest run src/types/defaults.contract.test.ts`
Expected: PASS（`DEFAULT_GLOBAL_SETTINGS` と fixture が一致）。

- [ ] **Step 5: コミット**

```bash
git add src/types/index.ts contracts/default-settings.json
git commit -m "feat: GlobalSettingsにmobileSwipeArea設定を追加(TS/fixture)"
```

---

## Task 2: Rust 側 GlobalSettingsData に2フィールドを追加

**Files:**

- Modify: `src-tauri/src/commands/settings.rs`（struct, `impl Default`, `default_*` ヘルパー, テスト）

- [ ] **Step 1: struct にフィールド追加**

`src-tauri/src/commands/settings.rs` の `GlobalSettingsData` struct 内（`use_x_app_for_compose` 相当のフィールド付近、`presets` の前など任意の位置）に追加:

```rust
    #[serde(rename = "mobileSwipeAreaEnabled")]
    #[serde(default = "default_true")]
    pub mobile_swipe_area_enabled: bool,
    #[serde(rename = "mobileSwipeAreaHeight")]
    #[serde(default = "default_mobile_swipe_area_height")]
    pub mobile_swipe_area_height: u32,
```

- [ ] **Step 2: default ヘルパー関数を追加**

既存の `default_true` 付近に追加:

```rust
fn default_mobile_swipe_area_height() -> u32 {
    28
}
```

- [ ] **Step 3: impl Default に追加**

`impl Default for GlobalSettingsData` の `Self { ... }` 内に追加:

```rust
            mobile_swipe_area_enabled: true,
            mobile_swipe_area_height: 28,
```

- [ ] **Step 4: 単体テストを追加**

既存テスト（`global_settings_default_popup_esc_close_enabled` の近く）に追加:

```rust
    #[test]
    fn global_settings_default_mobile_swipe_area() {
        let gs = GlobalSettingsData::default();
        assert!(gs.mobile_swipe_area_enabled);
        assert_eq!(gs.mobile_swipe_area_height, 28);
    }
```

- [ ] **Step 5: Rust テストを実行して通ることを確認**

Run: `cd src-tauri && cargo test --lib settings`
Expected: PASS。特に `default_settings_match_contract_fixture`（fixture との一致）と新規 `global_settings_default_mobile_swipe_area` が通ること。

- [ ] **Step 6: コミット**

```bash
git add src-tauri/src/commands/settings.rs
git commit -m "feat: GlobalSettingsDataにmobileSwipeArea設定を追加(Rust)"
```

---

## Task 3: 純粋関数 `mobileColumnBounds` / `resolveSwipeAreaHeight` を追加

**Files:**

- Modify: `src/lib/gridLayout.ts`
- Test: `src/lib/gridLayout.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/gridLayout.test.ts` に追加（ファイル先頭の import に `mobileColumnBounds, resolveSwipeAreaHeight` を追加する）:

```ts
import { mobileColumnBounds, resolveSwipeAreaHeight } from "./gridLayout";

describe("resolveSwipeAreaHeight", () => {
  it("有効なら設定値の高さを返す", () => {
    expect(
      resolveSwipeAreaHeight({
        mobileSwipeAreaEnabled: true,
        mobileSwipeAreaHeight: 28,
      }),
    ).toBe(28);
  });

  it("無効なら0を返す", () => {
    expect(
      resolveSwipeAreaHeight({
        mobileSwipeAreaEnabled: false,
        mobileSwipeAreaHeight: 28,
      }),
    ).toBe(0);
  });
});

describe("mobileColumnBounds", () => {
  it("アクティブはx=0,y=0で高さからタブバーと帯を引く", () => {
    expect(
      mobileColumnBounds({
        isActive: true,
        swipeAreaHeight: 28,
        viewportWidth: 400,
        viewportHeight: 800,
      }),
    ).toEqual({ x: 0, y: 0, width: 400, height: 800 - 56 - 28 });
  });

  it("非アクティブはxが画面外", () => {
    const b = mobileColumnBounds({
      isActive: false,
      swipeAreaHeight: 0,
      viewportWidth: 400,
      viewportHeight: 800,
    });
    expect(b.x).toBeLessThan(0);
    expect(b.y).toBe(0);
    expect(b.height).toBe(800 - 56);
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npx vitest run src/lib/gridLayout.test.ts`
Expected: FAIL（`mobileColumnBounds is not a function` 等）。

- [ ] **Step 3: 実装する**

`src/lib/gridLayout.ts` に追加（ファイル末尾、`OFFSCREEN` を `../constants/ipc` から import する。既存 import 形式に合わせること）:

```ts
import { OFFSCREEN } from "../constants/ipc";

interface SwipeAreaSettings {
  mobileSwipeAreaEnabled: boolean;
  mobileSwipeAreaHeight: number;
}

/** スワイプ帯が有効なら高さ、無効なら0を返す。 */
export function resolveSwipeAreaHeight(s: SwipeAreaSettings): number {
  return s.mobileSwipeAreaEnabled ? s.mobileSwipeAreaHeight : 0;
}

interface MobileColumnBoundsInput {
  isActive: boolean;
  swipeAreaHeight: number;
  viewportWidth: number;
  viewportHeight: number;
}

/**
 * モバイル column WebView の配置を算出する純粋関数。
 * 下部に タブバー(56px) + スワイプ帯(swipeAreaHeight) を確保し、
 * 非アクティブは画面外(x=OFFSCREEN.MOBILE_X)へ退避する。
 */
export function mobileColumnBounds(input: MobileColumnBoundsInput): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const reservedBottom = MOBILE_TAB_BAR_HEIGHT + input.swipeAreaHeight;
  return {
    x: input.isActive ? 0 : OFFSCREEN.MOBILE_X,
    y: 0,
    width: input.viewportWidth,
    height: input.viewportHeight - reservedBottom,
  };
}
```

- [ ] **Step 4: テストを実行して通ることを確認**

Run: `npx vitest run src/lib/gridLayout.test.ts`
Expected: PASS。

- [ ] **Step 5: コミット**

```bash
git add src/lib/gridLayout.ts src/lib/gridLayout.test.ts
git commit -m "feat: モバイルcolumn WebView配置の純粋関数mobileColumnBoundsを追加"
```

---

## Task 4: column WebView bounds 算出を `mobileColumnBounds` に統一（帯の高さを確保）

**Files:**

- Modify: `src/hooks/useMobileColumns.ts:53-63`（setActiveColumn）, `src/hooks/useMobileColumns.ts` の `restoreMobileColumns`（createColumnWebview と active resize）
- Modify: `src/hooks/useColumns.ts:108-114`（handleAddColumn）, `src/hooks/useColumns.ts:150-159`（hideColumnWebviews 等の mobile 分岐）

> この Task はロジック統一のため、既存のフックテスト（`src/hooks/useColumns.test.ts`）がグリーンであることを各ステップ後に確認する。新規ユニットテストは Task 3 でカバー済み。

- [ ] **Step 1: useMobileColumns で import 追加**

`src/hooks/useMobileColumns.ts` の import に追加:

```ts
import {
  MOBILE_TAB_BAR_HEIGHT,
  mobileColumnBounds,
  resolveSwipeAreaHeight,
} from "../lib/gridLayout";
```

（`MOBILE_TAB_BAR_HEIGHT` は既存 import。1行にまとめる。`OFFSCREEN` の直接利用が無くなる場合は未使用 import を削除する。）

- [ ] **Step 2: setActiveColumn の resize を置換**

`src/hooks/useMobileColumns.ts` の `setActiveColumn` 内、`const { columns: currentColumns, isMobile } = useAppStore.getState();` を `globalSettings` も取得するよう変更:

```ts
const {
  columns: currentColumns,
  isMobile,
  globalSettings,
} = useAppStore.getState();
const swipeAreaHeight = resolveSwipeAreaHeight(globalSettings);
```

`Promise.all(currentColumns.map(...))` のボディを置換:

```ts
await Promise.all(
  currentColumns.map((col) => {
    const bounds = mobileColumnBounds({
      isActive: col.id === id,
      swipeAreaHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });
    return resizeColumnWebview(col.id, bounds).catch(
      logError("setActiveColumn:resizeColumnWebview"),
    );
  }),
);
```

- [ ] **Step 3: restoreMobileColumns を置換**

`restoreMobileColumns` 内で `globalSettings` を取得（`useAppStore.getState()` か、引数追加ではなく内部取得でよい）し、`createColumnWebview` の bounds と active の `resizeColumnWebview` bounds を `mobileColumnBounds` に置換する。

createColumnWebview 部分:

```ts
const { globalSettings } = useAppStore.getState();
const swipeAreaHeight = resolveSwipeAreaHeight(globalSettings);
await Promise.all(
  sortedByOrder.map(async (column) => {
    const account = currentAccounts.find((a) => a.id === column.accountId);
    if (!account) return;
    const isActive = column.id === targetColumn?.id;
    await createColumnWebview(
      column,
      account.dataDirectory,
      mobileColumnBounds({
        isActive,
        swipeAreaHeight,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      }),
    ).catch(logError("restoreMobileColumns:createColumnWebview"));
  }),
);
```

active resize 部分（`if (targetColumn) { ... resizeColumnWebview(targetColumn.id, {...}) }`）:

```ts
await resizeColumnWebview(
  targetColumn.id,
  mobileColumnBounds({
    isActive: true,
    swipeAreaHeight,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  }),
).catch(logError("restoreMobileColumns:resizeColumnWebview"));
```

（注: createColumnWebview は非アクティブ列を `x: OFFSCREEN.MOBILE_X` で作る。`mobileColumnBounds` が同じ値を返すため挙動は不変。アクティブ列の `y` は従来 resize の `56` から `0` に統一される＝作成時と一致する正しい値。）

- [ ] **Step 4: useColumns の mobile 分岐を置換**

`src/hooks/useColumns.ts` の import に `mobileColumnBounds, resolveSwipeAreaHeight` を追加。`handleAddColumn` の mobile createColumnWebview（`useColumns.ts:108-114`）:

```ts
      if (isMobile) {
        const swipeAreaHeight = resolveSwipeAreaHeight(
          useAppStore.getState().globalSettings,
        );
        await createColumnWebview(
          column,
          account.dataDirectory,
          mobileColumnBounds({
            isActive: false,
            swipeAreaHeight,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
          }),
        ).catch(logError("handleAddColumn:createColumnWebview(mobile)"));
```

`hideColumnWebviews` 等の mobile 分岐（`useColumns.ts:150-159`、`isMobile ? {x:OFFSCREEN.MOBILE_X, y:0, ...} : {...}` の三項）について、mobile 側を:

```ts
isMobile
  ? mobileColumnBounds({
      isActive: false,
      swipeAreaHeight: resolveSwipeAreaHeight(
        useAppStore.getState().globalSettings,
      ),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    })
  : {
      x: OFFSCREEN.DESKTOP_X,
      /* 既存のデスクトップ分岐はそのまま */
    };
```

（デスクトップ分岐は一切変更しない。`useAppStore` の import が無ければ追加する。）

- [ ] **Step 5: 既存テスト・型チェックを実行**

Run: `npx vitest run src/hooks/useColumns.test.ts && npx tsc --noEmit`
Expected: PASS / エラーなし。

- [ ] **Step 6: コミット**

```bash
git add src/hooks/useMobileColumns.ts src/hooks/useColumns.ts
git commit -m "refactor: モバイルcolumn WebView配置をmobileColumnBoundsに統一しスワイプ帯領域を確保"
```

---

## Task 5: `MobileSwipeBar` コンポーネントを新規作成

**Files:**

- Create: `src/components/MobileSwipeBar/MobileSwipeBar.tsx`
- Create: `src/components/MobileSwipeBar/MobileSwipeBar.module.scss`
- Test: `src/components/MobileSwipeBar/MobileSwipeBar.test.tsx`

- [ ] **Step 1: 失敗するテストを書く**

`src/components/MobileSwipeBar/MobileSwipeBar.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { MobileSwipeBar } from "./MobileSwipeBar";

describe("MobileSwipeBar", () => {
  it("左へフリックすると onSwipeNavigate が left で呼ばれる", () => {
    const onSwipeNavigate = vi.fn();
    const { container } = render(
      <MobileSwipeBar height={28} onSwipeNavigate={onSwipeNavigate} />,
    );
    const bar = container.firstChild as HTMLElement;
    fireEvent.touchStart(bar, { touches: [{ clientX: 200, clientY: 10 }] });
    fireEvent.touchEnd(bar, {
      changedTouches: [{ clientX: 100, clientY: 12 }],
    });
    expect(onSwipeNavigate).toHaveBeenCalledWith("left");
  });

  it("右へフリックすると onSwipeNavigate が right で呼ばれる", () => {
    const onSwipeNavigate = vi.fn();
    const { container } = render(
      <MobileSwipeBar height={28} onSwipeNavigate={onSwipeNavigate} />,
    );
    const bar = container.firstChild as HTMLElement;
    fireEvent.touchStart(bar, { touches: [{ clientX: 100, clientY: 10 }] });
    fireEvent.touchEnd(bar, {
      changedTouches: [{ clientX: 220, clientY: 12 }],
    });
    expect(onSwipeNavigate).toHaveBeenCalledWith("right");
  });

  it("移動量がしきい値未満のタッチはフリックと判定されない", () => {
    const onSwipeNavigate = vi.fn();
    const { container } = render(
      <MobileSwipeBar height={28} onSwipeNavigate={onSwipeNavigate} />,
    );
    const bar = container.firstChild as HTMLElement;
    fireEvent.touchStart(bar, { touches: [{ clientX: 100, clientY: 10 }] });
    fireEvent.touchEnd(bar, {
      changedTouches: [{ clientX: 110, clientY: 12 }],
    });
    expect(onSwipeNavigate).not.toHaveBeenCalled();
  });

  it("縦方向の移動が横より大きい場合はフリックと判定されない", () => {
    const onSwipeNavigate = vi.fn();
    const { container } = render(
      <MobileSwipeBar height={28} onSwipeNavigate={onSwipeNavigate} />,
    );
    const bar = container.firstChild as HTMLElement;
    fireEvent.touchStart(bar, { touches: [{ clientX: 100, clientY: 10 }] });
    fireEvent.touchEnd(bar, {
      changedTouches: [{ clientX: 160, clientY: 160 }],
    });
    expect(onSwipeNavigate).not.toHaveBeenCalled();
  });

  it("規定時間を超えたゆっくりした移動はフリックと判定されない", () => {
    vi.useFakeTimers();
    try {
      const onSwipeNavigate = vi.fn();
      const { container } = render(
        <MobileSwipeBar height={28} onSwipeNavigate={onSwipeNavigate} />,
      );
      const bar = container.firstChild as HTMLElement;
      fireEvent.touchStart(bar, { touches: [{ clientX: 200, clientY: 10 }] });
      vi.advanceTimersByTime(800);
      fireEvent.touchEnd(bar, {
        changedTouches: [{ clientX: 100, clientY: 12 }],
      });
      expect(onSwipeNavigate).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("onSwipeNavigate 未指定でもフリックでエラーにならない", () => {
    const { container } = render(<MobileSwipeBar height={28} />);
    const bar = container.firstChild as HTMLElement;
    expect(() => {
      fireEvent.touchStart(bar, { touches: [{ clientX: 200, clientY: 10 }] });
      fireEvent.touchEnd(bar, {
        changedTouches: [{ clientX: 100, clientY: 12 }],
      });
    }).not.toThrow();
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npx vitest run src/components/MobileSwipeBar/MobileSwipeBar.test.tsx`
Expected: FAIL（`Cannot find module './MobileSwipeBar'`）。

- [ ] **Step 3: SCSS を作成**

`src/components/MobileSwipeBar/MobileSwipeBar.module.scss`:

```scss
@keyframes swipeBarFlash {
  0% {
    background: rgba(255, 255, 255, 0.18);
  }
  100% {
    background: rgba(255, 255, 255, 0.06);
  }
}

.swipeBar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 56px; // MOBILE_TAB_BAR_HEIGHT
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: rgba(255, 255, 255, 0.06);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.45);
  font-size: 13px;
  user-select: none;
  -webkit-touch-callout: none;
  touch-action: none;
  z-index: 100;
}

.switching {
  animation: swipeBarFlash 0.4s ease-out forwards;
}

.grip {
  letter-spacing: 2px;
}

.hint {
  font-weight: bold;
  opacity: 0.7;
}
```

- [ ] **Step 4: コンポーネントを実装**

`src/components/MobileSwipeBar/MobileSwipeBar.tsx`:

```tsx
import React, { useRef } from "react";
import styles from "./MobileSwipeBar.module.scss";

const MIN_FLICK_PX = 40;
const MAX_FLICK_MS = 600;

interface Props {
  height: number;
  swipeState?: {
    direction: "left" | "right";
    phase: "progress" | "switching";
  } | null;
  onSwipeNavigate?: (direction: "left" | "right") => void;
}

export const MobileSwipeBar: React.FC<Props> = ({
  height,
  swipeState,
  onSwipeNavigate,
}) => {
  const flickStart = useRef<{ x: number; y: number; time: number } | null>(
    null,
  );

  const handleStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    flickStart.current = { x: t.clientX, y: t.clientY, time: Date.now() };
  };

  const handleEnd = (e: React.TouchEvent) => {
    const start = flickStart.current;
    flickStart.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    if (!t) return;
    if (Date.now() - start.time > MAX_FLICK_MS) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < MIN_FLICK_PX || Math.abs(dx) <= Math.abs(dy)) return;
    onSwipeNavigate?.(dx < 0 ? "left" : "right");
  };

  const cancel = () => {
    flickStart.current = null;
  };

  const className = [
    styles.swipeBar,
    swipeState?.phase === "switching" ? styles.switching : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={className}
      style={{ height }}
      onTouchStart={handleStart}
      onTouchEnd={handleEnd}
      onTouchCancel={cancel}
    >
      <span className={styles.hint}>‹</span>
      <span className={styles.grip}>⠿ スワイプで切替 ⠿</span>
      <span className={styles.hint}>›</span>
    </div>
  );
};
```

- [ ] **Step 5: テストを実行して通ることを確認**

Run: `npx vitest run src/components/MobileSwipeBar/MobileSwipeBar.test.tsx`
Expected: PASS（6件）。

- [ ] **Step 6: コミット**

```bash
git add src/components/MobileSwipeBar
git commit -m "feat: 横フリック専用帯MobileSwipeBarを追加"
```

---

## Task 6: `MobileTabBar` から横フリック検出を撤去

**Files:**

- Modify: `src/components/MobileTabBar/MobileTabBar.tsx`
- Modify: `src/components/MobileTabBar/MobileTabBar.test.tsx`

- [ ] **Step 1: テストから「タブバーの横フリックでカラム切替」describe を削除**

`src/components/MobileTabBar/MobileTabBar.test.tsx` の `describe("タブバーの横フリックでカラム切替", () => { ... });` ブロック全体（先行コミットで追加した約106行）を削除する。

- [ ] **Step 2: コンポーネントからフリック関連を削除**

`src/components/MobileTabBar/MobileTabBar.tsx` で以下を削除:

- 先頭の定数 `const MIN_FLICK_PX = 40;` と `const MAX_FLICK_MS = 600;`
- Props interface の `onSwipeNavigate?: (direction: "left" | "right") => void;`
- 関数引数の `onSwipeNavigate,`
- `flickStart` ref、`handleFlickStart` / `handleFlickEnd` / `cancelFlick` 関数定義
- ルート `<div className={styles.tabBar} ...>` の `onTouchStart` / `onTouchEnd` / `onTouchCancel` 属性（`className={styles.tabBar}` のみ残す）

結果、ルート要素は元の `<div className={styles.tabBar}>` に戻り、`TabItem` 側のタップ/長押しハンドラはそのまま維持される。

- [ ] **Step 3: テストと型チェックを実行**

Run: `npx vitest run src/components/MobileTabBar/MobileTabBar.test.tsx && npx tsc --noEmit`
Expected: PASS / エラーなし（残るタップ・長押し・アイコンのテストが通る）。

- [ ] **Step 4: コミット**

```bash
git add src/components/MobileTabBar
git commit -m "refactor: MobileTabBarの横フリック検出を撤去(専用帯へ移行)"
```

---

## Task 7: `App.tsx` で `MobileSwipeBar` を描画・配線

**Files:**

- Modify: `src/App.tsx`（import 追加、`MobileTabBar` の `onSwipeNavigate` 撤去、`MobileSwipeBar` 描画）
- Test: `src/App.test.tsx`

- [ ] **Step 1: 失敗するテストを書く（有効時に描画される＝真の赤）**

`src/App.test.tsx` に追加（既存のレンダリングテストの近く。store の組み立て方は既存テストの書式に合わせる）。有効時に描画されるテストが**未実装では必ず FAIL する**のでこれを赤の主軸にする。無効時テストも併記する:

```tsx
it("mobileSwipeAreaEnabledがtrueのときスワイプ帯が描画される", () => {
  useAppStore.setState({
    isMobile: true,
    isLoaded: true,
    globalSettings: {
      ...DEFAULT_GLOBAL_SETTINGS,
      mobileSwipeAreaEnabled: true,
    },
  });
  const { queryByText } = render(<App />);
  expect(queryByText(/スワイプで切替/)).not.toBeNull();
});

it("mobileSwipeAreaEnabledがfalseのときスワイプ帯が描画されない", () => {
  useAppStore.setState({
    isMobile: true,
    isLoaded: true,
    globalSettings: {
      ...DEFAULT_GLOBAL_SETTINGS,
      mobileSwipeAreaEnabled: false,
    },
  });
  const { queryByText } = render(<App />);
  expect(queryByText(/スワイプで切替/)).toBeNull();
});
```

> 注: `App.test.tsx` 既存の import / setup（`useAppStore`, `DEFAULT_GLOBAL_SETTINGS`, モック類）を確認し、不足する import を追加すること。Tauri API はテストで既存どおりモックされている前提。

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npx vitest run src/App.test.tsx -t "スワイプ帯"`
Expected: 「描画される」が FAIL（`MobileSwipeBar` 未配線のため）。「描画されない」は PASS（帯がまだ存在しないため）。

- [ ] **Step 3: App.tsx に描画を追加**

import 追加:

```tsx
import { MobileSwipeBar } from "./components/MobileSwipeBar/MobileSwipeBar";
import { resolveSwipeAreaHeight } from "./lib/gridLayout";
```

`MobileTabBar` の JSX から `onSwipeNavigate={navigateColumn}` の行を削除する（Task 6 で prop を消したため）。

`{isMobile && ( <MobileTabBar ... /> )}` ブロックの**直後**に、以下の JSX 式を追加する（前後の `{isMobile && (...)}` と同じ形式の JSX 式。文ではない）:

```tsx
{
  isMobile && globalSettings.mobileSwipeAreaEnabled && (
    <MobileSwipeBar
      height={resolveSwipeAreaHeight(globalSettings)}
      swipeState={swipeState}
      onSwipeNavigate={navigateColumn}
    />
  );
}
```

- [ ] **Step 4: テストと型チェックを実行**

Run: `npx vitest run src/App.test.tsx && npx tsc --noEmit`
Expected: 「スワイプ帯」両テストが PASS / 型エラーなし。

- [ ] **Step 5: コミット**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat: App.tsxでMobileSwipeBarを設定連動で描画・navigateColumnに配線"
```

---

## Task 8: `AppSettingsPanel` にトグルと高さ入力を追加

**Files:**

- Modify: `src/components/AppSettingsPanel/AppSettingsPanel.tsx`
- Test: `src/components/AppSettingsPanel/AppSettingsPanel.test.tsx`

- [ ] **Step 1: 失敗するテストを書く**

`src/components/AppSettingsPanel/AppSettingsPanel.test.tsx` に追加（既存テストの render ヘルパー／props 組み立てに合わせる。`onApply` のモックを使用）:

```tsx
it("スワイプ領域の有効トグルを切り替えるとonApplyに反映される", () => {
  const onApply = vi.fn();
  renderPanel({ onApply }); // 既存のレンダリングヘルパーに合わせる
  fireEvent.click(screen.getByLabelText("スワイプでカラム切替を有効化"));
  fireEvent.click(screen.getByRole("button", { name: "適用" })); // 既存の適用ボタン名に合わせる
  expect(onApply).toHaveBeenCalledWith(
    expect.objectContaining({ mobileSwipeAreaEnabled: false }),
  );
});

it("スワイプ領域の高さは16〜56にクランプされる", () => {
  const onApply = vi.fn();
  renderPanel({ onApply });
  fireEvent.change(screen.getByLabelText("スワイプ領域の高さ(px)"), {
    target: { value: "999" },
  });
  fireEvent.click(screen.getByRole("button", { name: "適用" }));
  expect(onApply).toHaveBeenCalledWith(
    expect.objectContaining({ mobileSwipeAreaHeight: 56 }),
  );
});
```

> 注: 既存テストの実際のレンダリング方法（直接 `render(<AppSettingsPanel .../>)` か独自ヘルパーか）、適用ボタンのラベル、`settings` の既定値の渡し方を確認し、それに合わせて書くこと。デフォルト `mobileSwipeAreaEnabled: true` から click で false になる前提。

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npx vitest run src/components/AppSettingsPanel/AppSettingsPanel.test.tsx -t "スワイプ"`
Expected: FAIL（ラベルが見つからない）。

- [ ] **Step 3: state を追加**

`AppSettingsPanel.tsx` のグローバル設定 state 群（`videoAutoPlayStopEnabled` 付近）に追加:

```tsx
const [mobileSwipeAreaEnabled, setMobileSwipeAreaEnabled] = useState(
  settings.mobileSwipeAreaEnabled,
);
const [mobileSwipeAreaHeight, setMobileSwipeAreaHeight] = useState(
  settings.mobileSwipeAreaHeight,
);
```

- [ ] **Step 4: onApply に含める**

`onApply({ ... })` のオブジェクトに追加:

```tsx
      mobileSwipeAreaEnabled,
      mobileSwipeAreaHeight,
```

- [ ] **Step 5: UI を追加**

general タブの適切なセクション（例: 既存の「動画」セクションの近く、`isMobile` のときのみ表示）に追加:

```tsx
<section className={styles.section}>
  <h3 className={styles.sectionTitle}>モバイル: スワイプ切替</h3>
  <label className={styles.checkLabel}>
    <input
      type="checkbox"
      aria-label="スワイプでカラム切替を有効化"
      checked={mobileSwipeAreaEnabled}
      onChange={(e) => setMobileSwipeAreaEnabled(e.target.checked)}
    />
    スワイプでカラム切替を有効化
  </label>
  <label className={styles.inputLabel}>
    スワイプ領域の高さ(px)
    <input
      type="number"
      aria-label="スワイプ領域の高さ(px)"
      min={16}
      max={56}
      value={mobileSwipeAreaHeight}
      onChange={(e) =>
        setMobileSwipeAreaHeight(
          Math.min(56, Math.max(16, Number(e.target.value) || 16)),
        )
      }
    />
  </label>
</section>
```

> 注: クラス名（`styles.section` / `styles.checkLabel` / `styles.inputLabel`）は既存のものに合わせる。存在しない場合は近いセクションの既存クラスを流用する。`isMobile` ガードで囲む場合は既存の `isMobile` 変数を使う（デスクトップでは非表示でよいが、テストは isMobile に依存しないよう `renderPanel` の store 設定で isMobile=true にするか、ガード無しで常時表示でも可。実装時に既存テストと整合する方を選ぶ）。

- [ ] **Step 6: テストと型チェックを実行**

Run: `npx vitest run src/components/AppSettingsPanel/AppSettingsPanel.test.tsx && npx tsc --noEmit`
Expected: PASS / エラーなし。

- [ ] **Step 7: コミット**

```bash
git add src/components/AppSettingsPanel
git commit -m "feat: アプリ設定にスワイプ切替の有効/無効と高さを追加"
```

---

## Task 9: 全体検証と最終確認

**Files:** なし（検証のみ）

- [ ] **Step 1: フォーマッターを実行**

Run: `npx prettier --write "src/**/*.{ts,tsx,scss}"`
Expected: 変更ファイルが整形される（差分があれば commit する）。

- [ ] **Step 2: 全テストを実行**

Run: `npm test`
Expected: 全テスト PASS（オールグリーン）。

- [ ] **Step 3: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラーなし。

- [ ] **Step 4: Rust テスト**

Run: `cd src-tauri && cargo test --lib settings`
Expected: PASS。

- [ ] **Step 5: 整形差分があればコミット**

```bash
git add -A
git commit -m "chore: フォーマッター適用"
```

- [ ] **Step 6: 実機確認（Android）— 手動チェックリスト**

> 自動テストでは touch とネイティブ WebView 配置を完全には再現できないため、実機/エミュレータで確認する。

1. `npm run tauri:android:build` でビルドし実機/エミュレータで起動。
2. タブバー直上に帯が表示され、`⠿ スワイプで切替 ⠿` が見えること。
3. 帯を左フリック→次カラム、右フリック→前カラムへ切り替わること（端では何もしない）。
4. タブのタップ（特定カラムへジャンプ）・長押し（タブアクション）・タブの横スクロールが従来どおり動くこと。
5. 画像ズーム中のパン、X の横スワイプが帯フリックの影響を受けないこと。
6. コンテンツ下端が帯のぶんだけ縮み、コンテンツが帯やタブバーに隠れないこと。
7. アプリ設定でスワイプ切替を無効化→帯が消え、コンテンツがフル高さに戻ること。高さを変更→帯の高さとコンテンツ高さが連動すること。

---

## 完了の定義

- Task 1〜9 のチェックボックスがすべて完了。
- `npm test` / `npx tsc --noEmit` / `cargo test --lib settings` がオールグリーン。
- 実機チェックリスト（Task 9 Step 6）を確認済み。
- 既存ブーメランジェスチャーは併存のまま（撤去は後続タスク）。
