import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BackupContent } from "@/lib/backupRestore";
import * as backup from "@/services/backup";
import { useAppStore } from "@/store/useAppStore";
import { DEFAULT_COLUMN_SETTINGS, DEFAULT_GLOBAL_SETTINGS } from "@/types";
import type { Account, Column } from "@/types";
import { useBackupFlow } from "./useBackupFlow";

vi.mock("@/services/backup", () => ({
  exportBackup: vi.fn(),
  readBackup: vi.fn(),
  backfillXUserIds: vi.fn(),
  performRestore: vi.fn(),
}));

const mocked = vi.mocked(backup);

const targetAccount: Account = {
  id: "t1",
  label: "復元先",
  dataDirectory: "/data/t1",
  color: "#000",
  createdAt: "2026-01-01T00:00:00Z",
  xUserId: "100",
};

function column(id: string, accountId: string): Column {
  return {
    id,
    accountId,
    pageType: "home",
    width: 350,
    order: 0,
    gridRow: 1,
    gridCol: 1,
    heightMode: "auto",
    settings: DEFAULT_COLUMN_SETTINGS,
  };
}

const {
  windowBounds: _windowBounds,
  pendingDataDirectoryDeletions: _pending,
  ...portable
} = DEFAULT_GLOBAL_SETTINGS;

const content: BackupContent = {
  accounts: [
    { backupAccountId: "A", label: "A", color: "#111", xUserId: "100" },
    { backupAccountId: "B", label: "B", color: "#222" },
  ],
  columns: [column("a1", "A")],
  globalSettings: portable,
};

const replace = vi.fn(async (apply: () => void) => apply());

function setup() {
  const onRestored = vi.fn();
  const hook = renderHook(() => useBackupFlow(replace, onRestored));
  return { ...hook, onRestored };
}

async function pick(result: ReturnType<typeof setup>["result"]) {
  await act(async () => {
    await result.current.pickFile();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked.backfillXUserIds.mockResolvedValue(undefined);
  useAppStore.setState({
    accounts: [targetAccount],
    settingsSaveBlocked: false,
  });
});

describe("useBackupFlow 読み込み", () => {
  it("ファイル選択に成功すると紐づけ画面へ進み、Xユーザー IDが一致する復元先が初期選択される", async () => {
    mocked.readBackup.mockResolvedValue(content);
    const { result } = setup();

    await pick(result);

    expect(result.current.step).toBe("mapping");
    expect(result.current.mapping).toEqual({ A: "t1", B: null });
  });

  it("初期候補の計算の前に既存アカウントの Xユーザー ID を補完する", async () => {
    mocked.readBackup.mockResolvedValue(content);
    mocked.backfillXUserIds.mockImplementation(async () => {
      useAppStore.setState({
        accounts: [{ ...targetAccount, xUserId: "100" }],
      });
    });
    useAppStore.setState({
      accounts: [{ ...targetAccount, xUserId: undefined }],
    });
    const { result } = setup();

    await pick(result);

    expect(result.current.mapping.A).toBe("t1");
  });

  it("選択をキャンセルしたら何も変わらない", async () => {
    mocked.readBackup.mockResolvedValue(null);
    const { result } = setup();

    await pick(result);

    expect(result.current.step).toBe("idle");
    expect(result.current.message).toBeNull();
  });

  it("将来バージョンのファイルは更新を促すメッセージを出し、紐づけ画面へ進まない", async () => {
    mocked.readBackup.mockRejectedValue({
      kind: "futureVersion",
      found: 2,
      current: 1,
    });
    const { result } = setup();

    await pick(result);

    expect(result.current.step).toBe("idle");
    expect(result.current.message?.kind).toBe("error");
    expect(result.current.message?.text).toContain("アプリを更新してください");
    expect(result.current.message?.text).toContain("変更されていません");
  });
});

describe("useBackupFlow 書き出し", () => {
  it("書き出しに成功すると完了メッセージを出す", async () => {
    mocked.exportBackup.mockResolvedValue(true);
    const { result } = setup();

    await act(async () => {
      await result.current.exportToFile();
    });

    expect(result.current.message?.kind).toBe("success");
  });

  it("保存先の選択をキャンセルしたらメッセージを出さない", async () => {
    mocked.exportBackup.mockResolvedValue(false);
    const { result } = setup();

    await act(async () => {
      await result.current.exportToFile();
    });

    expect(result.current.message).toBeNull();
  });

  it("書き出しに失敗したらエラーメッセージを出す", async () => {
    mocked.exportBackup.mockRejectedValue({ kind: "io", message: "disk full" });
    const { result } = setup();

    await act(async () => {
      await result.current.exportToFile();
    });

    expect(result.current.message?.kind).toBe("error");
  });
});

describe("useBackupFlow 復元", () => {
  async function toConfirm(result: ReturnType<typeof setup>["result"]) {
    mocked.readBackup.mockResolvedValue(content);
    await pick(result);
    act(() => result.current.proceedToConfirm());
  }

  it("紐づけを変更して確認へ進み、確認後に performRestore へ紐づけを渡す", async () => {
    mocked.performRestore.mockResolvedValue({ status: "ok" });
    const { result, onRestored } = setup();
    mocked.readBackup.mockResolvedValue(content);
    await pick(result);
    act(() => result.current.changeMapping("B", "t1"));
    act(() => result.current.proceedToConfirm());
    expect(result.current.step).toBe("confirm");

    await act(async () => {
      await result.current.execute();
    });

    expect(mocked.performRestore).toHaveBeenCalledWith(
      content,
      { A: "t1", B: "t1" },
      replace,
    );
    expect(onRestored).toHaveBeenCalledTimes(1);
    expect(result.current.step).toBe("idle");
  });

  it("確認画面を経ずに復元を実行しても、内容が未選択なら何もしない", async () => {
    const { result } = setup();

    await act(async () => {
      await result.current.execute();
    });

    expect(mocked.performRestore).not.toHaveBeenCalled();
  });

  it("復元が拒否されたら確認画面に留まり、既存データが変わっていない旨を出す", async () => {
    mocked.performRestore.mockResolvedValue({
      status: "rejected",
      error: { kind: "io", message: "退避に失敗" },
    });
    const { result, onRestored } = setup();
    await toConfirm(result);

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.step).toBe("confirm");
    expect(result.current.message?.kind).toBe("error");
    expect(result.current.message?.text).toContain("変更されていません");
    expect(onRestored).not.toHaveBeenCalled();
  });

  it("WebView の再生成に失敗したら退避ファイルの場所を案内する", async () => {
    mocked.performRestore.mockResolvedValue({ status: "recreateFailed" });
    const { result, onRestored } = setup();
    await toConfirm(result);

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.message?.kind).toBe("warning");
    expect(result.current.message?.text).toContain("restore_snapshots");
    expect(result.current.step).toBe("idle");
    expect(onRestored).not.toHaveBeenCalled();
  });

  it("キャンセルで紐づけ状態を破棄して初期表示へ戻る", async () => {
    const { result } = setup();
    await toConfirm(result);

    act(() => result.current.cancel());

    expect(result.current.step).toBe("idle");
    expect(result.current.content).toBeNull();
    expect(result.current.mapping).toEqual({});
  });
});
