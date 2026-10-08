import { invoke } from "@tauri-apps/api/core";
import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAccounts } from "@/hooks/useAccounts";
import { useAppStore } from "@/store/useAppStore";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow: {
    getByLabel: vi.fn(async () => null),
  },
}));

const mockInvoke = vi.mocked(invoke);

const account = {
  id: "acc-1",
  label: "既存",
  dataDirectory: "/data/acc-1",
  color: "#1d9bf0",
  createdAt: "2026-01-01T00:00:00Z",
  xUserId: "111",
};

describe("バックアップ復元中のアカウント操作の停止", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue(undefined);
    useAppStore.setState({
      accounts: [account],
      isMobile: false,
      restoreInProgress: false,
    });
  });

  it("復元中はアカウントの追加を開始しない", async () => {
    useAppStore.getState().beginRestore();
    const { result } = renderHook(() => useAccounts());

    await act(async () => {
      await result.current.startAddAccount();
    });

    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("復元中は再認証を開始しない", async () => {
    useAppStore.getState().beginRestore();
    const { result } = renderHook(() => useAccounts());

    await act(async () => {
      await result.current.startReauth("acc-1");
    });

    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("復元が終わった後は同じフックでアカウントの追加を開始できる", async () => {
    mockInvoke.mockImplementation(async () =>
      JSON.stringify({
        accountId: "acc-new",
        dataDirectory: "/data/acc-new",
        windowLabel: "add-account-x",
      }),
    );
    const { result } = renderHook(() => useAccounts());
    useAppStore.getState().beginRestore();
    await act(async () => {
      await result.current.startAddAccount();
    });
    expect(mockInvoke).not.toHaveBeenCalled();

    useAppStore.getState().finishRestore();
    await act(async () => {
      // デスクトップはログイン完了イベント待ちで解決しないため、呼び出しの開始だけを確認する
      void result.current.startAddAccount();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockInvoke).toHaveBeenCalledWith("open_add_account_window");
  });
});
