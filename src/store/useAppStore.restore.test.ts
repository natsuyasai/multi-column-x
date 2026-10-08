import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IPC_COMMANDS } from "@/constants/ipc";
import { useAppStore } from "@/store/useAppStore";
import { DEFAULT_COLUMN_SETTINGS, DEFAULT_GLOBAL_SETTINGS } from "@/types";
import type { Account, Column } from "@/types";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tauri-apps/plugin-log", () => ({
  error: vi.fn().mockResolvedValue(undefined),
}));

const mockInvoke = vi.mocked(invoke);

const account: Account = {
  id: "acc-1",
  label: "既存アカウント",
  dataDirectory: "/data/acc-1",
  color: "#1d9bf0",
  createdAt: "2026-01-01T00:00:00Z",
};

function makeColumn(id: string, accountId = "acc-1"): Column {
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

function saveCalls() {
  return mockInvoke.mock.calls.filter(
    (c) => c[0] === IPC_COMMANDS.SAVE_SETTINGS,
  );
}

describe("useAppStore のリストア保護", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(undefined);
    useAppStore.setState({
      accounts: [account],
      columns: [makeColumn("old-1")],
      globalSettings: DEFAULT_GLOBAL_SETTINGS,
      isLoaded: true,
      settingsSaveBlocked: false,
      restoreInProgress: false,
    });
  });

  it("リストア中は設定の変更が保存コマンドを呼ばない", async () => {
    useAppStore.getState().beginRestore();

    useAppStore.getState().updateColumn("old-1", { width: 500 });
    await useAppStore.getState().saveSettings();

    expect(saveCalls()).toHaveLength(0);
  });

  it("リストア中でない通常時は変更が保存される", async () => {
    useAppStore.getState().updateColumn("old-1", { width: 500 });
    await useAppStore.getState().saveSettings();

    expect(saveCalls().length).toBeGreaterThan(0);
  });

  it("復元結果の反映は保存コマンドを呼ばず、アカウントは置き換えない", async () => {
    useAppStore.getState().beginRestore();

    useAppStore.getState().applyRestoredSettings({
      accounts: [account],
      columns: [makeColumn("new-1"), makeColumn("new-2")],
      globalSettings: { ...DEFAULT_GLOBAL_SETTINGS, theme: "dark" },
    });
    await useAppStore.getState().saveSettings();

    const state = useAppStore.getState();
    expect(state.columns.map((c) => c.id)).toEqual(["new-1", "new-2"]);
    expect(state.globalSettings.theme).toBe("dark");
    expect(state.accounts).toEqual([account]);
    expect(saveCalls()).toHaveLength(0);
  });

  it("リストア完了後は同じストアで復元後の内容が保存される", async () => {
    const store = useAppStore.getState();
    store.beginRestore();
    store.applyRestoredSettings({
      accounts: [account],
      columns: [makeColumn("new-1")],
      globalSettings: { ...DEFAULT_GLOBAL_SETTINGS, theme: "dark" },
    });
    useAppStore.getState().finishRestore();

    useAppStore.getState().updateGlobalSettings({ hideAdEnabled: false });
    await useAppStore.getState().saveSettings();

    const calls = saveCalls();
    expect(calls.length).toBeGreaterThan(0);
    const saved = (
      calls[calls.length - 1][1] as {
        settings: { columns: Column[]; globalSettings: { theme: string } };
      }
    ).settings;
    expect(saved.columns.map((c) => c.id)).toEqual(["new-1"]);
    expect(saved.globalSettings.theme).toBe("dark");
  });

  it("設定の読み込み失敗で保存が止まっている場合はリストア完了後も保存しない", async () => {
    useAppStore.setState({ settingsSaveBlocked: true });
    useAppStore.getState().beginRestore();
    useAppStore.getState().finishRestore();

    useAppStore.getState().updateColumn("old-1", { width: 500 });
    await useAppStore.getState().saveSettings();

    expect(saveCalls()).toHaveLength(0);
  });
});
