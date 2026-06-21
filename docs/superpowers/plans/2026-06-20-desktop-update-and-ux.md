# デスクトップ自動更新 + 更新UX 実装計画（サブプロジェクト2）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** デスクトップ（Win/Linux）で、起動時自動チェック + 設定画面の手動チェックにより更新ポップアップを表示し、「更新する/後で」を選べる自動更新を実装する。「後で」はそのバージョンを再通知せず、新バージョン or 手動確認で再表示する。

**Architecture:** プラットフォーム差を `src/services/updater.ts` の `Updater` インターフェース背後に隠蔽（desktop 実装 + mobile スタブ）。`useAppUpdater` フックが起動時/手動チェック・再通知判定・インストールを統括し、`UpdateDialog` が UI を担う。再通知記録は localStorage。

**Tech Stack:** React 19, `@tauri-apps/plugin-updater`, `@tauri-apps/plugin-process`, `@tauri-apps/api/app`(getVersion), Vitest。

## Global Constraints

- 対象は desktop の更新（mobile 実装はサブプロジェクト3で行い、本計画では mobile はスタブ）。
- 更新エンドポイント・署名はサブプロジェクト1で構成済み（`latest.json`）。
- テストケース名は日本語。var 不使用。TDD。作業毎コミット。
- ダイアログ表示中は既存 `dialogOpen` 機構に統合し、Android では WebView 退避（本計画では desktop 主眼だが UX 配線は共通）。
- 再通知記録キーは localStorage `mcx_dismissedUpdateVersion`。

---

## File Structure

- Create: `src/services/updater.ts` — `Updater` interface・desktop 実装・mobile スタブ・`createUpdater(isMobile)`。
- Create: `src/services/updater.test.ts` — desktop 実装のテスト（plugin をモック）。
- Create: `src/lib/updatePrompt.ts` — 純粋関数 `shouldAutoPrompt(version, dismissed)`。
- Create: `src/lib/updatePrompt.test.ts`。
- Create: `src/hooks/useAppUpdater.ts` — チェック/判定/インストール統括。
- Create: `src/hooks/useAppUpdater.test.ts`。
- Create: `src/components/UpdateDialog/UpdateDialog.tsx` + `.module.scss`。
- Create: `src/components/UpdateDialog/UpdateDialog.test.tsx`。
- Modify: `src/constants/ipc.ts` — `STORAGE_KEYS.DISMISSED_UPDATE_VERSION` 追加。
- Modify: `src/components/AppSettingsPanel/AppSettingsPanel.tsx` — 「更新を確認」ボタン + 現在バージョン表示。
- Modify: `src/App.tsx` — `useAppUpdater` 配線・`UpdateDialog` レンダリング・`dialogOpen` 統合。

---

### Task 1: localStorage キー追加

**Files:** Modify: `src/constants/ipc.ts`

- [ ] **Step 1: STORAGE_KEYS に追加**

```ts
export const STORAGE_KEYS = {
  /** モバイルのアクティブカラム ID（バックグラウンド復帰後の復元用） */
  ACTIVE_COLUMN_ID: "mcx_activeColumnId",
  /** 「後で」で見送った更新バージョン（再通知抑制用） */
  DISMISSED_UPDATE_VERSION: "mcx_dismissedUpdateVersion",
} as const;
```

- [ ] **Step 2: コミット** `git add -A && git commit -m "feat: 更新見送りバージョン用のlocalStorageキーを追加"`

---

### Task 2: 再通知判定の純粋関数

**Files:** Create: `src/lib/updatePrompt.ts`, `src/lib/updatePrompt.test.ts`

**Interfaces:**

- Produces: `shouldAutoPrompt(version: string, dismissed: string | null): boolean`

- [ ] **Step 1: 失敗するテストを書く**

```ts
import { describe, expect, it } from "vitest";
import { shouldAutoPrompt } from "./updatePrompt";

describe("shouldAutoPrompt", () => {
  it("見送り記録が無ければ表示する", () => {
    expect(shouldAutoPrompt("1.2.0", null)).toBe(true);
  });
  it("見送ったバージョンと同じなら表示しない", () => {
    expect(shouldAutoPrompt("1.2.0", "1.2.0")).toBe(false);
  });
  it("見送ったバージョンと異なれば表示する", () => {
    expect(shouldAutoPrompt("1.3.0", "1.2.0")).toBe(true);
  });
});
```

- [ ] **Step 2: 失敗確認** `npx vitest run src/lib/updatePrompt.test.ts` → FAIL（未定義）

- [ ] **Step 3: 実装**

```ts
/** 起動時の自動チェックでダイアログを表示すべきか。見送り済みバージョンは抑制する。 */
export function shouldAutoPrompt(
  version: string,
  dismissed: string | null,
): boolean {
  return version !== dismissed;
}
```

- [ ] **Step 4: 成功確認** `npx vitest run src/lib/updatePrompt.test.ts` → PASS

- [ ] **Step 5: コミット** `git add -A && git commit -m "feat: 更新の再通知判定(shouldAutoPrompt)を追加"`

---

### Task 3: Updater サービス（interface + desktop 実装 + mobile スタブ）

**Files:** Create: `src/services/updater.ts`, `src/services/updater.test.ts`

**Interfaces:**

- Produces:
  - `interface AppUpdate { version: string; notes?: string }`
  - `interface Updater { check(): Promise<AppUpdate | null>; install(): Promise<void> }`
  - `createUpdater(isMobile: boolean): Updater`

- [ ] **Step 1: 失敗するテストを書く（desktop 実装）**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { createUpdater } from "./updater";

vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));

describe("desktop updater", () => {
  beforeEach(() => vi.clearAllMocks());

  it("更新があればversionとnotesを返す", async () => {
    vi.mocked(check).mockResolvedValue({
      version: "1.2.0",
      body: "fixes",
      downloadAndInstall: vi.fn().mockResolvedValue(undefined),
    } as never);
    const u = createUpdater(false);
    expect(await u.check()).toEqual({ version: "1.2.0", notes: "fixes" });
  });

  it("更新が無ければnullを返す", async () => {
    vi.mocked(check).mockResolvedValue(null as never);
    const u = createUpdater(false);
    expect(await u.check()).toBeNull();
  });

  it("installはcheckで得た更新をdownloadAndInstallしrelaunchする", async () => {
    const dl = vi.fn().mockResolvedValue(undefined);
    vi.mocked(check).mockResolvedValue({
      version: "1.2.0",
      body: "",
      downloadAndInstall: dl,
    } as never);
    vi.mocked(relaunch).mockResolvedValue(undefined as never);
    const u = createUpdater(false);
    await u.check();
    await u.install();
    expect(dl).toHaveBeenCalledOnce();
    expect(relaunch).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: 失敗確認** `npx vitest run src/services/updater.test.ts` → FAIL

- [ ] **Step 3: 実装**

```ts
import { check } from "@tauri-apps/plugin-updater";
import type { Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export interface AppUpdate {
  version: string;
  notes?: string;
}

export interface Updater {
  /** 更新があれば情報を返す。無ければ null。 */
  check(): Promise<AppUpdate | null>;
  /** 直近の check() で見つかった更新を適用する。 */
  install(): Promise<void>;
}

function createDesktopUpdater(): Updater {
  let pending: Update | null = null;
  return {
    async check() {
      pending = await check();
      if (!pending) return null;
      return { version: pending.version, notes: pending.body || undefined };
    },
    async install() {
      if (!pending) return;
      await pending.downloadAndInstall();
      await relaunch();
    },
  };
}

// モバイル実装はサブプロジェクト3で差し替える。
function createMobileUpdater(): Updater {
  return {
    async check() {
      return null;
    },
    async install() {},
  };
}

export function createUpdater(isMobile: boolean): Updater {
  return isMobile ? createMobileUpdater() : createDesktopUpdater();
}
```

- [ ] **Step 4: 成功確認** `npx vitest run src/services/updater.test.ts` → PASS

- [ ] **Step 5: コミット** `git add -A && git commit -m "feat: 更新サービス(Updater interface/desktop実装)を追加"`

---

### Task 4: useAppUpdater フック

**Files:** Create: `src/hooks/useAppUpdater.ts`, `src/hooks/useAppUpdater.test.ts`

**Interfaces:**

- Consumes: `createUpdater`, `shouldAutoPrompt`, `STORAGE_KEYS.DISMISSED_UPDATE_VERSION`。
- Produces: `useAppUpdater(isMobile: boolean): { available: AppUpdate | null; checking: boolean; installing: boolean; manualResult: "idle" | "none" | "error"; checkManually(): Promise<void>; install(): Promise<void>; dismiss(): void }`

- [ ] **Step 1: 失敗するテストを書く**

```ts
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createUpdater } from "../services/updater";
import { useAppUpdater } from "./useAppUpdater";

vi.mock("../services/updater", () => ({ createUpdater: vi.fn() }));

describe("useAppUpdater", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("起動時に更新があればavailableに反映する", async () => {
    vi.mocked(createUpdater).mockReturnValue({
      check: vi.fn().mockResolvedValue({ version: "1.2.0" }),
      install: vi.fn(),
    });
    const { result } = renderHook(() => useAppUpdater(false));
    await waitFor(() =>
      expect(result.current.available).toEqual({ version: "1.2.0" }),
    );
  });

  it("見送り済みバージョンは起動時に表示しない", async () => {
    localStorage.setItem("mcx_dismissedUpdateVersion", "1.2.0");
    vi.mocked(createUpdater).mockReturnValue({
      check: vi.fn().mockResolvedValue({ version: "1.2.0" }),
      install: vi.fn(),
    });
    const { result } = renderHook(() => useAppUpdater(false));
    await waitFor(() => expect(result.current.checking).toBe(false));
    expect(result.current.available).toBeNull();
  });

  it("dismissで見送りを記録しavailableを消す", async () => {
    vi.mocked(createUpdater).mockReturnValue({
      check: vi.fn().mockResolvedValue({ version: "1.2.0" }),
      install: vi.fn(),
    });
    const { result } = renderHook(() => useAppUpdater(false));
    await waitFor(() => expect(result.current.available).not.toBeNull());
    act(() => result.current.dismiss());
    expect(result.current.available).toBeNull();
    expect(localStorage.getItem("mcx_dismissedUpdateVersion")).toBe("1.2.0");
  });

  it("checkManualは見送り済みでも更新を表示する", async () => {
    localStorage.setItem("mcx_dismissedUpdateVersion", "1.2.0");
    vi.mocked(createUpdater).mockReturnValue({
      check: vi.fn().mockResolvedValue({ version: "1.2.0" }),
      install: vi.fn(),
    });
    const { result } = renderHook(() => useAppUpdater(false));
    await waitFor(() => expect(result.current.checking).toBe(false));
    await act(async () => await result.current.checkManually());
    expect(result.current.available).toEqual({ version: "1.2.0" });
  });

  it("checkManualで更新が無ければmanualResultがnoneになる", async () => {
    vi.mocked(createUpdater).mockReturnValue({
      check: vi.fn().mockResolvedValue(null),
      install: vi.fn(),
    });
    const { result } = renderHook(() => useAppUpdater(false));
    await waitFor(() => expect(result.current.checking).toBe(false));
    await act(async () => await result.current.checkManually());
    expect(result.current.manualResult).toBe("none");
  });
});
```

- [ ] **Step 2: 失敗確認** `npx vitest run src/hooks/useAppUpdater.test.ts` → FAIL

- [ ] **Step 3: 実装**

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { STORAGE_KEYS } from "../constants/ipc";
import { logError } from "../lib/log";
import { shouldAutoPrompt } from "../lib/updatePrompt";
import { createUpdater, type AppUpdate } from "../services/updater";

type ManualResult = "idle" | "none" | "error";

function readDismissed(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.DISMISSED_UPDATE_VERSION);
  } catch {
    return null;
  }
}

export function useAppUpdater(isMobile: boolean) {
  const updater = useMemo(() => createUpdater(isMobile), [isMobile]);
  const [available, setAvailable] = useState<AppUpdate | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [manualResult, setManualResult] = useState<ManualResult>("idle");
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    setChecking(true);
    updater
      .check()
      .then((upd) => {
        if (upd && shouldAutoPrompt(upd.version, readDismissed())) {
          setAvailable(upd);
        }
      })
      .catch(logError("useAppUpdater:startupCheck"))
      .finally(() => setChecking(false));
  }, [updater]);

  const checkManually = useCallback(async () => {
    setChecking(true);
    setManualResult("idle");
    try {
      const upd = await updater.check();
      if (upd) {
        setAvailable(upd);
      } else {
        setManualResult("none");
      }
    } catch (e) {
      logError("useAppUpdater:checkManually")(e);
      setManualResult("error");
    } finally {
      setChecking(false);
    }
  }, [updater]);

  const install = useCallback(async () => {
    setInstalling(true);
    try {
      await updater.install();
    } catch (e) {
      logError("useAppUpdater:install")(e);
    } finally {
      setInstalling(false);
    }
  }, [updater]);

  const dismiss = useCallback(() => {
    if (available) {
      try {
        localStorage.setItem(
          STORAGE_KEYS.DISMISSED_UPDATE_VERSION,
          available.version,
        );
      } catch {}
    }
    setAvailable(null);
  }, [available]);

  return {
    available,
    checking,
    installing,
    manualResult,
    checkManually,
    install,
    dismiss,
  };
}
```

- [ ] **Step 4: 成功確認** `npx vitest run src/hooks/useAppUpdater.test.ts` → PASS

- [ ] **Step 5: コミット** `git add -A && git commit -m "feat: useAppUpdater(起動時/手動チェック・再通知・インストール)を追加"`

---

### Task 5: UpdateDialog コンポーネント

**Files:** Create: `src/components/UpdateDialog/UpdateDialog.tsx`, `UpdateDialog.module.scss`, `UpdateDialog.test.tsx`

**Interfaces:**

- Consumes: `AppUpdate`。
- Produces: `UpdateDialog` props `{ update: AppUpdate; installing: boolean; onInstall(): void; onLater(): void }`。

- [ ] **Step 1: 失敗するテストを書く**

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UpdateDialog } from "./UpdateDialog";

describe("UpdateDialog", () => {
  const update = { version: "1.2.0", notes: "バグ修正" };

  it("新バージョンとリリースノートを表示する", () => {
    render(
      <UpdateDialog
        update={update}
        installing={false}
        onInstall={vi.fn()}
        onLater={vi.fn()}
      />,
    );
    expect(screen.getByText(/1\.2\.0/)).toBeInTheDocument();
    expect(screen.getByText(/バグ修正/)).toBeInTheDocument();
  });

  it("更新するでonInstallを呼ぶ", () => {
    const onInstall = vi.fn();
    render(
      <UpdateDialog
        update={update}
        installing={false}
        onInstall={onInstall}
        onLater={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "更新する" }));
    expect(onInstall).toHaveBeenCalledOnce();
  });

  it("後でonLaterを呼ぶ", () => {
    const onLater = vi.fn();
    render(
      <UpdateDialog
        update={update}
        installing={false}
        onInstall={vi.fn()}
        onLater={onLater}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "後で" }));
    expect(onLater).toHaveBeenCalledOnce();
  });

  it("installing中はボタンを無効化する", () => {
    render(
      <UpdateDialog
        update={update}
        installing={true}
        onInstall={vi.fn()}
        onLater={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /更新/ })).toBeDisabled();
  });
});
```

- [ ] **Step 2: 失敗確認** → FAIL

- [ ] **Step 3: 実装（既存 AddColumnDialog の overlay/dialog スタイルに準拠）**

```tsx
import React from "react";
import type { AppUpdate } from "../../services/updater";
import styles from "./UpdateDialog.module.scss";

interface Props {
  update: AppUpdate;
  installing: boolean;
  onInstall: () => void;
  onLater: () => void;
}

export const UpdateDialog: React.FC<Props> = ({
  update,
  installing,
  onInstall,
  onLater,
}) => {
  return (
    <div className={styles.overlay}>
      <div className={styles.dialog}>
        <h2 className={styles.title}>新しいバージョンがあります</h2>
        <p className={styles.version}>バージョン {update.version}</p>
        {update.notes && <pre className={styles.notes}>{update.notes}</pre>}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.laterBtn}
            onClick={onLater}
            disabled={installing}
          >
            後で
          </button>
          <button
            type="button"
            className={styles.installBtn}
            onClick={onInstall}
            disabled={installing}
          >
            {installing ? "更新中..." : "更新する"}
          </button>
        </div>
      </div>
    </div>
  );
};
```

`.module.scss`（AddColumnDialog.module.scss の overlay/dialog/actions を参考に最小定義）:

```scss
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.dialog {
  background: var(--color-bg, #fff);
  color: var(--color-text, #000);
  border-radius: 8px;
  padding: 20px;
  width: min(420px, 90vw);
  max-height: 80vh;
  overflow: auto;
}
.title {
  margin: 0 0 12px;
  font-size: 1.1rem;
}
.version {
  margin: 0 0 8px;
  font-weight: bold;
}
.notes {
  white-space: pre-wrap;
  background: rgba(127, 127, 127, 0.1);
  padding: 8px;
  border-radius: 4px;
  max-height: 40vh;
  overflow: auto;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
.laterBtn,
.installBtn {
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
}
.installBtn {
  background: #1d9bf0;
  color: #fff;
  border: none;
}
.installBtn:disabled {
  opacity: 0.6;
  cursor: default;
}
```

- [ ] **Step 4: 成功確認** → PASS

- [ ] **Step 5: コミット** `git add -A && git commit -m "feat: 更新ポップアップ(UpdateDialog)を追加"`

---

### Task 6: AppSettingsPanel に「更新を確認」ボタン

**Files:** Modify: `src/components/AppSettingsPanel/AppSettingsPanel.tsx`

**Interfaces:**

- Consumes: 親（App）から `onCheckUpdate(): void`, `appVersion: string`, `checking: boolean`, `manualResult: "idle"|"none"|"error"` を props で受ける（または useAppUpdater を直接利用）。本計画では props 経由で渡す。

- [ ] **Step 1: AppSettingsPanel の Props に項目追加**

`AppSettingsPanelProps` に以下を追加:

```ts
  appVersion: string;
  updateChecking: boolean;
  updateManualResult: "idle" | "none" | "error";
  onCheckUpdate: () => void;
```

- [ ] **Step 2: UI セクションを追加（パネル内の適切な場所、例: 最下部の section として）**

```tsx
<section className={styles.section}>
  <h3>アプリ情報</h3>
  <p>現在のバージョン: {appVersion}</p>
  <button type="button" onClick={onCheckUpdate} disabled={updateChecking}>
    {updateChecking ? "確認中..." : "更新を確認"}
  </button>
  {updateManualResult === "none" && <span>最新です</span>}
  {updateManualResult === "error" && <span>確認に失敗しました</span>}
</section>
```

> `styles.section` 等のクラスは既存パネルの命名に合わせる（実ファイルを確認して既存パターンに準拠）。

- [ ] **Step 3: 既存テスト（AppSettingsPanel.test.tsx）の必須 props 追加に対応**

`AppSettingsPanel.test.tsx` のレンダリングに新規 props のダミー値を追加し、テストを通す。

- [ ] **Step 4: 確認** `npx vitest run src/components/AppSettingsPanel` → PASS

- [ ] **Step 5: コミット** `git add -A && git commit -m "feat: アプリ設定に更新確認ボタンとバージョン表示を追加"`

---

### Task 7: App.tsx 配線

**Files:** Modify: `src/App.tsx`

**Interfaces:**

- Consumes: `useAppUpdater`, `UpdateDialog`, `getVersion`。

- [ ] **Step 1: フック・バージョン取得・ダイアログ統合**

- `import { useAppUpdater } from "./hooks/useAppUpdater";`
- `import { UpdateDialog } from "./components/UpdateDialog/UpdateDialog";`
- `import { getVersion } from "@tauri-apps/api/app";`
- `const updater = useAppUpdater(isMobile);`
- `const [appVersion, setAppVersion] = useState("");` + `useEffect(() => { getVersion().then(setAppVersion).catch(logError("getVersion")); }, []);`
- 既存 `dialogOpen` 効果に更新ダイアログを統合するため、退避制御を `dialogOpen || !!updater.available` で行うよう effect の依存と条件を更新する。

```tsx
useEffect(() => {
  const anyOpen = dialogOpen || !!updater.available;
  setDialogOpen(anyOpen);
  if (anyOpen) {
    hideColumnWebviews();
  } else {
    recalculateAllBounds();
  }
}, [dialogOpen, updater.available]);
```

- [ ] **Step 2: AppSettingsPanel に props を渡す**

```tsx
appVersion={appVersion}
updateChecking={updater.checking}
updateManualResult={updater.manualResult}
onCheckUpdate={updater.checkManually}
```

- [ ] **Step 3: UpdateDialog をレンダリング（return 内の末尾）**

```tsx
{
  updater.available && (
    <UpdateDialog
      update={updater.available}
      installing={updater.installing}
      onInstall={updater.install}
      onLater={updater.dismiss}
    />
  );
}
```

- [ ] **Step 4: 型チェック & テスト** `npm run build`（tsc）→ エラー無し、`npm test` → 全 PASS

- [ ] **Step 5: コミット** `git add -A && git commit -m "feat: Appに更新チェック配線とUpdateDialogを統合"`

---

### Task 8: 仕上げ（フォーマット・全テスト）

- [ ] **Step 1: フォーマット** `npm run format:ts`
- [ ] **Step 2: 全テスト** `npm test` → 全 PASS
- [ ] **Step 3: 型チェック** `npm run build` → 成功
- [ ] **Step 4: コミット**（差分があれば）

---

## Self-Review（spec 突合）

- §4.1 updater プラグイン/config → SP1 で完了。本計画は JS 側依存（導入済み）。
- §4.2 check→install→relaunch → Task 3 desktop 実装（OK）。
- §6.1 UpdateDialog / useAppUpdater / 設定ボタン → Task 4/5/6（OK）。
- §6.1 dialogOpen 統合・WebView 退避 → Task 7 Step1（OK）。
- §6.2 再通知ルール（dismissed・手動は無視）→ Task 2/4（OK）。
- §6.3 サービスインターフェース → Task 3（OK。mobile スタブはサブプロジェクト3で実装）。

未確定: AppSettingsPanel の既存クラス名（実ファイル確認で準拠）、現在バージョン取得は `@tauri-apps/api/app` getVersion。
