import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { IPC_EVENTS } from "../constants/ipc";
import { useAppStore } from "../store/useAppStore";
import { useAccounts } from "./useAccounts";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

// listen に渡されたコールバックを捕捉して手動発火できるようにする
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

// desktop フロー（reauth/addAccount）がログインウィンドウの close 検出に使う
// once に渡された "tauri://destroyed" コールバックを捕捉し、テストから手動発火できるようにする。
// 捕捉しない他のイベント名（想定上は使われないが将来の拡張に備え）は従来通り no-op を返す。
const destroyedCallbacks = new Map<string, () => void>();

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow: {
    getByLabel: vi.fn(async (label: string) => ({
      once: vi.fn(async (eventName: string, callback: () => void) => {
        if (eventName === "tauri://destroyed") {
          destroyedCallbacks.set(label, callback);
        }
        return () => {
          destroyedCallbacks.delete(label);
        };
      }),
    })),
  },
}));

function fireDestroyedEvent(label: string) {
  const callback = destroyedCallbacks.get(label);
  if (!callback)
    throw new Error(`destroyed callback for ${label} is not registered yet`);
  callback();
}

const mockInvoke = vi.mocked(invoke);
const mockListen = vi.mocked(listen);

// listen 登録が非同期(invokeのawait後)に行われるまでマイクロタスクを消化する
async function flushMicrotasks() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function fireListenEvent(eventName: string, payload: unknown) {
  const callback = listenCallbacks.get(eventName);
  if (!callback) throw new Error(`listen(${eventName}) is not registered yet`);
  callback({ payload });
}

const addAccountResult = JSON.stringify({
  accountId: "acc-new",
  dataDirectory: "/data/acc-new",
  windowLabel: "add-account",
});

describe("useAccounts (mobile)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({ accounts: [], isMobile: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("open_add_account_window成功でpendingAccountNameがセットされる", async () => {
    mockInvoke.mockImplementation(async (cmd) =>
      cmd === "open_add_account_window" ? addAccountResult : undefined,
    );
    const { result } = renderHook(() => useAccounts());

    await act(async () => {
      await result.current.startAddAccount();
    });

    expect(result.current.pendingAccountName).toMatchObject({
      accountId: "acc-new",
      dataDirectory: "/data/acc-new",
      windowLabel: "add-account",
    });
    expect(useAppStore.getState().accounts).toHaveLength(0);
  });

  it("submitAccountNameでアカウントがstoreに追加されclose_windowが呼ばれる", async () => {
    mockInvoke.mockImplementation(async (cmd) =>
      cmd === "open_add_account_window" ? addAccountResult : undefined,
    );
    const { result } = renderHook(() => useAccounts());

    await act(async () => {
      await result.current.startAddAccount();
    });
    await act(async () => {
      await result.current.submitAccountName("テスト垢");
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
    expect(result.current.pendingAccountName).toBeNull();
  });

  it("cancelAccountNameを呼ぶとアカウントを追加せずclose_windowが呼ばれる", async () => {
    mockInvoke.mockImplementation(async (cmd) =>
      cmd === "open_add_account_window" ? addAccountResult : undefined,
    );
    const { result } = renderHook(() => useAccounts());

    await act(async () => {
      await result.current.startAddAccount();
    });
    await act(async () => {
      result.current.cancelAccountName();
    });

    expect(useAppStore.getState().accounts).toHaveLength(0);
    expect(result.current.pendingAccountName).toBeNull();
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
    expect(result.current.pendingAccountName).toBeNull();
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
    expect(result.current.pendingAccountName).not.toBeNull();

    await act(async () => {
      await result.current.submitAccountName("テスト垢");
    });
    expect(useAppStore.getState().accounts).toHaveLength(1);
  });

  it("アカウント名入力待ち中はstartAddAccountを再呼び出ししても何もしない", async () => {
    mockInvoke.mockImplementation(async (cmd) =>
      cmd === "open_add_account_window" ? addAccountResult : undefined,
    );
    const { result } = renderHook(() => useAccounts());

    await act(async () => {
      await result.current.startAddAccount();
    });
    await act(async () => {
      await result.current.startAddAccount();
    });

    const openCalls = mockInvoke.mock.calls.filter(
      (c) => c[0] === "open_add_account_window",
    );
    expect(openCalls).toHaveLength(1);
  });

  it("removeAccountを呼ぶとpendingRemovalに削除対象がセットされる（即座には削除しない）", async () => {
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

    act(() => {
      result.current.removeAccount("acc-1");
    });

    expect(result.current.pendingRemoval).toMatchObject({
      id: "acc-1",
      label: "Test",
      dataDirectory: "/data/acc-1",
    });
    expect(mockInvoke).not.toHaveBeenCalledWith(
      "delete_account_data",
      expect.anything(),
    );
    expect(useAppStore.getState().accounts).toHaveLength(1);
  });

  it("cancelRemovalを呼ぶとdelete_account_dataを呼ばずpendingRemovalが解除される", async () => {
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

    act(() => {
      result.current.removeAccount("acc-1");
    });
    act(() => {
      result.current.cancelRemoval();
    });

    expect(result.current.pendingRemoval).toBeNull();
    expect(mockInvoke).not.toHaveBeenCalledWith(
      "delete_account_data",
      expect.anything(),
    );
    expect(useAppStore.getState().accounts).toHaveLength(1);
  });

  it("confirmRemovalを呼ぶとdelete_account_dataを呼びstoreから削除する", async () => {
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

    act(() => {
      result.current.removeAccount("acc-1");
    });
    await act(async () => {
      await result.current.confirmRemoval();
    });

    expect(mockInvoke).toHaveBeenCalledWith("delete_account_data", {
      dataDirectory: "/data/acc-1",
    });
    expect(useAppStore.getState().accounts).toHaveLength(0);
    expect(result.current.pendingRemoval).toBeNull();
  });
});

const OLD_DATA_DIRECTORY = "/data/acc-1";
const NEW_DATA_DIRECTORY = "/data/accounts/account-new";

const reauthWindowResult = JSON.stringify({
  accountId: "acc-1",
  windowLabel: "reauth-acc-1",
  newDataDirectory: NEW_DATA_DIRECTORY,
});

function makeReauthAccount(xUserId?: string) {
  return {
    id: "acc-1",
    label: "Test",
    dataDirectory: OLD_DATA_DIRECTORY,
    color: "#1d9bf0",
    createdAt: "2026-01-01T00:00:00Z",
    ...(xUserId !== undefined ? { xUserId } : {}),
  };
}

describe("useAccounts (desktop reauth)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("一致(match)の場合、xUserIdとdataDirectoryが更新されウィンドウが閉じられ旧dirが削除されreloadAllWebviewsが呼ばれる", async () => {
    useAppStore.setState({
      accounts: [makeReauthAccount("123")],
      isMobile: false,
    });
    mockInvoke.mockImplementation(async (cmd) =>
      cmd === "reauth_account_window" ? reauthWindowResult : undefined,
    );
    const mockReload = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAccounts(mockReload));

    let reauthPromise: Promise<void> = Promise.resolve();
    await act(async () => {
      reauthPromise = result.current.startReauth("acc-1");
      await flushMicrotasks();
      fireListenEvent(IPC_EVENTS.ACCOUNT_REAUTH_COMPLETE, {
        accountId: "acc-1",
        xUserId: "123",
        newDataDirectory: NEW_DATA_DIRECTORY,
      });
      await reauthPromise;
    });

    expect(useAppStore.getState().accounts[0].xUserId).toBe("123");
    expect(useAppStore.getState().accounts[0].dataDirectory).toBe(
      NEW_DATA_DIRECTORY,
    );
    expect(mockInvoke).toHaveBeenCalledWith("close_window", {
      label: "reauth-acc-1",
    });
    expect(mockInvoke).toHaveBeenCalledWith("delete_account_data", {
      dataDirectory: OLD_DATA_DIRECTORY,
    });
    expect(mockReload).toHaveBeenCalledTimes(1);
    expect(result.current.reauthNotice).toBeNull();
    expect(mockListen).toHaveBeenCalledWith(
      IPC_EVENTS.ACCOUNT_REAUTH_COMPLETE,
      expect.any(Function),
    );
  });

  it("初回(skip)の場合、xUserIdとdataDirectoryが記録され旧dirが削除されreloadAllWebviewsが呼ばれスキップ通知がセットされる", async () => {
    useAppStore.setState({
      accounts: [makeReauthAccount()],
      isMobile: false,
    });
    mockInvoke.mockImplementation(async (cmd) =>
      cmd === "reauth_account_window" ? reauthWindowResult : undefined,
    );
    const mockReload = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAccounts(mockReload));

    let reauthPromise: Promise<void> = Promise.resolve();
    await act(async () => {
      reauthPromise = result.current.startReauth("acc-1");
      await flushMicrotasks();
      fireListenEvent(IPC_EVENTS.ACCOUNT_REAUTH_COMPLETE, {
        accountId: "acc-1",
        xUserId: "123",
        newDataDirectory: NEW_DATA_DIRECTORY,
      });
      await reauthPromise;
    });

    expect(useAppStore.getState().accounts[0].xUserId).toBe("123");
    expect(useAppStore.getState().accounts[0].dataDirectory).toBe(
      NEW_DATA_DIRECTORY,
    );
    expect(mockInvoke).toHaveBeenCalledWith("delete_account_data", {
      dataDirectory: OLD_DATA_DIRECTORY,
    });
    expect(mockReload).toHaveBeenCalledTimes(1);
    expect(result.current.reauthNotice).toBe(
      "初回の再認証のため同一性の照合をスキップし、アカウント識別子を記録しました",
    );
  });

  it("不一致(mismatch)の場合、xUserIdとdataDirectoryは据え置かれ新dirが削除されreloadAllWebviewsも呼ばれず警告がセットされる", async () => {
    useAppStore.setState({
      accounts: [makeReauthAccount("123")],
      isMobile: false,
    });
    mockInvoke.mockImplementation(async (cmd) =>
      cmd === "reauth_account_window" ? reauthWindowResult : undefined,
    );
    const mockReload = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAccounts(mockReload));

    let reauthPromise: Promise<void> = Promise.resolve();
    await act(async () => {
      reauthPromise = result.current.startReauth("acc-1");
      await flushMicrotasks();
      fireListenEvent(IPC_EVENTS.ACCOUNT_REAUTH_COMPLETE, {
        accountId: "acc-1",
        xUserId: "999",
        newDataDirectory: NEW_DATA_DIRECTORY,
      });
      await reauthPromise;
    });

    expect(useAppStore.getState().accounts[0].xUserId).toBe("123");
    expect(useAppStore.getState().accounts[0].dataDirectory).toBe(
      OLD_DATA_DIRECTORY,
    );
    expect(mockReload).not.toHaveBeenCalled();
    expect(mockInvoke).toHaveBeenCalledWith("close_window", {
      label: "reauth-acc-1",
    });
    expect(mockInvoke).toHaveBeenCalledWith("delete_account_data", {
      dataDirectory: NEW_DATA_DIRECTORY,
    });
    expect(result.current.reauthNotice).toBe(
      "登録済みと異なるアカウントでログインされたため、セッションを更新しませんでした",
    );
  });

  it("識別子取得失敗の場合、更新もリロードもされず新dirが削除され失敗通知がセットされる", async () => {
    useAppStore.setState({
      accounts: [makeReauthAccount("123")],
      isMobile: false,
    });
    mockInvoke.mockImplementation(async (cmd) =>
      cmd === "reauth_account_window" ? reauthWindowResult : undefined,
    );
    const mockReload = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAccounts(mockReload));

    let reauthPromise: Promise<void> = Promise.resolve();
    await act(async () => {
      reauthPromise = result.current.startReauth("acc-1");
      await flushMicrotasks();
      fireListenEvent(IPC_EVENTS.ACCOUNT_REAUTH_COMPLETE, {
        accountId: "acc-1",
        xUserId: null,
        newDataDirectory: NEW_DATA_DIRECTORY,
      });
      await reauthPromise;
    });

    expect(useAppStore.getState().accounts[0].xUserId).toBe("123");
    expect(useAppStore.getState().accounts[0].dataDirectory).toBe(
      OLD_DATA_DIRECTORY,
    );
    expect(mockReload).not.toHaveBeenCalled();
    expect(mockInvoke).toHaveBeenCalledWith("close_window", {
      label: "reauth-acc-1",
    });
    expect(mockInvoke).toHaveBeenCalledWith("delete_account_data", {
      dataDirectory: NEW_DATA_DIRECTORY,
    });
    expect(result.current.reauthNotice).toBe(
      "再認証に失敗しました（アカウント識別子を取得できませんでした）",
    );
  });

  it("dismissReauthNoticeを呼ぶとreauthNoticeがnullに戻る", async () => {
    useAppStore.setState({
      accounts: [makeReauthAccount("123")],
      isMobile: false,
    });
    mockInvoke.mockImplementation(async (cmd) =>
      cmd === "reauth_account_window" ? reauthWindowResult : undefined,
    );
    const mockReload = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAccounts(mockReload));

    let reauthPromise: Promise<void> = Promise.resolve();
    await act(async () => {
      reauthPromise = result.current.startReauth("acc-1");
      await flushMicrotasks();
      fireListenEvent(IPC_EVENTS.ACCOUNT_REAUTH_COMPLETE, {
        accountId: "acc-1",
        xUserId: "999",
        newDataDirectory: NEW_DATA_DIRECTORY,
      });
      await reauthPromise;
    });
    expect(result.current.reauthNotice).not.toBeNull();

    act(() => {
      result.current.dismissReauthNotice();
    });

    expect(result.current.reauthNotice).toBeNull();
  });

  it("reloadAllWebviewsを渡さずuseAccounts()で呼んでもmatch時にエラーにならない", async () => {
    useAppStore.setState({
      accounts: [makeReauthAccount("123")],
      isMobile: false,
    });
    mockInvoke.mockImplementation(async (cmd) =>
      cmd === "reauth_account_window" ? reauthWindowResult : undefined,
    );
    const { result } = renderHook(() => useAccounts());

    let reauthPromise: Promise<void> = Promise.resolve();
    await act(async () => {
      reauthPromise = result.current.startReauth("acc-1");
      await flushMicrotasks();
      fireListenEvent(IPC_EVENTS.ACCOUNT_REAUTH_COMPLETE, {
        accountId: "acc-1",
        xUserId: "123",
        newDataDirectory: NEW_DATA_DIRECTORY,
      });
      await reauthPromise;
    });

    expect(useAppStore.getState().accounts[0].xUserId).toBe("123");
    expect(result.current.reauthNotice).toBeNull();
  });

  it("対象外accountIdのイベントは無視される", async () => {
    useAppStore.setState({
      accounts: [makeReauthAccount("123")],
      isMobile: false,
    });
    mockInvoke.mockImplementation(async (cmd) =>
      cmd === "reauth_account_window" ? reauthWindowResult : undefined,
    );
    const mockReload = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAccounts(mockReload));

    let reauthPromise: Promise<void> = Promise.resolve();
    await act(async () => {
      reauthPromise = result.current.startReauth("acc-1");
      await flushMicrotasks();
      fireListenEvent(IPC_EVENTS.ACCOUNT_REAUTH_COMPLETE, {
        accountId: "other-account",
        xUserId: "123",
        newDataDirectory: NEW_DATA_DIRECTORY,
      });
      // 対象外イベントでは resolve されないため、一致イベントを追加で発火して完了させる
      fireListenEvent(IPC_EVENTS.ACCOUNT_REAUTH_COMPLETE, {
        accountId: "acc-1",
        xUserId: "123",
        newDataDirectory: NEW_DATA_DIRECTORY,
      });
      await reauthPromise;
    });

    expect(mockReload).toHaveBeenCalledTimes(1);
  });

  it("キャンセル(tauri://destroyed)の場合、新dirが削除され通知なし・更新なし", async () => {
    useAppStore.setState({
      accounts: [makeReauthAccount("123")],
      isMobile: false,
    });
    mockInvoke.mockImplementation(async (cmd) =>
      cmd === "reauth_account_window" ? reauthWindowResult : undefined,
    );
    const mockReload = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAccounts(mockReload));

    let reauthPromise: Promise<void> = Promise.resolve();
    await act(async () => {
      reauthPromise = result.current.startReauth("acc-1");
      await flushMicrotasks();
      fireDestroyedEvent("reauth-acc-1");
      await reauthPromise;
    });

    expect(useAppStore.getState().accounts[0].xUserId).toBe("123");
    expect(useAppStore.getState().accounts[0].dataDirectory).toBe(
      OLD_DATA_DIRECTORY,
    );
    expect(mockInvoke).toHaveBeenCalledWith("delete_account_data", {
      dataDirectory: NEW_DATA_DIRECTORY,
    });
    expect(mockReload).not.toHaveBeenCalled();
    expect(result.current.reauthNotice).toBeNull();
  });
});

describe("useAccounts (mobile reauth)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("一致(match)の場合、xUserIdが更新されreloadAllWebviewsが呼ばれる", async () => {
    useAppStore.setState({
      accounts: [makeReauthAccount("123")],
      isMobile: true,
    });
    mockInvoke.mockImplementation(async (cmd) =>
      cmd === "reauth_account_window"
        ? JSON.stringify({ accountId: "acc-1", xUserId: "123" })
        : undefined,
    );
    const mockReload = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAccounts(mockReload));

    await act(async () => {
      await result.current.startReauth("acc-1");
    });

    expect(useAppStore.getState().accounts[0].xUserId).toBe("123");
    expect(mockReload).toHaveBeenCalledTimes(1);
    expect(result.current.reauthNotice).toBeNull();
  });

  it("初回(skip)の場合、xUserIdが記録されreloadAllWebviewsが呼ばれスキップ通知がセットされる", async () => {
    useAppStore.setState({
      accounts: [makeReauthAccount()],
      isMobile: true,
    });
    mockInvoke.mockImplementation(async (cmd) =>
      cmd === "reauth_account_window"
        ? JSON.stringify({ accountId: "acc-1", xUserId: "123" })
        : undefined,
    );
    const mockReload = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAccounts(mockReload));

    await act(async () => {
      await result.current.startReauth("acc-1");
    });

    expect(useAppStore.getState().accounts[0].xUserId).toBe("123");
    expect(mockReload).toHaveBeenCalledTimes(1);
    expect(result.current.reauthNotice).toBe(
      "初回の再認証のため同一性の照合をスキップし、アカウント識別子を記録しました",
    );
  });

  it("不一致の場合、invokeがaccount-mismatchでrejectされxUserIdは更新されず警告がセットされる", async () => {
    useAppStore.setState({
      accounts: [makeReauthAccount("123")],
      isMobile: true,
    });
    mockInvoke.mockImplementation(async (cmd) =>
      cmd === "reauth_account_window"
        ? Promise.reject(new Error("account-mismatch"))
        : undefined,
    );
    const mockReload = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAccounts(mockReload));

    await act(async () => {
      await result.current.startReauth("acc-1");
    });

    expect(useAppStore.getState().accounts[0].xUserId).toBe("123");
    expect(mockReload).not.toHaveBeenCalled();
    expect(result.current.reauthNotice).toBe(
      "登録済みと異なるアカウントでログインされたため、セッションを更新しませんでした",
    );
  });

  it("キャンセルの場合、invokeがcancelledでrejectされ何も起きない", async () => {
    useAppStore.setState({
      accounts: [makeReauthAccount("123")],
      isMobile: true,
    });
    mockInvoke.mockImplementation(async (cmd) =>
      cmd === "reauth_account_window"
        ? Promise.reject(new Error("cancelled"))
        : undefined,
    );
    const mockReload = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAccounts(mockReload));

    await act(async () => {
      await result.current.startReauth("acc-1");
    });

    expect(useAppStore.getState().accounts[0].xUserId).toBe("123");
    expect(mockReload).not.toHaveBeenCalled();
    expect(result.current.reauthNotice).toBeNull();
  });

  it("xUserIdがnullで返る場合、更新もリロードもされず失敗通知がセットされる", async () => {
    useAppStore.setState({
      accounts: [makeReauthAccount("123")],
      isMobile: true,
    });
    mockInvoke.mockImplementation(async (cmd) =>
      cmd === "reauth_account_window"
        ? JSON.stringify({ accountId: "acc-1", xUserId: null })
        : undefined,
    );
    const mockReload = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAccounts(mockReload));

    await act(async () => {
      await result.current.startReauth("acc-1");
    });

    expect(useAppStore.getState().accounts[0].xUserId).toBe("123");
    expect(mockReload).not.toHaveBeenCalled();
    expect(result.current.reauthNotice).toBe(
      "再認証に失敗しました（アカウント識別子を取得できませんでした）",
    );
  });
});
