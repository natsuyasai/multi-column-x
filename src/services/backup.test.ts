import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IPC_COMMANDS } from "@/constants/ipc";
import type { BackupContent } from "@/lib/backupRestore";
import {
  applyRestore,
  backfillXUserIds,
  exportBackup,
  normalizeBackupFile,
  performRestore,
  readBackup,
} from "@/services/backup";
import { useAppStore } from "@/store/useAppStore";
import { DEFAULT_COLUMN_SETTINGS, DEFAULT_GLOBAL_SETTINGS } from "@/types";
import type { Account, AppSettings, Column } from "@/types";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-log", () => ({
  error: vi.fn().mockResolvedValue(undefined),
}));

const mockInvoke = vi.mocked(invoke);

const account: Account = {
  id: "acc-1",
  label: "既存",
  dataDirectory: "/data/acc-1",
  color: "#1d9bf0",
  createdAt: "2026-01-01T00:00:00Z",
};

function makeColumn(id: string, accountId = "A"): Column {
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
  hardwareVideoDecodeEnabled: _hardwareVideoDecode,
  h264DownloadPromptDismissed: _h264Dismissed,
  ...PORTABLE_SETTINGS
} = DEFAULT_GLOBAL_SETTINGS;

function makeContent(): BackupContent {
  return {
    accounts: [{ backupAccountId: "A", label: "A", color: "#111" }],
    columns: [makeColumn("c1", "A")],
    globalSettings: PORTABLE_SETTINGS,
  };
}

function restoredSettings(): AppSettings {
  return {
    accounts: [account],
    columns: [makeColumn("restored-1", "acc-1")],
    globalSettings: { ...DEFAULT_GLOBAL_SETTINGS, theme: "dark" },
  };
}

function saveCalls() {
  return mockInvoke.mock.calls.filter(
    (c) => c[0] === IPC_COMMANDS.SAVE_SETTINGS,
  );
}

beforeEach(() => {
  mockInvoke.mockReset();
  useAppStore.setState({
    accounts: [account],
    columns: [makeColumn("old-1", "acc-1")],
    globalSettings: DEFAULT_GLOBAL_SETTINGS,
    isLoaded: true,
    settingsSaveBlocked: false,
    restoreInProgress: false,
  });
});

describe("normalizeBackupFile（Rust の出力をフロントの型へ正規化する）", () => {
  it("defaultAccountId の null は未設定（undefined）になる", () => {
    const content = normalizeBackupFile({
      accounts: [],
      columns: [],
      globalSettings: { ...PORTABLE_SETTINGS, defaultAccountId: null },
    } as never);

    expect(content.globalSettings.defaultAccountId).toBeUndefined();
  });

  it("xUserId が無いアカウントは xUserId キーを持たず、あるアカウントは保持する", () => {
    const content = normalizeBackupFile({
      accounts: [
        { backupAccountId: "A", label: "A", color: "#111", xUserId: "100" },
        { backupAccountId: "B", label: "B", color: "#222", xUserId: null },
      ],
      columns: [],
      globalSettings: PORTABLE_SETTINGS,
    } as never);

    expect(content.accounts[0].xUserId).toBe("100");
    expect(content.accounts[1]).not.toHaveProperty("xUserId");
  });

  it("gridRow / gridCol が 0 のカラムは order から配置が補われる", () => {
    const raw = makeColumn("c1");
    const content = normalizeBackupFile({
      accounts: [],
      columns: [{ ...raw, gridRow: 0, gridCol: 0, order: 3 }],
      globalSettings: PORTABLE_SETTINGS,
    } as never);

    expect(content.columns[0]).toMatchObject({ gridRow: 1, gridCol: 4 });
  });
});

describe("exportBackup / readBackup", () => {
  it("書き出しは保留中の保存の完了を待ってから export_backup を呼び、結果を返す", async () => {
    const order: string[] = [];
    mockInvoke.mockImplementation(async (cmd) => {
      order.push(String(cmd));
      return cmd === IPC_COMMANDS.EXPORT_BACKUP ? true : undefined;
    });
    useAppStore.getState().updateColumn("old-1", { width: 500 });

    const saved = await exportBackup();

    expect(saved).toBe(true);
    expect(order).toEqual([
      IPC_COMMANDS.SAVE_SETTINGS,
      IPC_COMMANDS.EXPORT_BACKUP,
    ]);
  });

  it("読み込みで選択をキャンセルしたら null を返す", async () => {
    mockInvoke.mockResolvedValue(null);

    await expect(readBackup()).resolves.toBeNull();
  });

  it("読み込みで不正な NG ワードがあれば invalidField で拒否する", async () => {
    mockInvoke.mockResolvedValue({
      accounts: [],
      columns: [],
      globalSettings: { ...PORTABLE_SETTINGS, ngWords: ["/(/"] },
    });

    await expect(readBackup()).rejects.toMatchObject({ kind: "invalidField" });
  });

  it("読み込みに成功したときはストアを変更しない", async () => {
    mockInvoke.mockResolvedValue({
      accounts: [],
      columns: [],
      globalSettings: PORTABLE_SETTINGS,
    });
    const before = useAppStore.getState().columns;

    await readBackup();

    expect(useAppStore.getState().columns).toBe(before);
  });

  it("Rust が拒否した場合はストアを変更せずエラーがそのまま伝わる", async () => {
    mockInvoke.mockRejectedValue({
      kind: "futureVersion",
      found: 2,
      current: 1,
    });
    const before = useAppStore.getState().columns;

    await expect(readBackup()).rejects.toMatchObject({ kind: "futureVersion" });
    expect(useAppStore.getState().columns).toBe(before);
  });
});

describe("applyRestore", () => {
  it("紐づけ済みの復元内容を apply_restore に渡す", async () => {
    mockInvoke.mockResolvedValue(restoredSettings());

    await applyRestore(makeContent(), { A: "acc-1" });

    const [cmd, args] = mockInvoke.mock.calls[0];
    expect(cmd).toBe(IPC_COMMANDS.APPLY_RESTORE);
    const payload = (args as { payload: { columns: Column[] } }).payload;
    expect(payload.columns).toHaveLength(1);
    expect(payload.columns[0].accountId).toBe("acc-1");
    expect(payload.columns[0].id).not.toBe("c1");
  });
});

describe("performRestore（復元の全体手順）", () => {
  const recreate = vi.fn(async (apply: () => void) => {
    apply();
  });

  beforeEach(() => {
    recreate.mockClear();
  });

  it("成功すると復元後の設定がストアに反映され、復元中フラグが下りる", async () => {
    mockInvoke.mockResolvedValue(restoredSettings());

    const outcome = await performRestore(
      makeContent(),
      { A: "acc-1" },
      recreate,
    );

    expect(outcome).toEqual({ status: "ok" });
    const state = useAppStore.getState();
    expect(state.columns.map((c) => c.id)).toEqual(["restored-1"]);
    expect(state.globalSettings.theme).toBe("dark");
    expect(state.restoreInProgress).toBe(false);
  });

  it("復元前に積まれた保存は復元の適用より前に完了し、復元中は新たな保存を発行しない", async () => {
    const order: string[] = [];
    mockInvoke.mockImplementation(async (cmd) => {
      order.push(String(cmd));
      return cmd === IPC_COMMANDS.APPLY_RESTORE
        ? restoredSettings()
        : undefined;
    });
    useAppStore.getState().updateColumn("old-1", { width: 500 });

    await performRestore(makeContent(), { A: "acc-1" }, recreate);

    expect(order).toEqual([
      IPC_COMMANDS.SAVE_SETTINGS,
      IPC_COMMANDS.APPLY_RESTORE,
    ]);
    expect(saveCalls()).toHaveLength(1);
  });

  it("apply_restore が失敗したら WebView の破棄・ストアの置換を行わずエラーを返す", async () => {
    mockInvoke.mockRejectedValue({ kind: "io", message: "退避に失敗" });

    const outcome = await performRestore(
      makeContent(),
      { A: "acc-1" },
      recreate,
    );

    expect(outcome).toEqual({
      status: "rejected",
      error: { kind: "io", message: "退避に失敗" },
    });
    expect(recreate).not.toHaveBeenCalled();
    expect(useAppStore.getState().columns.map((c) => c.id)).toEqual(["old-1"]);
    expect(useAppStore.getState().restoreInProgress).toBe(false);
  });

  it("WebView の再生成に失敗しても復元後の設定がストアに残り、再生成失敗を返す", async () => {
    mockInvoke.mockResolvedValue(restoredSettings());
    const failing = vi.fn(async (apply: () => void) => {
      apply();
      throw new Error("create_column_webview failed");
    });

    const outcome = await performRestore(
      makeContent(),
      { A: "acc-1" },
      failing,
    );

    expect(outcome).toEqual({ status: "recreateFailed" });
    expect(useAppStore.getState().columns.map((c) => c.id)).toEqual([
      "restored-1",
    ]);
    expect(useAppStore.getState().restoreInProgress).toBe(false);
  });

  it("置換の前に再生成処理が失敗しても復元後の設定がストアに反映される", async () => {
    mockInvoke.mockResolvedValue(restoredSettings());
    const failingBeforeApply = vi.fn(async () => {
      throw new Error("remove failed");
    });

    const outcome = await performRestore(
      makeContent(),
      { A: "acc-1" },
      failingBeforeApply,
    );

    expect(outcome).toEqual({ status: "recreateFailed" });
    expect(useAppStore.getState().columns.map((c) => c.id)).toEqual([
      "restored-1",
    ]);
  });

  it("復元中に起きた設定の変更は保存を発行しない", async () => {
    mockInvoke.mockResolvedValue(restoredSettings());
    const duringRestore = vi.fn(async (apply: () => void) => {
      useAppStore.getState().updateGlobalSettings({ hideAdEnabled: false });
      apply();
    });

    await performRestore(makeContent(), { A: "acc-1" }, duringRestore);

    expect(saveCalls()).toHaveLength(0);
  });

  it("復元後は同じストアで通常どおり保存が再開される", async () => {
    mockInvoke.mockResolvedValue(restoredSettings());
    await performRestore(makeContent(), { A: "acc-1" }, recreate);
    mockInvoke.mockClear();
    mockInvoke.mockResolvedValue(undefined);

    useAppStore.getState().updateGlobalSettings({ hideAdEnabled: false });
    await useAppStore.getState().flushPendingSaves();

    expect(saveCalls()).toHaveLength(1);
  });
});

describe("backfillXUserIds（既存アカウントの X ユーザー ID の後追い補完）", () => {
  beforeEach(() => {
    useAppStore.setState({
      accounts: [
        account,
        { ...account, id: "acc-2", label: "二つ目", xUserId: "222" },
        { ...account, id: "acc-3", label: "カラム無し" },
      ],
      columns: [makeColumn("col-1", "acc-1"), makeColumn("col-2", "acc-2")],
    });
  });

  it("X ユーザー ID 未設定でカラムを持つアカウントだけを問い合わせ、取得できた ID を保存する", async () => {
    mockInvoke.mockImplementation(async (cmd) =>
      cmd === IPC_COMMANDS.DETECT_ACCOUNT_USER_IDS
        ? [{ accountId: "acc-1", xUserId: "111" }]
        : undefined,
    );

    await backfillXUserIds();

    const detectCall = mockInvoke.mock.calls.find(
      (c) => c[0] === IPC_COMMANDS.DETECT_ACCOUNT_USER_IDS,
    );
    expect(detectCall?.[1]).toEqual({
      targets: [{ accountId: "acc-1", columnId: "col-1" }],
    });
    expect(
      useAppStore.getState().accounts.find((a) => a.id === "acc-1")?.xUserId,
    ).toBe("111");
  });

  it("取得できなかったアカウントは未設定のまま残る", async () => {
    mockInvoke.mockImplementation(async (cmd) =>
      cmd === IPC_COMMANDS.DETECT_ACCOUNT_USER_IDS
        ? [{ accountId: "acc-1", xUserId: null }]
        : undefined,
    );

    await backfillXUserIds();

    expect(
      useAppStore.getState().accounts.find((a) => a.id === "acc-1")?.xUserId,
    ).toBeUndefined();
  });

  it("問い合わせが失敗しても例外を投げず、アカウントを変更しない", async () => {
    mockInvoke.mockRejectedValue(new Error("detect failed"));

    await expect(backfillXUserIds()).resolves.toBeUndefined();
    expect(
      useAppStore.getState().accounts.find((a) => a.id === "acc-1")?.xUserId,
    ).toBeUndefined();
  });

  it("補完の対象が無ければ IPC を呼ばない", async () => {
    useAppStore.setState({
      accounts: [{ ...account, xUserId: "111" }],
    });

    await backfillXUserIds();

    expect(mockInvoke).not.toHaveBeenCalled();
  });
});
