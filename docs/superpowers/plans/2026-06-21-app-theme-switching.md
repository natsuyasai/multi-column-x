# アプリ本体テーマ切り替え機能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** アプリ本体UIに「ダーク / ライト / システム連動」のテーマ切り替えを追加し、アプリ設定から選択・永続化できるようにする。

**Architecture:** セマンティックなCSS変数トークンを `:root[data-theme="dark"]` / `:root[data-theme="light"]` の2セットで定義し、各SCSSのハードコード色を `var(--mcx-*)` に置換する。`useTheme` フックが `globalSettings.theme` を解決済みテーマ（dark/light）に変換して `document.documentElement` の `data-theme` 属性へ反映する。`"system"` 時は `matchMedia('(prefers-color-scheme: dark)')` で解決し、OS配色変更にライブ追従する。

**Tech Stack:** React 19, TypeScript, Zustand (useAppStore), SCSS Modules, Vitest + Testing Library, Tauri v2 (Rust側は `theme: String` のため変更不要)。

## Global Constraints

- 回答・コミットメッセージ・テストケース名はすべて**日本語**で記述する。
- `var` は使用しない（モダンJS記法）。テストはt-wada推奨TDDで進める。
- 作業毎にコミットする（1タスク=1コミット以上）。各タスク完了時に `npm test` と `npm run lint`（存在すれば）が緑であること。
- `GlobalSettings.theme` のデフォルトは `"dark"` のまま変更しない。`contracts/default-settings.json` と Rust 側デフォルトは変更しない。
- テーマ適用対象は**本アプリが描画するシェルUIのみ**。カラム内WebView（X/Twitterページ）には手を出さない。
- 既存の色は意味を保持して移行する。**同じ16進数でも用途（背景/境界/テキスト）が異なれば別トークンへ**割り当てる（例: `#222` は箇所により背景にも境界にもなる）。

### マスター・トークン定義（Task 4 で `src/index.css` に実装）

ベースライン `:root` にはダーク値を置き、初期描画フラッシュを防ぐ。`:root[data-theme="light"]` でライト値に上書きする。`:root[data-theme="dark"]` も明示的に定義する。

| トークン                      | 用途                         | dark 値                    | light 値                  |
| ----------------------------- | ---------------------------- | -------------------------- | ------------------------- |
| `--mcx-app-bg`                | アプリ最背面（WebView背後）  | `#000000`                  | `#e6ecf0`                 |
| `--mcx-surface`               | パネル/ダイアログ背景        | `#1a1a1a`                  | `#ffffff`                 |
| `--mcx-surface-sunken`        | 入力欄/バー/沈んだ面         | `#101010`                  | `#f7f9f9`                 |
| `--mcx-surface-muted`         | 副次ボタン/チップ背景        | `#2a2a2a`                  | `#eff3f4`                 |
| `--mcx-surface-hover`         | ホバー背景                   | `#333333`                  | `#e1e8ed`                 |
| `--mcx-text`                  | 主要テキスト                 | `#f5f5f5`                  | `#0f1419`                 |
| `--mcx-text-secondary`        | 補助テキスト                 | `#cccccc`                  | `#536471`                 |
| `--mcx-text-tertiary`         | 弱いテキスト/プレースホルダ  | `#999999`                  | `#8899a6`                 |
| `--mcx-text-muted`            | 最も弱いテキスト/無効        | `#666666`                  | `#aab8c2`                 |
| `--mcx-text-on-accent`        | アクセント上のテキスト       | `#ffffff`                  | `#ffffff`                 |
| `--mcx-border`                | 標準境界                     | `#333333`                  | `#cfd9de`                 |
| `--mcx-border-subtle`         | 弱い境界/区切り              | `#222222`                  | `#eff3f4`                 |
| `--mcx-border-strong`         | 強い境界                     | `#555555`                  | `#aab8c2`                 |
| `--mcx-accent`                | アクセント（Xブルー）        | `#1d9bf0`                  | `#1d9bf0`                 |
| `--mcx-accent-hover`          | アクセントhover              | `#1a8cd8`                  | `#1a8cd8`                 |
| `--mcx-accent-bg`             | アクセント淡背景（選択候補） | `#0f1f30`                  | `#e8f5fd`                 |
| `--mcx-accent-bg-strong`      | アクセント濃背景（選択中）   | `#0d2233`                  | `#d2ebfb`                 |
| `--mcx-accent-border`         | アクセント境界（半透明相当） | `rgba(29, 155, 240, 0.4)`  | `rgba(29, 155, 240, 0.5)` |
| `--mcx-danger`                | 危険テキスト                 | `#e06c75`                  | `#d4322c`                 |
| `--mcx-danger-bg`             | 危険背景tint                 | `#2a1515`                  | `#fde8e8`                 |
| `--mcx-danger-border`         | 危険境界                     | `#442222`                  | `#f1c0c0`                 |
| `--mcx-warning`               | 警告テキスト                 | `#e5c07b`                  | `#b8860b`                 |
| `--mcx-warning-bg`            | 警告背景tint                 | `#2a2200`                  | `#fdf6e3`                 |
| `--mcx-warning-border`        | 警告境界（半透明相当）       | `rgba(240, 192, 29, 0.27)` | `rgba(184, 134, 11, 0.3)` |
| `--mcx-overlay`               | ダイアログ遮蔽               | `rgba(0, 0, 0, 0.7)`       | `rgba(0, 0, 0, 0.45)`     |
| `--mcx-scrollbar-track`       | スクロールバー溝             | `#0a0a0a`                  | `#e1e8ed`                 |
| `--mcx-scrollbar-thumb`       | スクロールバーつまみ         | `#333333`                  | `#aab8c2`                 |
| `--mcx-scrollbar-thumb-hover` | つまみhover                  | `#555555`                  | `#8899a6`                 |
| `--mcx-shadow`                | 影色                         | `rgba(0, 0, 0, 0.5)`       | `rgba(0, 0, 0, 0.15)`     |

### グローバル置換ルール（全SCSSタスク共通）

各ファイルの色は以下の規則で対応トークンへ置換する。**用途（CSSプロパティ）で判断する**こと。

- アクセント: `#1d9bf0`→`--mcx-accent` / `#1a8cd8`→`--mcx-accent-hover`
- オーバーレイ `rgba(0,0,0,0.5〜0.7)`（`.overlay` の背景）→`--mcx-overlay`
- テキスト（`color:`）明度順: `#fff/#eee/#e7e9ea`→`--mcx-text`、`#ddd/#ccc`→`--mcx-text-secondary`、`#aaa/#888`→`--mcx-text-tertiary`、`#666/#555/#444/#333`→`--mcx-text-muted`。ただしアクセントボタン上の `#fff` は `--mcx-text-on-accent`。
- 背景（`background:`）: `#000`→`--mcx-app-bg`、`#1a1a1a/#1c1c1e`→`--mcx-surface`、`#0a0a0a/#0d0d0d/#0f0f0f/#111`→`--mcx-surface-sunken`、`#2a2a2a`→`--mcx-surface-muted`、`#333/#222`(hover時)→`--mcx-surface-hover`
- 境界（`border*:`）: `#333`→`--mcx-border`、`#222/#2a2a2a/#1a1a1a`→`--mcx-border-subtle`、`#444/#555`→`--mcx-border-strong`
- 危険系（赤）: テキスト`#ff453a/#e06c75/#f55/#cc6666/#884444`→`--mcx-danger`、背景`#2a1515/#331111/#2a1a1a`→`--mcx-danger-bg`、境界`#442222`→`--mcx-danger-border`
- 警告系（黄）: テキスト`#e5c07b/#f0c01d`→`--mcx-warning`、背景`#2a2200`→`--mcx-warning-bg`、`#f0c01d44`相当の境界→`--mcx-warning-border`
- 影 `rgba(0,0,0,0.3〜0.5)`（`box-shadow`）→`--mcx-shadow`
- `rgba(255,255,255,α)`（モバイル系の白半透明）: 背景は`--mcx-surface-hover`、テキストは明度に応じ`--mcx-text-secondary`/`--mcx-text-tertiary`、境界は`--mcx-border-subtle` に置換（半透明の質感は失われるが本体テーマ統一を優先）
- ファイル固有の特殊tint（ColumnLayoutTab のグリッド編集色など）は各タスクの「特殊マッピング」節で個別指定する。

---

## File Structure

**新規作成:**

- `src/lib/theme.ts` — テーマ解決の純粋関数 `resolveTheme`
- `src/lib/theme.test.ts` — 同テスト
- `src/hooks/useTheme.ts` — `data-theme` 反映・matchMedia購読フック
- `src/hooks/useTheme.test.ts` — 同テスト

**変更:**

- `src/types/index.ts` — `GlobalSettings.theme` の union 拡張
- `src/App.tsx` — `useTheme` 組み込み
- `src/index.css` — トークン定義 + ベースライン色のトークン化
- `src/App.css` — テンプレ残骸の色をトークン化（または prefers-color-scheme 撤去）
- 本体SCSS 15ファイル — ハードコード色を `var(--mcx-*)` へ
- `src/components/AppSettingsPanel/AppSettingsPanel.tsx` — テーマ3択UI追加
- `src/components/AppSettingsPanel/AppSettingsPanel.test.tsx` — 同テスト

---

## Task 1: theme 型の union 拡張

**Files:**

- Modify: `src/types/index.ts:48`
- Test: `src/types/defaults.contract.test.ts`（既存が緑のままであることの確認のみ）

**Interfaces:**

- Produces: `GlobalSettings.theme: "dark" | "light" | "system"`

- [ ] **Step 1: 型を拡張**

`src/types/index.ts` の48行目を変更:

```ts
theme: "dark" | "light" | "system";
```

`DEFAULT_GLOBAL_SETTINGS.theme`（141行目）は `"dark"` のまま変更しない。

- [ ] **Step 2: 型チェックと既存テストを実行**

Run: `npx tsc --noEmit && npm test -- defaults.contract`
Expected: PASS（既定 dark 維持のため契約テストは緑のまま）

- [ ] **Step 3: コミット**

```bash
git add src/types/index.ts
git commit -m "feat(theme): GlobalSettings.themeにsystemを追加"
```

---

## Task 2: テーマ解決の純粋関数 `resolveTheme`

**Files:**

- Create: `src/lib/theme.ts`
- Test: `src/lib/theme.test.ts`

**Interfaces:**

- Produces: `export type ResolvedTheme = "dark" | "light";`
- Produces: `export function resolveTheme(theme: string, systemPrefersDark: boolean): ResolvedTheme`
  - `"light"` → `"light"`、`"system"` → `systemPrefersDark ? "dark" : "light"`、それ以外（`"dark"` および不正値）→ `"dark"`

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/theme.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveTheme } from "./theme";

describe("resolveTheme", () => {
  it("darkを指定するとdarkを返す", () => {
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("dark", true)).toBe("dark");
  });

  it("lightを指定するとlightを返す", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("light", false)).toBe("light");
  });

  it("systemかつOSがダークのときdarkを返す", () => {
    expect(resolveTheme("system", true)).toBe("dark");
  });

  it("systemかつOSがライトのときlightを返す", () => {
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("不正な値はdarkにフォールバックする", () => {
    expect(resolveTheme("unknown", false)).toBe("dark");
    expect(resolveTheme("", false)).toBe("dark");
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm test -- theme`
Expected: FAIL（`resolveTheme` 未定義）

- [ ] **Step 3: 最小実装**

`src/lib/theme.ts`:

```ts
export type ResolvedTheme = "dark" | "light";

/**
 * テーマ設定値とOSのダーク指向から、適用すべき実テーマを決定する純粋関数。
 * 不正値はdarkにフォールバックする。
 */
export function resolveTheme(
  theme: string,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (theme === "light") return "light";
  if (theme === "system") return systemPrefersDark ? "dark" : "light";
  return "dark";
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm test -- theme`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/lib/theme.ts src/lib/theme.test.ts
git commit -m "feat(theme): テーマ解決の純粋関数resolveThemeを追加"
```

---

## Task 3: `useTheme` フックと App への組み込み

**Files:**

- Create: `src/hooks/useTheme.ts`
- Test: `src/hooks/useTheme.test.ts`
- Modify: `src/App.tsx`

**Interfaces:**

- Consumes: `resolveTheme`, `ResolvedTheme`（Task 2）
- Produces: `export function useTheme(theme: string): void`
  - 副作用: `document.documentElement.setAttribute("data-theme", resolved)` を設定。`theme === "system"` の間のみ `matchMedia('(prefers-color-scheme: dark)')` の `change` を購読し、解除する。`matchMedia` 非対応時は `light` 指向（= systemPrefersDark=false）として扱う。

- [ ] **Step 1: 失敗するテストを書く**

`src/hooks/useTheme.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useTheme } from "./useTheme";

type Listener = (e: { matches: boolean }) => void;

function installMatchMedia(matches: boolean) {
  const listeners = new Set<Listener>();
  const mql = {
    matches,
    media: "(prefers-color-scheme: dark)",
    addEventListener: (_: string, cb: Listener) => listeners.add(cb),
    removeEventListener: (_: string, cb: Listener) => listeners.delete(cb),
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => mql),
  );
  return {
    emit: (next: boolean) => {
      mql.matches = next;
      listeners.forEach((cb) => cb({ matches: next }));
    },
    listenerCount: () => listeners.size,
  };
}

describe("useTheme", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("darkを渡すとdata-theme=darkを設定する", () => {
    installMatchMedia(false);
    renderHook(() => useTheme("dark"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("lightを渡すとdata-theme=lightを設定する", () => {
    installMatchMedia(true);
    renderHook(() => useTheme("light"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("systemかつOSダークのときdata-theme=darkを設定する", () => {
    installMatchMedia(true);
    renderHook(() => useTheme("system"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("system選択中にOS配色が変わるとdata-themeが追従する", () => {
    const mm = installMatchMedia(true);
    renderHook(() => useTheme("system"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    mm.emit(false);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("systemでないときはmatchMediaを購読しない", () => {
    const mm = installMatchMedia(true);
    renderHook(() => useTheme("dark"));
    expect(mm.listenerCount()).toBe(0);
  });

  it("アンマウント時にリスナを解除する", () => {
    const mm = installMatchMedia(true);
    const { unmount } = renderHook(() => useTheme("system"));
    expect(mm.listenerCount()).toBe(1);
    unmount();
    expect(mm.listenerCount()).toBe(0);
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm test -- useTheme`
Expected: FAIL（`useTheme` 未定義）

- [ ] **Step 3: 最小実装**

`src/hooks/useTheme.ts`:

```ts
import { useEffect } from "react";
import { resolveTheme } from "../lib/theme";

const MEDIA_QUERY = "(prefers-color-scheme: dark)";

function getMql(): MediaQueryList | null {
  if (typeof matchMedia !== "function") return null;
  return matchMedia(MEDIA_QUERY);
}

/**
 * globalSettings.theme を解決済みテーマに変換し、
 * document.documentElement の data-theme 属性へ反映する。
 * "system" の間のみ OS 配色変更を購読してライブ追従する。
 */
export function useTheme(theme: string): void {
  useEffect(() => {
    const apply = (prefersDark: boolean) => {
      document.documentElement.setAttribute(
        "data-theme",
        resolveTheme(theme, prefersDark),
      );
    };

    const mql = getMql();
    apply(mql?.matches ?? false);

    if (theme !== "system" || !mql) return;

    const onChange = (e: MediaQueryListEvent | { matches: boolean }) => {
      apply(e.matches);
    };
    mql.addEventListener("change", onChange as (e: Event) => void);
    return () => {
      mql.removeEventListener("change", onChange as (e: Event) => void);
    };
  }, [theme]);
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm test -- useTheme`
Expected: PASS（6ケース）

- [ ] **Step 5: App.tsx に組み込む**

`src/App.tsx` の import 群に追加:

```ts
import { useTheme } from "./hooks/useTheme";
```

コンポーネント本体（`globalSettings` が参照可能な位置、`columnScale` の effect 付近）に追加:

```ts
// 本体UIのテーマを data-theme 属性へ反映する
useTheme(globalSettings.theme);
```

- [ ] **Step 6: 型チェックと既存テスト全体を実行**

Run: `npx tsc --noEmit && npm test`
Expected: PASS（App.test.tsx 含め緑）

- [ ] **Step 7: コミット**

```bash
git add src/hooks/useTheme.ts src/hooks/useTheme.test.ts src/App.tsx
git commit -m "feat(theme): useThemeフックでdata-theme属性を反映しAppに組み込む"
```

---

## Task 4: CSS変数トークンの定義とベースCSSのトークン化

**Files:**

- Modify: `src/index.css`
- Modify: `src/App.css`

**Interfaces:**

- Produces: 「マスター・トークン定義」表の全 `--mcx-*` を `:root` / `:root[data-theme="dark"]` / `:root[data-theme="light"]` に定義。

このタスクはCSSのみ（単体テスト対象外）。検証はビルドと目視。

- [ ] **Step 1: index.css にトークンを定義**

`src/index.css` の先頭（`*` ルールの前）に「マスター・トークン定義」表の全トークンを追加する。`:root` と `:root[data-theme="dark"]` には dark 値、`:root[data-theme="light"]` には light 値を記述する。例（全トークンを表のとおり記述すること）:

```css
:root,
:root[data-theme="dark"] {
  --mcx-app-bg: #000000;
  --mcx-surface: #1a1a1a;
  --mcx-surface-sunken: #101010;
  --mcx-surface-muted: #2a2a2a;
  --mcx-surface-hover: #333333;
  --mcx-text: #f5f5f5;
  --mcx-text-secondary: #cccccc;
  --mcx-text-tertiary: #999999;
  --mcx-text-muted: #666666;
  --mcx-text-on-accent: #ffffff;
  --mcx-border: #333333;
  --mcx-border-subtle: #222222;
  --mcx-border-strong: #555555;
  --mcx-accent: #1d9bf0;
  --mcx-accent-hover: #1a8cd8;
  --mcx-accent-bg: #0f1f30;
  --mcx-accent-bg-strong: #0d2233;
  --mcx-accent-border: rgba(29, 155, 240, 0.4);
  --mcx-danger: #e06c75;
  --mcx-danger-bg: #2a1515;
  --mcx-danger-border: #442222;
  --mcx-warning: #e5c07b;
  --mcx-warning-bg: #2a2200;
  --mcx-warning-border: rgba(240, 192, 29, 0.27);
  --mcx-overlay: rgba(0, 0, 0, 0.7);
  --mcx-scrollbar-track: #0a0a0a;
  --mcx-scrollbar-thumb: #333333;
  --mcx-scrollbar-thumb-hover: #555555;
  --mcx-shadow: rgba(0, 0, 0, 0.5);
}

:root[data-theme="light"] {
  --mcx-app-bg: #e6ecf0;
  --mcx-surface: #ffffff;
  --mcx-surface-sunken: #f7f9f9;
  --mcx-surface-muted: #eff3f4;
  --mcx-surface-hover: #e1e8ed;
  --mcx-text: #0f1419;
  --mcx-text-secondary: #536471;
  --mcx-text-tertiary: #8899a6;
  --mcx-text-muted: #aab8c2;
  --mcx-text-on-accent: #ffffff;
  --mcx-border: #cfd9de;
  --mcx-border-subtle: #eff3f4;
  --mcx-border-strong: #aab8c2;
  --mcx-accent: #1d9bf0;
  --mcx-accent-hover: #1a8cd8;
  --mcx-accent-bg: #e8f5fd;
  --mcx-accent-bg-strong: #d2ebfb;
  --mcx-accent-border: rgba(29, 155, 240, 0.5);
  --mcx-danger: #d4322c;
  --mcx-danger-bg: #fde8e8;
  --mcx-danger-border: #f1c0c0;
  --mcx-warning: #b8860b;
  --mcx-warning-bg: #fdf6e3;
  --mcx-warning-border: rgba(184, 134, 11, 0.3);
  --mcx-overlay: rgba(0, 0, 0, 0.45);
  --mcx-scrollbar-track: #e1e8ed;
  --mcx-scrollbar-thumb: #aab8c2;
  --mcx-scrollbar-thumb-hover: #8899a6;
  --mcx-shadow: rgba(0, 0, 0, 0.15);
}
```

- [ ] **Step 2: index.css の body 背景をトークン化**

`src/index.css` の `html, body` の `background: #000;` を以下に変更:

```css
background: var(--mcx-app-bg);
```

- [ ] **Step 3: App.css をトークン化**

`src/App.css` は Tauri テンプレート由来。`@media (prefers-color-scheme: dark)` ブロック（98-116行目）を削除し、`:root` の `color`/`background-color`（14-15行目）と `input, button` の `color`/`background-color`（71-72行目）をトークン化する:

```css
:root {
  /* ...font 設定はそのまま... */
  color: var(--mcx-text);
  background-color: var(--mcx-app-bg);
  /* ... */
}

input,
button {
  /* ... */
  color: var(--mcx-text);
  background-color: var(--mcx-surface);
  /* ... */
}
```

`a`/`a:hover`/`button:hover`/`button:active` のハードコード色（`#646cff` 等のテンプレ残骸）も `--mcx-accent` / `--mcx-accent-hover` に置換する。

- [ ] **Step 4: ビルドで検証**

Run: `npm run build`
Expected: ビルド成功（CSS構文エラーなし）

- [ ] **Step 5: コミット**

```bash
git add src/index.css src/App.css
git commit -m "feat(theme): CSS変数トークンを定義しベースCSSをトークン化"
```

---

## Task 5: アプリシェル（App / ColumnHeader / TopBar）のトークン化

**Files:**

- Modify: `src/App.module.scss`
- Modify: `src/components/ColumnHeader/ColumnHeader.module.scss`
- Modify: `src/components/TopBar/TopBar.module.scss`

**Interfaces:** Task 4 のトークンを消費。CSSのみ（目視検証）。

「グローバル置換ルール」に従って各色を置換する。スクロールバー（`App.module.scss` 46-59行目）は `--mcx-scrollbar-track` / `--mcx-scrollbar-thumb` / `--mcx-scrollbar-thumb-hover` を使う。`.app` の `background: #000`→`--mcx-app-bg`、`.noAccountsPrompt` の `#1a1a1a`→`--mcx-surface`・`#333`→`--mcx-border`・`#aaa`→`--mcx-text-tertiary`。`ColumnHeader` のアクティブ色 `#1d9bf0`→`--mcx-accent`、白文字 `#fff`→`--mcx-text-on-accent`。

- [ ] **Step 1: 3ファイルの色をグローバル置換ルールで `var(--mcx-*)` に置換**

各ファイルの全16進数/`rgba`色を、用途に応じて対応トークンへ置換する（「グローバル置換ルール」参照）。

- [ ] **Step 2: ビルドで検証**

Run: `npm run build`
Expected: 成功

- [ ] **Step 3: 目視確認**

Run: `npm run tauri:dev`
Expected: ダーク表示が従来と概ね同等。設定でライトに切替時、TopBar/ColumnHeader/スクロールバーが明色化。

- [ ] **Step 4: コミット**

```bash
git add src/App.module.scss src/components/ColumnHeader/ColumnHeader.module.scss src/components/TopBar/TopBar.module.scss
git commit -m "feat(theme): アプリシェル(App/ColumnHeader/TopBar)をトークン化"
```

---

## Task 6: 汎用ダイアログ群のトークン化

**Files:**

- Modify: `src/components/LinkPopupDialog/LinkPopupDialog.module.scss`
- Modify: `src/components/AddColumnDialog/AddColumnDialog.module.scss`
- Modify: `src/components/AccountManager/AccountManager.module.scss`
- Modify: `src/components/TabActionDialog/TabActionDialog.module.scss`
- Modify: `src/components/SettingsPanel/SettingsPanel.module.scss`
- Modify: `src/components/UpdateDialog/UpdateDialog.module.scss`

**Interfaces:** Task 4 のトークンを消費。CSSのみ。

「グローバル置換ルール」に従う。各ファイルの `.overlay` 背景 `rgba(0,0,0,0.x)`→`--mcx-overlay`、`box-shadow` の影→`--mcx-shadow`。

**特殊マッピング:**

- `UpdateDialog.module.scss`: 既存の `var(--color-bg, #fff)`→`var(--mcx-surface)`、`var(--color-text, #000)`→`var(--mcx-text)`。`rgba(127,127,127,0.1)`→`--mcx-surface-muted`、`rgba(127,127,127,0.5)`→`--mcx-border-strong`。
- `AccountManager.module.scss`: 危険ボタン `#e06c75`/`#444`(危険境界)/`#2a1515`→`--mcx-danger`/`--mcx-danger-border`/`--mcx-danger-bg`。ラベル色 `#e5c07b`→`--mcx-warning`。
- `TabActionDialog.module.scss`: 削除項目 `#ff453a`→`--mcx-danger`。区切りの `rgba(0,0,0,0.4)` (三角矢印) は装飾的なので `--mcx-shadow` ではなく従来見た目維持のため `--mcx-overlay` を使う。

- [ ] **Step 1: 6ファイルをグローバル置換ルール+特殊マッピングで置換**

- [ ] **Step 2: ビルドで検証**

Run: `npm run build`
Expected: 成功

- [ ] **Step 3: 目視確認（各ダイアログを開いてライト/ダーク両方）**

Run: `npm run tauri:dev`
Expected: 各ダイアログがライト時に白背景＋濃文字で破綻なく表示。

- [ ] **Step 4: コミット**

```bash
git add src/components/LinkPopupDialog/ src/components/AddColumnDialog/ src/components/AccountManager/ src/components/TabActionDialog/ src/components/SettingsPanel/ src/components/UpdateDialog/
git commit -m "feat(theme): 汎用ダイアログ群をトークン化"
```

---

## Task 7: アプリ設定パネル群のトークン化

**Files:**

- Modify: `src/components/AppSettingsPanel/AppSettingsPanel.module.scss`
- Modify: `src/components/AppSettingsPanel/PresetsTab.module.scss`
- Modify: `src/components/AppSettingsPanel/ColumnLayoutTab.module.scss`

**Interfaces:** Task 4 のトークンを消費。CSSのみ。

「グローバル置換ルール」に従う。

**特殊マッピング（ColumnLayoutTab のグリッド編集UI）:**

- 空セル背景 `#1e1e2e` / `#1a1a2a` / `#161622`→`--mcx-surface-muted`、その破線境界 `#333`/`#2a2a3a`→`--mcx-border`
- 配置済みセル（青tint）背景 `#0f1f30` / `#0d1e30`→`--mcx-accent-bg`、境界 `#1d9bf066`→`--mcx-accent-border`、hover `#1d9bf0aa`→`--mcx-accent`
- 選択中セル背景 `#0d2233` / `#1a3a50`→`--mcx-accent-bg-strong`、文字/境界 `#1d9bf0`→`--mcx-accent`
- ドラッグ警告 境界 `#f0c01d`→`--mcx-warning`、背景 `#2a2200`→`--mcx-warning-bg`、`box-shadow ... #f0c01d44`→`--mcx-warning-border`
- 削除危険 `#f55`→`--mcx-danger`、背景 `#2a1a1a`→`--mcx-danger-bg`
- `PresetsTab.module.scss` の削除ボタン: 境界 `#442222`→`--mcx-danger-border`、文字 `#884444`→`--mcx-danger`、hover背景 `#331111`→`--mcx-danger-bg`、hover文字 `#cc6666`→`--mcx-danger`

- [ ] **Step 1: 3ファイルを置換**

- [ ] **Step 2: ビルドで検証**

Run: `npm run build`
Expected: 成功

- [ ] **Step 3: 目視確認（アプリ設定の各タブ、特にカラム配置グリッド）**

Run: `npm run tauri:dev`
Expected: カラム配置グリッドの空/配置済/選択/警告状態がライト・ダーク双方で識別可能。

- [ ] **Step 4: コミット**

```bash
git add src/components/AppSettingsPanel/AppSettingsPanel.module.scss src/components/AppSettingsPanel/PresetsTab.module.scss src/components/AppSettingsPanel/ColumnLayoutTab.module.scss
git commit -m "feat(theme): アプリ設定パネル群をトークン化"
```

---

## Task 8: モバイルUI（MobileTabBar / MobileSwipeBar）のトークン化

**Files:**

- Modify: `src/components/MobileTabBar/MobileTabBar.module.scss`
- Modify: `src/components/MobileSwipeBar/MobileSwipeBar.module.scss`

**Interfaces:** Task 4 のトークンを消費。CSSのみ。

`rgba(255,255,255,α)` の白半透明を「グローバル置換ルール」の方針で置換する: 背景用途→`--mcx-surface-hover`、テキスト用途→明度に応じ `--mcx-text-secondary`(0.7前後)/`--mcx-text-tertiary`(0.45〜0.55)、区切り境界 `rgba(255,255,255,0.08〜0.12)`→`--mcx-border-subtle`。`#1c1c1e`(バー背景)→`--mcx-surface`、`#1a1a1a`→`--mcx-surface`、`#1d9bf0`→`--mcx-accent`、`#fff`(アクティブ文字)→`--mcx-text` または `--mcx-text-on-accent`（アクセント背景上のみ後者）。

- [ ] **Step 1: 2ファイルを置換**

- [ ] **Step 2: ビルドで検証**

Run: `npm run build`
Expected: 成功

- [ ] **Step 3: コミット**

```bash
git add src/components/MobileTabBar/ src/components/MobileSwipeBar/
git commit -m "feat(theme): モバイルUIをトークン化"
```

---

## Task 9: 設定UIにテーマ3択を追加

**Files:**

- Modify: `src/components/AppSettingsPanel/AppSettingsPanel.tsx`
- Test: `src/components/AppSettingsPanel/AppSettingsPanel.test.tsx`

**Interfaces:**

- Consumes: `GlobalSettings.theme`（Task 1）、既存 `columnScale` ボタン群のUIパターン（`styles.scaleRow`/`scaleOptions`/`scaleBtn`/`scaleBtnActive`）を流用。
- Produces: 「表示」セクション内に「テーマ」3択（ダーク/ライト/システム）。`handleSubmit` の `onApply` パッチへ `theme` を含める。

- [ ] **Step 1: 失敗するテストを書く**

`src/components/AppSettingsPanel/AppSettingsPanel.test.tsx` に追加（既存の import / ヘルパに合わせる。`render` と `settings` モックは既存テストの作法を踏襲すること）:

```tsx
it("テーマでライトを選び適用するとonApplyにtheme:lightが渡る", async () => {
  const onApply = vi.fn();
  renderPanel({ onApply }); // 既存ヘルパ。無ければ既存テストと同様に render する
  await userEvent.click(screen.getByRole("button", { name: "ライト" }));
  await userEvent.click(screen.getByRole("button", { name: "適用" }));
  expect(onApply).toHaveBeenCalledWith(
    expect.objectContaining({ theme: "light" }),
  );
});

it("現在のテーマ設定がアクティブ表示される", () => {
  renderPanel({ settings: { theme: "system" } }); // 既存の設定モック生成法に合わせる
  expect(screen.getByRole("button", { name: "システム" })).toHaveClass(
    expect.stringContaining("scaleBtnActive") as unknown as string,
  );
});
```

> 注: 既存テストのレンダリング作法（`renderPanel` 等のヘルパ有無、`settings` の組み立て方）を先に確認し、それに合わせて記述する。アクティブ判定は CSS Modules のハッシュ化クラス名のため、`className` 部分一致で検証する（既存テストに同種の検証があれば踏襲）。

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm test -- AppSettingsPanel`
Expected: FAIL（テーマボタンが存在しない）

- [ ] **Step 3: 実装**

`src/components/AppSettingsPanel/AppSettingsPanel.tsx`:

state を追加（`columnScale` state 付近）:

```tsx
const [theme, setTheme] = useState(settings.theme ?? "dark");
```

`handleSubmit` の `onApply({ ... })` に `theme,` を追加する。

「表示」セクション（`styles.scaleRow` の表示サイズの下）に3択を追加:

```tsx
<div className={styles.scaleRow}>
  <span className={styles.scaleLabel}>テーマ</span>
  <div className={styles.scaleOptions}>
    {(
      [
        { value: "dark", label: "ダーク" },
        { value: "light", label: "ライト" },
        { value: "system", label: "システム" },
      ] as { value: "dark" | "light" | "system"; label: string }[]
    ).map(({ value, label }) => (
      <button
        key={value}
        type="button"
        className={`${styles.scaleBtn} ${theme === value ? styles.scaleBtnActive : ""}`}
        onClick={() => setTheme(value)}
      >
        {label}
      </button>
    ))}
  </div>
</div>
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm test -- AppSettingsPanel`
Expected: PASS

- [ ] **Step 5: 型チェックと全テスト**

Run: `npx tsc --noEmit && npm test`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add src/components/AppSettingsPanel/AppSettingsPanel.tsx src/components/AppSettingsPanel/AppSettingsPanel.test.tsx
git commit -m "feat(theme): アプリ設定にテーマ3択UIを追加"
```

---

## Task 10: 全体検証と仕上げ

**Files:**

- 確認のみ（必要に応じ取りこぼし色を修正）

- [ ] **Step 1: 残ハードコード色のスキャン**

`src/` 配下のSCSS/CSSに残る16進数・`rgba`色を検索し、テーマで切り替わるべき箇所が `var(--mcx-*)` 化されているか確認する。意図的に共通な色（純白アイコン等）以外に取りこぼしがあれば該当タスクの規則で修正する。

Run: `grep -rnE "#[0-9a-fA-F]{3,8}|rgba?\(" src --include=*.scss --include=*.css`（Grepツール可）

- [ ] **Step 2: フォーマッタ + 全テスト + 型チェック + ビルド**

Run: `npm run format`（存在すれば）→ `npx tsc --noEmit` → `npm test` → `npm run build`
Expected: すべて緑

- [ ] **Step 3: 目視最終確認（dark→light→system を切替）**

Run: `npm run tauri:dev`
Expected: 3モードすべてで本体UIが破綻なく表示。systemはOS設定変更に追従。再起動後も選択が保持される。

- [ ] **Step 4: 取りこぼし修正があればコミット**

```bash
git add -A
git commit -m "fix(theme): テーマトークン化の取りこぼしを修正"
```

---

## Self-Review メモ

- **Spec coverage:** スコープ（本体UIのみ/WebView非対象）= Task 5-8 が本体SCSSのみ対象。3択（dark/light/system）= Task 1,9。解決ロジック+system追従 = Task 2,3。型・契約（既定dark維持）= Task 1。フラッシュ防止（:root=dark）= Task 4。テスト方針 = Task 2,3,9 がTDD、CSSは目視。→ 全要件にタスク対応あり。
- **型整合:** `resolveTheme(theme, systemPrefersDark)` / `ResolvedTheme` / `useTheme(theme: string)` は Task 2→3→9 で一貫。
- **既存テスト保護:** `defaults.contract.test.ts` は既定dark維持で不変（Task 1 で確認）。
