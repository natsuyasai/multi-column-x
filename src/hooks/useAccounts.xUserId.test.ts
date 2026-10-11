import { invoke } from "@tauri-apps/api/core";
import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IPC_EVENTS } from "@/constants/ipc";
import { useAccounts } from "@/hooks/useAccounts";
import { useAppStore } from "@/store/useAppStore";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const listenCallbacks = new Map<
  string,
  (event: { payload: unknown }) => void
>();

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(
    (eventName: string, callback: (event: { payload: unknown }) => void) => {
      listenCallbacks.set(eventName, callback);
      return Promise.resolve(() => {
        listenCallbacks.delete(eventName);
      });
    },
  ),
}));

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow: {
    getByLabel: vi.fn(async () => ({
      once: vi.fn(async () => () => {}),
    })),
  },
}));

const mockInvoke = vi.mocked(invoke);

async function flushMicrotasks() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function addAccountResult(extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    accountId: "acc-new",
    dataDirectory: "/data/acc-new",
    windowLabel: "add-account",
    ...extra,
  });
}

describe("アカウント追加時の xUserId 保存（モバイル）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({ accounts: [], isMobile: true });
  });

  it("追加結果に xUserId が含まれていればアカウントに保存される", async () => {
    mockInvoke.mockImplementation(async (cmd) =>
      cmd === "open_add_account_window"
        ? addAccountResult({ xUserId: "1234567890" })
        : undefined,
    );
    const { result } = renderHook(() => useAccounts());

    await act(async () => {
      await result.current.startAddAccount();
    });
    await act(async () => {
      await result.current.submitAccountName("新アカウント");
    });

    expect(useAppStore.getState().accounts[0]).toMatchObject({
      id: "acc-new",
      xUserId: "1234567890",
    });
  });

  it("追加結果に xUserId が無ければ未設定のまま追加される", async () => {
    mockInvoke.mockImplementation(async (cmd) =>
      cmd === "open_add_account_window" ? addAccountResult() : undefined,
    );
    const { result } = renderHook(() => useAccounts());

    await act(async () => {
      await result.current.startAddAccount();
    });
    await act(async () => {
      await result.current.submitAccountName("新アカウント");
    });

    const added = useAppStore.getState().accounts[0];
    expect(added.id).toBe("acc-new");
    expect(added.xUserId).toBeUndefined();
  });
});

describe("アカウント追加時の xUserId 保存（デスクトップ）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listenCallbacks.clear();
    useAppStore.setState({ accounts: [], isMobile: false });
  });

  async function addWithLoginPayload(payload: unknown) {
    mockInvoke.mockImplementation(async (cmd) =>
      cmd === "open_add_account_window" ? addAccountResult() : undefined,
    );
    const { result } = renderHook(() => useAccounts());

    await act(async () => {
      const start = result.current.startAddAccount();
      await flushMicrotasks();
      listenCallbacks.get(IPC_EVENTS.ACCOUNT_LOGIN_COMPLETE)!({ payload });
      await start;
    });
    await act(async () => {
      await result.current.submitAccountName("新アカウント");
    });
    return useAppStore.getState().accounts[0];
  }

  it("ログイン完了イベントの xUserId がアカウントに保存される", async () => {
    const added = await addWithLoginPayload({ xUserId: "1234567890" });

    expect(added).toMatchObject({ id: "acc-new", xUserId: "1234567890" });
  });

  it("ログイン完了イベントの xUserId が null なら未設定のまま追加される", async () => {
    const added = await addWithLoginPayload({ xUserId: null });

    expect(added.id).toBe("acc-new");
    expect(added.xUserId).toBeUndefined();
  });
});
