import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { useAccounts } from "./useAccounts";
import { useAppStore } from "../store/useAppStore";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

const mockInvoke = vi.mocked(invoke);

const addAccountResult = JSON.stringify({
  accountId: "acc-new",
  dataDirectory: "/data/acc-new",
  windowLabel: "add-account",
});

describe("useAccounts (mobile)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "prompt",
      vi.fn(() => "テスト垢"),
    );
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    useAppStore.setState({ accounts: [], isMobile: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("open_add_account_window成功でアカウントがstoreに追加されclose_windowが呼ばれる", async () => {
    mockInvoke.mockImplementation(async (cmd) =>
      cmd === "open_add_account_window" ? addAccountResult : undefined,
    );
    const { result } = renderHook(() => useAccounts());

    await act(async () => {
      await result.current.startAddAccount();
    });

    const accounts = useAppStore.getState().accounts;
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({
      id: "acc-new",
      label: "テスト垢",
      dataDirectory: "/data/acc-new",
    });
    expect(mockInvoke).toHaveBeenCalledWith("close_window", {
      label: "add-account",
    });
  });

  it("open_add_account_windowがreject（キャンセル）の場合アカウントは追加されない", async () => {
    mockInvoke.mockRejectedValue(new Error("cancelled"));
    const { result } = renderHook(() => useAccounts());

    await act(async () => {
      await result.current.startAddAccount();
    });

    expect(useAppStore.getState().accounts).toHaveLength(0);
  });

  it("追加処理中の再呼び出しは何もしない（連打防止）", async () => {
    let resolveOpen: (v: string) => void = () => {};
    mockInvoke.mockImplementation((cmd) =>
      cmd === "open_add_account_window"
        ? new Promise<string>((resolve) => {
            resolveOpen = resolve;
          })
        : Promise.resolve(undefined),
    );
    const { result } = renderHook(() => useAccounts());

    let first: Promise<void> = Promise.resolve();
    await act(async () => {
      first = result.current.startAddAccount();
      // 1回目が完了する前の再呼び出し
      await result.current.startAddAccount();
    });

    const openCalls = mockInvoke.mock.calls.filter(
      (c) => c[0] === "open_add_account_window",
    );
    expect(openCalls).toHaveLength(1);

    await act(async () => {
      resolveOpen(addAccountResult);
      await first;
    });
    expect(useAppStore.getState().accounts).toHaveLength(1);
  });

  it("removeAccountはconfirmがfalseならdelete_account_dataを呼ばない", async () => {
    vi.stubGlobal(
      "confirm",
      vi.fn(() => false),
    );
    useAppStore.setState({
      accounts: [
        {
          id: "acc-1",
          label: "Test",
          dataDirectory: "/data/acc-1",
          color: "#1d9bf0",
          createdAt: "2026-01-01T00:00:00Z",
        },
      ],
      isMobile: true,
    });
    const { result } = renderHook(() => useAccounts());

    await act(async () => {
      await result.current.removeAccount("acc-1");
    });

    expect(mockInvoke).not.toHaveBeenCalledWith(
      "delete_account_data",
      expect.anything(),
    );
    expect(useAppStore.getState().accounts).toHaveLength(1);
  });

  it("removeAccountはconfirmがtrueならdelete_account_dataを呼びstoreから削除する", async () => {
    mockInvoke.mockResolvedValue(undefined);
    useAppStore.setState({
      accounts: [
        {
          id: "acc-1",
          label: "Test",
          dataDirectory: "/data/acc-1",
          color: "#1d9bf0",
          createdAt: "2026-01-01T00:00:00Z",
        },
      ],
      isMobile: true,
    });
    const { result } = renderHook(() => useAccounts());

    await act(async () => {
      await result.current.removeAccount("acc-1");
    });

    expect(mockInvoke).toHaveBeenCalledWith("delete_account_data", {
      dataDirectory: "/data/acc-1",
    });
    expect(useAppStore.getState().accounts).toHaveLength(0);
  });
});
