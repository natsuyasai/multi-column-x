# キーボードショートカット拡張 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** TopBar の全操作（Ctrl+L/N/Shift+A/,/B）と Ctrl+1-9 カラムジャンプを、メインウィンドウ・WebView フォーカス問わず動作するキーボードショートカットとして実装する。

**Architecture:** 既存の `useKeyboardShortcuts` フックを拡張し、`window keydown`（メインウィンドウフォーカス時）と Tauri `listen()`（WebView フォーカス時の inject→Rust→emit 経由）の 2 経路をカバーする。`disabled` フラグでダイアログ表示中は全ショートカットを無効化する。

**Tech Stack:** React hooks, Tauri v2 (listen/emit), vitest + @testing-library/react, TypeScript

---

## ファイル構成

| ファイル                                    | 役割                                     |
| ------------------------------------------- | ---------------------------------------- |
| `src/hooks/useKeyboardShortcuts.ts`         | 全ショートカットロジック（拡張）         |
| `src/hooks/useKeyboardShortcuts.test.ts`    | フックの単体テスト（拡張）               |
| `src/App.tsx`                               | フックに新コールバック + disabled を渡す |
| `src-tauri/src/inject/keyboard_shortcut.js` | WebView 内の keydown を Tauri IPC で転送 |

---

## Task 1: インターフェース拡張・disabled フラグの追加

**Files:**

- Modify: `src/hooks/useKeyboardShortcuts.ts`
- Modify: `src/hooks/useKeyboardShortcuts.test.ts`

- [ ] **Step 1: テストファイルを makeProps 形式に書き換え + disabled テストを追加（Red）**

`src/hooks/useKeyboardShortcuts.test.ts` を以下の内容に **全置換** する:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";

type ListenCallback = (event: { payload: unknown }) => void;
let capturedListenCallback: ListenCallback | null = null;
const mockUnlisten = vi.fn();

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((_event: string, cb: ListenCallback) => {
    capturedListenCallback = cb;
    return Promise.resolve(mockUnlisten);
  }),
}));

function makeProps(
  overrides: Partial<{
    onComposeTweet: () => void;
    onOpenLinkPopup: () => void;
    onAddColumn: () => void;
    onAccountManager: () => void;
    onAppSettings: () => void;
    onToggleTopBar: () => void;
    onJumpToColumn: (index: number) => void;
    disabled: boolean;
  }> = {},
) {
  return {
    onComposeTweet: vi.fn(),
    onOpenLinkPopup: vi.fn(),
    onAddColumn: vi.fn(),
    onAccountManager: vi.fn(),
    onAppSettings: vi.fn(),
    onToggleTopBar: vi.fn(),
    onJumpToColumn: vi.fn(),
    disabled: false,
    ...overrides,
  };
}

describe("useKeyboardShortcuts", () => {
  beforeEach(() => {
    capturedListenCallback = null;
    mockUnlisten.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Ctrl+T を押すと onComposeTweet が呼ばれる", () => {
    const props = makeProps();
    renderHook(() => useKeyboardShortcuts(props));
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "t", ctrlKey: true }),
    );
    expect(props.onComposeTweet).toHaveBeenCalledOnce();
  });

  it("Ctrl+T（大文字T）を押すと onComposeTweet が呼ばれる", () => {
    const props = makeProps();
    renderHook(() => useKeyboardShortcuts(props));
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "T", ctrlKey: true }),
    );
    expect(props.onComposeTweet).toHaveBeenCalledOnce();
  });

  it("T キーだけでは onComposeTweet が呼ばれない", () => {
    const props = makeProps();
    renderHook(() => useKeyboardShortcuts(props));
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "t", ctrlKey: false }),
    );
    expect(props.onComposeTweet).not.toHaveBeenCalled();
  });

  it("Ctrl+A では onComposeTweet が呼ばれない", () => {
    const props = makeProps();
    renderHook(() => useKeyboardShortcuts(props));
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "a", ctrlKey: true }),
    );
    expect(props.onComposeTweet).not.toHaveBeenCalled();
  });

  it("アンマウント後は Ctrl+T を押しても onComposeTweet が呼ばれない", () => {
    const props = makeProps();
    const { unmount } = renderHook(() => useKeyboardShortcuts(props));
    unmount();
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "t", ctrlKey: true }),
    );
    expect(props.onComposeTweet).not.toHaveBeenCalled();
  });

  it("WebView から webview-keyboard-shortcut イベントを受信すると onComposeTweet が呼ばれる", async () => {
    const props = makeProps();
    renderHook(() => useKeyboardShortcuts(props));
    await act(async () => {
      capturedListenCallback?.({ payload: "compose_tweet" });
    });
    expect(props.onComposeTweet).toHaveBeenCalledOnce();
  });

  it("アンマウント後は webview-keyboard-shortcut イベントを受信しても onComposeTweet が呼ばれない", async () => {
    const props = makeProps();
    const { unmount } = renderHook(() => useKeyboardShortcuts(props));
    unmount();
    await act(async () => {
      capturedListenCallback?.({ payload: "compose_tweet" });
    });
    expect(props.onComposeTweet).not.toHaveBeenCalled();
  });

  it("disabled=true のとき Ctrl+T を押しても onComposeTweet が呼ばれない", () => {
    const props = makeProps({ disabled: true });
    renderHook(() => useKeyboardShortcuts(props));
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "t", ctrlKey: true }),
    );
    expect(props.onComposeTweet).not.toHaveBeenCalled();
  });

  it("disabled=true のとき webview イベントを受信しても onComposeTweet が呼ばれない", async () => {
    const props = makeProps({ disabled: true });
    renderHook(() => useKeyboardShortcuts(props));
    await act(async () => {
      capturedListenCallback?.({ payload: "compose_tweet" });
    });
    expect(props.onComposeTweet).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: テストを実行して Red を確認**

```
npx vitest run src/hooks/useKeyboardShortcuts.test.ts
```

期待: 既存 7 テストは PASS、新規 `disabled` 2 テストが FAIL

- [ ] **Step 3: フックのインターフェースと disabled ロジックを追加**

`src/hooks/useKeyboardShortcuts.ts` を以下の内容に **全置換** する:

```typescript
import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { IPC_EVENTS } from "../constants/ipc";

interface KeyboardShortcutsOptions {
  onComposeTweet: () => void;
  onOpenLinkPopup: () => void;
  onAddColumn: () => void;
  onAccountManager: () => void;
  onAppSettings: () => void;
  onToggleTopBar: () => void;
  onJumpToColumn: (index: number) => void;
  disabled?: boolean;
}

export function useKeyboardShortcuts({
  onComposeTweet,
  onOpenLinkPopup,
  onAddColumn,
  onAccountManager,
  onAppSettings,
  onToggleTopBar,
  onJumpToColumn,
  disabled = false,
}: KeyboardShortcutsOptions): void {
  useEffect(() => {
    if (disabled) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;
      const key = e.key.toLowerCase();
      if (key === "t") {
        onComposeTweet();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    onComposeTweet,
    onOpenLinkPopup,
    onAddColumn,
    onAccountManager,
    onAppSettings,
    onToggleTopBar,
    onJumpToColumn,
    disabled,
  ]);

  useEffect(() => {
    if (disabled) return;
    let active = true;
    const unlisten = listen<string>(
      IPC_EVENTS.WEBVIEW_KEYBOARD_SHORTCUT,
      (e) => {
        if (!active) return;
        if (e.payload === "compose_tweet") {
          onComposeTweet();
        }
      },
    );
    return () => {
      active = false;
      unlisten.then((fn) => fn());
    };
  }, [
    onComposeTweet,
    onOpenLinkPopup,
    onAddColumn,
    onAccountManager,
    onAppSettings,
    onToggleTopBar,
    disabled,
  ]);
}
```

- [ ] **Step 4: テストを実行して Green を確認**

```
npx vitest run src/hooks/useKeyboardShortcuts.test.ts
```

期待: 9 tests PASS

- [ ] **Step 5: コミット**

```
git add src/hooks/useKeyboardShortcuts.ts src/hooks/useKeyboardShortcuts.test.ts
git commit -m "refactor: useKeyboardShortcutsをdisabledフラグ対応の新インターフェースに拡張"
```

---

## Task 2: Ctrl+L (onOpenLinkPopup) と Ctrl+N (onAddColumn)

**Files:**

- Modify: `src/hooks/useKeyboardShortcuts.test.ts`
- Modify: `src/hooks/useKeyboardShortcuts.ts`

- [ ] **Step 1: テストを追加（Red）**

`src/hooks/useKeyboardShortcuts.test.ts` の末尾の `});` の直前に以下を追加する:

```typescript
it("Ctrl+L を押すと onOpenLinkPopup が呼ばれる", () => {
  const props = makeProps();
  renderHook(() => useKeyboardShortcuts(props));
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: "l", ctrlKey: true }),
  );
  expect(props.onOpenLinkPopup).toHaveBeenCalledOnce();
});

it("WebView から open_link_popup イベントを受信すると onOpenLinkPopup が呼ばれる", async () => {
  const props = makeProps();
  renderHook(() => useKeyboardShortcuts(props));
  await act(async () => {
    capturedListenCallback?.({ payload: "open_link_popup" });
  });
  expect(props.onOpenLinkPopup).toHaveBeenCalledOnce();
});

it("Ctrl+N を押すと onAddColumn が呼ばれる", () => {
  const props = makeProps();
  renderHook(() => useKeyboardShortcuts(props));
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: "n", ctrlKey: true }),
  );
  expect(props.onAddColumn).toHaveBeenCalledOnce();
});

it("WebView から add_column イベントを受信すると onAddColumn が呼ばれる", async () => {
  const props = makeProps();
  renderHook(() => useKeyboardShortcuts(props));
  await act(async () => {
    capturedListenCallback?.({ payload: "add_column" });
  });
  expect(props.onAddColumn).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: テストを実行して Red を確認**

```
npx vitest run src/hooks/useKeyboardShortcuts.test.ts
```

期待: 4 tests FAIL（onOpenLinkPopup と onAddColumn が未実装）

- [ ] **Step 3: フックにハンドラを追加**

`src/hooks/useKeyboardShortcuts.ts` の `handleKeyDown` 内の `if (key === "t")` ブロックの直後に追加する:

```typescript
if (key === "l") {
  onOpenLinkPopup();
  return;
}
if (key === "n") {
  onAddColumn();
  return;
}
```

また `listen` コールバック内の `if (e.payload === "compose_tweet")` ブロックを以下に置き換える:

```typescript
switch (e.payload) {
  case "compose_tweet":
    onComposeTweet();
    break;
  case "open_link_popup":
    onOpenLinkPopup();
    break;
  case "add_column":
    onAddColumn();
    break;
}
```

- [ ] **Step 4: テストを実行して Green を確認**

```
npx vitest run src/hooks/useKeyboardShortcuts.test.ts
```

期待: 13 tests PASS

- [ ] **Step 5: コミット**

```
git add src/hooks/useKeyboardShortcuts.ts src/hooks/useKeyboardShortcuts.test.ts
git commit -m "feat: Ctrl+L (URLポップアップ) と Ctrl+N (カラム追加) ショートカットを追加"
```

---

## Task 3: Ctrl+Shift+A (onAccountManager)・Ctrl+, (onAppSettings)・Ctrl+B (onToggleTopBar)

**Files:**

- Modify: `src/hooks/useKeyboardShortcuts.test.ts`
- Modify: `src/hooks/useKeyboardShortcuts.ts`

- [ ] **Step 1: テストを追加（Red）**

`src/hooks/useKeyboardShortcuts.test.ts` の末尾の `});` の直前に以下を追加する:

```typescript
it("Ctrl+Shift+A を押すと onAccountManager が呼ばれる", () => {
  const props = makeProps();
  renderHook(() => useKeyboardShortcuts(props));
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: "a", ctrlKey: true, shiftKey: true }),
  );
  expect(props.onAccountManager).toHaveBeenCalledOnce();
});

it("Ctrl+A（Shift なし）では onAccountManager が呼ばれない", () => {
  const props = makeProps();
  renderHook(() => useKeyboardShortcuts(props));
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: "a", ctrlKey: true, shiftKey: false }),
  );
  expect(props.onAccountManager).not.toHaveBeenCalled();
});

it("WebView から account_manager イベントを受信すると onAccountManager が呼ばれる", async () => {
  const props = makeProps();
  renderHook(() => useKeyboardShortcuts(props));
  await act(async () => {
    capturedListenCallback?.({ payload: "account_manager" });
  });
  expect(props.onAccountManager).toHaveBeenCalledOnce();
});

it("Ctrl+, を押すと onAppSettings が呼ばれる", () => {
  const props = makeProps();
  renderHook(() => useKeyboardShortcuts(props));
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: ",", ctrlKey: true }),
  );
  expect(props.onAppSettings).toHaveBeenCalledOnce();
});

it("WebView から app_settings イベントを受信すると onAppSettings が呼ばれる", async () => {
  const props = makeProps();
  renderHook(() => useKeyboardShortcuts(props));
  await act(async () => {
    capturedListenCallback?.({ payload: "app_settings" });
  });
  expect(props.onAppSettings).toHaveBeenCalledOnce();
});

it("Ctrl+B を押すと onToggleTopBar が呼ばれる", () => {
  const props = makeProps();
  renderHook(() => useKeyboardShortcuts(props));
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: "b", ctrlKey: true }),
  );
  expect(props.onToggleTopBar).toHaveBeenCalledOnce();
});

it("WebView から toggle_top_bar イベントを受信すると onToggleTopBar が呼ばれる", async () => {
  const props = makeProps();
  renderHook(() => useKeyboardShortcuts(props));
  await act(async () => {
    capturedListenCallback?.({ payload: "toggle_top_bar" });
  });
  expect(props.onToggleTopBar).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: テストを実行して Red を確認**

```
npx vitest run src/hooks/useKeyboardShortcuts.test.ts
```

期待: 7 tests FAIL（3 アクション未実装）

- [ ] **Step 3: フックにハンドラを追加**

`useKeyboardShortcuts.ts` の `handleKeyDown` 内の `if (key === "n")` ブロックの直後に追加:

```typescript
if (key === "a" && e.shiftKey) {
  onAccountManager();
  return;
}
if (key === ",") {
  onAppSettings();
  return;
}
if (key === "b") {
  onToggleTopBar();
  return;
}
```

`listen` コールバック内の `switch` に以下の `case` を追加:

```typescript
          case "account_manager":
            onAccountManager();
            break;
          case "app_settings":
            onAppSettings();
            break;
          case "toggle_top_bar":
            onToggleTopBar();
            break;
```

- [ ] **Step 4: テストを実行して Green を確認**

```
npx vitest run src/hooks/useKeyboardShortcuts.test.ts
```

期待: 20 tests PASS

- [ ] **Step 5: コミット**

```
git add src/hooks/useKeyboardShortcuts.ts src/hooks/useKeyboardShortcuts.test.ts
git commit -m "feat: Ctrl+Shift+A / Ctrl+, / Ctrl+B ショートカットを追加"
```

---

## Task 4: Ctrl+1〜9 (onJumpToColumn)

**Files:**

- Modify: `src/hooks/useKeyboardShortcuts.test.ts`
- Modify: `src/hooks/useKeyboardShortcuts.ts`

- [ ] **Step 1: テストを追加（Red）**

`src/hooks/useKeyboardShortcuts.test.ts` の末尾の `});` の直前に以下を追加する:

```typescript
it("Ctrl+1 を押すと onJumpToColumn(0) が呼ばれる", () => {
  const props = makeProps();
  renderHook(() => useKeyboardShortcuts(props));
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: "1", ctrlKey: true }),
  );
  expect(props.onJumpToColumn).toHaveBeenCalledWith(0);
});

it("Ctrl+5 を押すと onJumpToColumn(4) が呼ばれる", () => {
  const props = makeProps();
  renderHook(() => useKeyboardShortcuts(props));
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: "5", ctrlKey: true }),
  );
  expect(props.onJumpToColumn).toHaveBeenCalledWith(4);
});

it("Ctrl+9 を押すと onJumpToColumn(8) が呼ばれる", () => {
  const props = makeProps();
  renderHook(() => useKeyboardShortcuts(props));
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: "9", ctrlKey: true }),
  );
  expect(props.onJumpToColumn).toHaveBeenCalledWith(8);
});

it("Ctrl+0 では onJumpToColumn が呼ばれない", () => {
  const props = makeProps();
  renderHook(() => useKeyboardShortcuts(props));
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: "0", ctrlKey: true }),
  );
  expect(props.onJumpToColumn).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: テストを実行して Red を確認**

```
npx vitest run src/hooks/useKeyboardShortcuts.test.ts
```

期待: 4 tests FAIL（Ctrl+1-9 未実装）

- [ ] **Step 3: フックにハンドラを追加**

`useKeyboardShortcuts.ts` の `handleKeyDown` 内の `if (key === "b")` ブロックの直後に追加:

```typescript
const digit = parseInt(e.key, 10);
if (digit >= 1 && digit <= 9) {
  onJumpToColumn(digit - 1);
}
```

- [ ] **Step 4: テストを実行して Green を確認**

```
npx vitest run src/hooks/useKeyboardShortcuts.test.ts
```

期待: 24 tests PASS

- [ ] **Step 5: コミット**

```
git add src/hooks/useKeyboardShortcuts.ts src/hooks/useKeyboardShortcuts.test.ts
git commit -m "feat: Ctrl+1-9 でカラムジャンプするショートカットを追加"
```

---

## Task 5: inject スクリプト更新（WebView フォーカス時の転送）

**Files:**

- Modify: `src-tauri/src/inject/keyboard_shortcut.js`

- [ ] **Step 1: keyboard_shortcut.js を全置換する**

`src-tauri/src/inject/keyboard_shortcut.js` を以下の内容に **全置換** する:

```javascript
const REPORT_KEYBOARD_SHORTCUT = "report_keyboard_shortcut";
(function () {
  window.addEventListener(
    "keydown",
    function (e) {
      if (!e.ctrlKey) return;
      var key = e.key.toLowerCase();
      var shortcutKey = null;
      if (key === "t") shortcutKey = "compose_tweet";
      else if (key === "l") shortcutKey = "open_link_popup";
      else if (key === "n") shortcutKey = "add_column";
      else if (key === "a" && e.shiftKey) shortcutKey = "account_manager";
      else if (key === ",") shortcutKey = "app_settings";
      else if (key === "b") shortcutKey = "toggle_top_bar";
      if (!shortcutKey) return;
      e.preventDefault();
      var invoke = window.__TAURI__?.core?.invoke ?? window.__TAURI__?.invoke;
      if (invoke) {
        invoke(REPORT_KEYBOARD_SHORTCUT, { key: shortcutKey }).catch(
          function () {},
        );
      }
    },
    true,
  );
})();
```

- [ ] **Step 2: 全テストを実行して既存テストが壊れていないことを確認**

```
npx vitest run
```

期待: 24 tests PASS（テストは inject スクリプトを直接テストしないので変化なし）

- [ ] **Step 3: Rust ビルドを確認**

```
cargo build --manifest-path src-tauri/Cargo.toml
```

期待: warning のみ、エラーなし

- [ ] **Step 4: コミット**

```
git add src-tauri/src/inject/keyboard_shortcut.js
git commit -m "feat: keyboard_shortcut.jsにCtrl+L/N/Shift+A/,/Bの転送を追加"
```

---

## Task 6: App.tsx の更新

**Files:**

- Modify: `src/App.tsx`

- [ ] **Step 1: `handleJumpToColumnByIndex` を追加する**

`src/App.tsx` の `handleJumpToColumn` の `useCallback` の直後に以下を追加する:

```typescript
const handleJumpToColumnByIndex = useCallback(
  (index: number) => {
    const sorted = [...columns].sort((a, b) => a.order - b.order);
    const col = sorted[index];
    if (col) handleJumpToColumn(col.id);
  },
  [columns, handleJumpToColumn],
);
```

- [ ] **Step 2: ダイアログ用コールバックを抽出する**

`src/App.tsx` の `handleJumpToColumnByIndex` の直後に以下を追加する:

```typescript
const handleOpenAddColumnDialog = useCallback(() => {
  setShowAddColumn(true);
}, [setShowAddColumn]);

const handleOpenAccountManager = useCallback(() => {
  setShowAccountManager(true);
}, [setShowAccountManager]);

const handleOpenAppSettings = useCallback(() => {
  setShowAppSettings(true);
}, [setShowAppSettings]);
```

- [ ] **Step 3: useKeyboardShortcuts の呼び出しを更新する**

`src/App.tsx` の以下の行を:

```typescript
useKeyboardShortcuts({ onComposeTweet: handleComposeTweet });
```

以下に置き換える:

```typescript
useKeyboardShortcuts({
  onComposeTweet: handleComposeTweet,
  onOpenLinkPopup: handleOpenLinkPopup,
  onAddColumn: handleOpenAddColumnDialog,
  onAccountManager: handleOpenAccountManager,
  onAppSettings: handleOpenAppSettings,
  onToggleTopBar: handleToggleTopBar,
  onJumpToColumn: handleJumpToColumnByIndex,
  disabled: dialogOpen,
});
```

- [ ] **Step 4: 全テストを実行して Green を確認**

```
npx vitest run
```

期待: 全テスト PASS

- [ ] **Step 5: Rust ビルドを確認**

```
cargo build --manifest-path src-tauri/Cargo.toml
```

期待: warning のみ、エラーなし

- [ ] **Step 6: コミット**

```
git add src/App.tsx
git commit -m "feat: App.tsxにショートカット用コールバックとdialogOpen無効化を追加"
```
