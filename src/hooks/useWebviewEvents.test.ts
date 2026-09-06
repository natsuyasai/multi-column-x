import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { IPC_EVENTS } from "../constants/ipc";
import { useAppStore } from "../store/useAppStore";
import { DEFAULT_COLUMN_SETTINGS, getColumnLabel } from "../types";
import type { Column } from "../types";
import {
  __resetNotificationPermissionCacheForTests,
  useApiRateLimitReports,
  useColumnCrashRecovery,
  useColumnFocusClearsUnread,
  useNewPostsNotification,
  useOfficialSettingsBroadcast,
  useOfficialSettingsPopupReload,
  useWebviewScrollRelay,
} from "./useWebviewEvents";

type ListenCallback = (event: { payload: unknown }) => void;
const capturedCallbacks = new Map<string, ListenCallback>();
const mockUnlisten = vi.fn();

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((event: string, cb: ListenCallback) => {
    capturedCallbacks.set(event, cb);
    return Promise.resolve(mockUnlisten);
  }),
}));

const isPermissionGrantedMock = vi.fn<() => Promise<boolean>>();
const requestPermissionMock = vi.fn<() => Promise<NotificationPermission>>();
const sendNotificationMock = vi.fn();

vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: (...args: []) => isPermissionGrantedMock(...args),
  requestPermission: (...args: []) => requestPermissionMock(...args),
  sendNotification: (...args: [unknown]) => sendNotificationMock(...args),
}));

const evalInColumnMock = vi.fn();
vi.mock("../services/columnWebview", () => ({
  evalInColumn: (...args: [string, string]) => evalInColumnMock(...args),
}));

function makeColumn(overrides: Partial<Column> & Pick<Column, "id">): Column {
  return {
    accountId: "acc-1",
    pageType: "home",
    width: 350,
    order: 0,
    gridRow: 1,
    gridCol: 1,
    heightMode: "auto",
    settings: DEFAULT_COLUMN_SETTINGS,
    ...overrides,
  };
}

describe("useWebviewScrollRelay", () => {
  beforeEach(() => {
    capturedCallbacks.clear();
    mockUnlisten.mockReset();
  });

  it("webview-scroll イベントの payload 分だけ scrollLeft を進める", async () => {
    const el = { scrollLeft: 10 } as HTMLDivElement;
    const ref = { current: el };
    renderHook(() => useWebviewScrollRelay(ref));
    await act(async () => {
      capturedCallbacks.get(IPC_EVENTS.WEBVIEW_SCROLL)?.({ payload: 120 });
    });
    expect(el.scrollLeft).toBe(130);
  });

  it("ref が未設定でもエラーにならない", async () => {
    const ref = { current: null };
    renderHook(() => useWebviewScrollRelay(ref));
    await act(async () => {
      capturedCallbacks.get(IPC_EVENTS.WEBVIEW_SCROLL)?.({ payload: 120 });
    });
  });
});

describe("useColumnCrashRecovery", () => {
  beforeEach(() => {
    capturedCallbacks.clear();
    mockUnlisten.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function emitCrash(columnId: string) {
    capturedCallbacks.get(IPC_EVENTS.COLUMN_WEBVIEW_CRASHED)?.({
      payload: columnId,
    });
  }

  it("クラッシュイベントの columnId で再生成を呼ぶ", async () => {
    const recreate = vi.fn();
    renderHook(() => useColumnCrashRecovery(recreate));
    await act(async () => {
      emitCrash("col-1");
    });
    expect(recreate).toHaveBeenCalledWith("col-1");
  });

  it("同一カラムのクールダウン中の連続クラッシュは無視する（クラッシュループ防止）", async () => {
    const recreate = vi.fn();
    renderHook(() => useColumnCrashRecovery(recreate));
    await act(async () => {
      emitCrash("col-1");
      emitCrash("col-1");
    });
    expect(recreate).toHaveBeenCalledTimes(1);
  });

  it("クールダウン経過後は再度再生成する", async () => {
    const recreate = vi.fn();
    renderHook(() => useColumnCrashRecovery(recreate));
    await act(async () => {
      emitCrash("col-1");
    });
    await act(async () => {
      vi.setSystemTime(10000);
      emitCrash("col-1");
    });
    expect(recreate).toHaveBeenCalledTimes(2);
  });

  it("別カラムのクラッシュはクールダウンと独立して再生成する", async () => {
    const recreate = vi.fn();
    renderHook(() => useColumnCrashRecovery(recreate));
    await act(async () => {
      emitCrash("col-1");
      emitCrash("col-2");
    });
    expect(recreate).toHaveBeenCalledWith("col-1");
    expect(recreate).toHaveBeenCalledWith("col-2");
    expect(recreate).toHaveBeenCalledTimes(2);
  });

  it("連続再生成が上限に達したら自動復旧を諦める", async () => {
    const recreate = vi.fn();
    renderHook(() => useColumnCrashRecovery(recreate));
    await act(async () => {
      vi.setSystemTime(0);
      emitCrash("col-1");
    });
    await act(async () => {
      vi.setSystemTime(6000);
      emitCrash("col-1");
    });
    await act(async () => {
      vi.setSystemTime(12000);
      emitCrash("col-1");
    });
    await act(async () => {
      vi.setSystemTime(18000);
      emitCrash("col-1");
    });
    expect(recreate).toHaveBeenCalledTimes(3);
  });

  it("上限到達後も安定稼働時間が経過すれば再度復旧する", async () => {
    const recreate = vi.fn();
    renderHook(() => useColumnCrashRecovery(recreate));
    await act(async () => {
      vi.setSystemTime(0);
      emitCrash("col-1");
    });
    await act(async () => {
      vi.setSystemTime(6000);
      emitCrash("col-1");
    });
    await act(async () => {
      vi.setSystemTime(12000);
      emitCrash("col-1");
    });
    await act(async () => {
      vi.setSystemTime(18000);
      emitCrash("col-1");
    });
    expect(recreate).toHaveBeenCalledTimes(3);

    await act(async () => {
      vi.setSystemTime(72000);
      emitCrash("col-1");
    });
    expect(recreate).toHaveBeenCalledTimes(4);
  });
});

describe("useColumnFocusClearsUnread", () => {
  beforeEach(() => {
    capturedCallbacks.clear();
    mockUnlisten.mockReset();
  });

  function emitFocus(columnId: string) {
    capturedCallbacks.get(IPC_EVENTS.COLUMN_WEBVIEW_FOCUSED)?.({
      payload: columnId,
    });
  }

  it("column-webview-focusedイベント受信時payloadのcolumnIdでclearUnreadCountを呼ぶ", async () => {
    const clearUnreadCount = vi.fn();
    renderHook(() => useColumnFocusClearsUnread(clearUnreadCount));
    await act(async () => {
      emitFocus("col-1");
    });
    expect(clearUnreadCount).toHaveBeenCalledWith("col-1");
  });

  it("異なるcolumnIdのイベントが複数回来た場合それぞれ正しいcolumnIdで呼ばれる", async () => {
    const clearUnreadCount = vi.fn();
    renderHook(() => useColumnFocusClearsUnread(clearUnreadCount));
    await act(async () => {
      emitFocus("col-1");
      emitFocus("col-2");
    });
    expect(clearUnreadCount).toHaveBeenCalledWith("col-1");
    expect(clearUnreadCount).toHaveBeenCalledWith("col-2");
    expect(clearUnreadCount).toHaveBeenCalledTimes(2);
  });
});

describe("useNewPostsNotification", () => {
  beforeEach(() => {
    capturedCallbacks.clear();
    mockUnlisten.mockReset();
    isPermissionGrantedMock.mockReset();
    requestPermissionMock.mockReset();
    sendNotificationMock.mockReset();
    __resetNotificationPermissionCacheForTests();
    useAppStore.setState({ columns: [makeColumn({ id: "col-1" })] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function emitNewPosts(label: string, count: number) {
    capturedCallbacks.get(IPC_EVENTS.WEBVIEW_NEW_POSTS_COUNT)?.({
      payload: { label, count },
    });
  }

  function setNotificationColumn() {
    useAppStore.setState({
      columns: [
        makeColumn({
          id: "col-1",
          pageType: "notifications",
          settings: {
            ...DEFAULT_COLUMN_SETTINGS,
            autoReloadEnabled: true,
            desktopNotifyEnabled: true,
          },
        }),
      ],
    });
  }

  it("label から column- プレフィックスを除いた columnId で setUnreadCount を呼ぶ", async () => {
    isPermissionGrantedMock.mockResolvedValue(false);
    requestPermissionMock.mockResolvedValue("denied");
    useAppStore.setState({
      columns: [
        makeColumn({
          id: "col-1",
          settings: { ...DEFAULT_COLUMN_SETTINGS, desktopNotifyEnabled: true },
        }),
      ],
    });
    const setUnreadCount = vi.fn();
    renderHook(() => useNewPostsNotification(setUnreadCount));
    await act(async () => {
      emitNewPosts("column-col-1", 3);
    });
    expect(setUnreadCount).toHaveBeenCalledWith("col-1", 3);
  });

  it("新着があるとsendNotificationが呼ばれて本文にカラム名が含まれる", async () => {
    isPermissionGrantedMock.mockResolvedValue(true);
    const col = makeColumn({
      id: "col-1",
      pageType: "notifications",
      settings: {
        ...DEFAULT_COLUMN_SETTINGS,
        autoReloadEnabled: true,
        desktopNotifyEnabled: true,
      },
    });
    useAppStore.setState({ columns: [col] });
    const setUnreadCount = vi.fn();
    renderHook(() => useNewPostsNotification(setUnreadCount));
    await act(async () => {
      emitNewPosts("column-col-1", 1);
    });
    const expectedColumnName = getColumnLabel(col);
    expect(sendNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "新着通知",
        body: expect.stringContaining(expectedColumnName),
      }),
    );
    expect(requestPermissionMock).not.toHaveBeenCalled();
  });

  it("未許可の場合はrequestPermissionを呼び、許可されればsendNotificationを呼ぶ（本文にカラム名が含まれる）", async () => {
    isPermissionGrantedMock.mockResolvedValue(false);
    requestPermissionMock.mockResolvedValue("granted");
    const col = makeColumn({
      id: "col-1",
      pageType: "notifications",
      settings: {
        ...DEFAULT_COLUMN_SETTINGS,
        autoReloadEnabled: true,
        desktopNotifyEnabled: true,
      },
    });
    useAppStore.setState({ columns: [col] });
    const setUnreadCount = vi.fn();
    renderHook(() => useNewPostsNotification(setUnreadCount));
    await act(async () => {
      emitNewPosts("column-col-1", 1);
    });
    expect(requestPermissionMock).toHaveBeenCalled();
    const expectedColumnName = getColumnLabel(col);
    expect(sendNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "新着通知",
        body: expect.stringContaining(expectedColumnName),
      }),
    );
  });

  it("権限が拒否された場合は通知しない", async () => {
    isPermissionGrantedMock.mockResolvedValue(false);
    requestPermissionMock.mockResolvedValue("denied");
    setNotificationColumn();
    const setUnreadCount = vi.fn();
    renderHook(() => useNewPostsNotification(setUnreadCount));
    await act(async () => {
      emitNewPosts("column-col-1", 5);
    });
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it("拒否された後に再度新着が来てもrequestPermissionは再度呼ばれない", async () => {
    isPermissionGrantedMock.mockResolvedValue(false);
    requestPermissionMock.mockResolvedValue("denied");
    setNotificationColumn();
    const setUnreadCount = vi.fn();
    renderHook(() => useNewPostsNotification(setUnreadCount));
    await act(async () => {
      emitNewPosts("column-col-1", 1);
    });
    await act(async () => {
      emitNewPosts("column-col-1", 2);
    });
    expect(requestPermissionMock).toHaveBeenCalledTimes(1);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it("desktopNotifyEnabledが無効なカラム（デフォルト設定）はバッジも通知も送らない", async () => {
    isPermissionGrantedMock.mockResolvedValue(true);
    const setUnreadCount = vi.fn();
    renderHook(() => useNewPostsNotification(setUnreadCount));
    await act(async () => {
      emitNewPosts("column-col-1", 5);
    });
    expect(setUnreadCount).not.toHaveBeenCalled();
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it("count が 0 のときは通知を送らない", async () => {
    isPermissionGrantedMock.mockResolvedValue(true);
    setNotificationColumn();
    const setUnreadCount = vi.fn();
    renderHook(() => useNewPostsNotification(setUnreadCount));
    await act(async () => {
      emitNewPosts("column-col-1", 0);
    });
    expect(setUnreadCount).toHaveBeenCalledWith("col-1", 0);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it("desktopNotifyEnabledが有効なカラムは通知される（本文にカラム名が含まれる）", async () => {
    isPermissionGrantedMock.mockResolvedValue(true);
    const col = makeColumn({
      id: "col-1",
      pageType: "search",
      settings: {
        ...DEFAULT_COLUMN_SETTINGS,
        autoReloadEnabled: true,
        desktopNotifyEnabled: true,
      },
    });
    useAppStore.setState({ columns: [col] });
    const setUnreadCount = vi.fn();
    renderHook(() => useNewPostsNotification(setUnreadCount));
    await act(async () => {
      emitNewPosts("column-col-1", 1);
    });
    const expectedColumnName = getColumnLabel(col);
    expect(sendNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "新着通知",
        body: expect.stringContaining(expectedColumnName),
      }),
    );
  });

  it("desktopNotifyEnabledが無効なカラムはバッジも通知も更新されない", async () => {
    isPermissionGrantedMock.mockResolvedValue(true);
    useAppStore.setState({
      columns: [
        makeColumn({
          id: "col-1",
          pageType: "search",
          settings: {
            ...DEFAULT_COLUMN_SETTINGS,
            autoReloadEnabled: true,
            desktopNotifyEnabled: false,
          },
        }),
      ],
    });
    const setUnreadCount = vi.fn();
    renderHook(() => useNewPostsNotification(setUnreadCount));
    await act(async () => {
      emitNewPosts("column-col-1", 2);
    });
    expect(setUnreadCount).not.toHaveBeenCalled();
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it("notificationsカラムでもdesktopNotifyEnabledが無効ならバッジも通知も更新されない", async () => {
    isPermissionGrantedMock.mockResolvedValue(true);
    const col = makeColumn({
      id: "col-1",
      pageType: "notifications",
      settings: { ...DEFAULT_COLUMN_SETTINGS, autoReloadEnabled: true },
    });
    useAppStore.setState({ columns: [col] });
    const setUnreadCount = vi.fn();
    renderHook(() => useNewPostsNotification(setUnreadCount));
    await act(async () => {
      emitNewPosts("column-col-1", 1);
    });
    expect(setUnreadCount).not.toHaveBeenCalled();
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it("notificationsカラムでdesktopNotifyEnabledが有効なら通知される（本文にカラム名が含まれる）", async () => {
    isPermissionGrantedMock.mockResolvedValue(true);
    const col = makeColumn({
      id: "col-1",
      pageType: "notifications",
      settings: {
        ...DEFAULT_COLUMN_SETTINGS,
        autoReloadEnabled: true,
        desktopNotifyEnabled: true,
      },
    });
    useAppStore.setState({ columns: [col] });
    const setUnreadCount = vi.fn();
    renderHook(() => useNewPostsNotification(setUnreadCount));
    await act(async () => {
      emitNewPosts("column-col-1", 1);
    });
    const expectedColumnName = getColumnLabel(col);
    expect(sendNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "新着通知",
        body: expect.stringContaining(expectedColumnName),
      }),
    );
  });

  it("カラムにlabelが設定されている場合、通知本文にそのlabelが含まれる", async () => {
    isPermissionGrantedMock.mockResolvedValue(true);
    const col = makeColumn({
      id: "col-1",
      label: "My Custom Column",
      pageType: "home",
      settings: {
        ...DEFAULT_COLUMN_SETTINGS,
        autoReloadEnabled: true,
        desktopNotifyEnabled: true,
      },
    });
    useAppStore.setState({ columns: [col] });
    const setUnreadCount = vi.fn();
    renderHook(() => useNewPostsNotification(setUnreadCount));
    await act(async () => {
      emitNewPosts("column-col-1", 1);
    });
    expect(sendNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "新着通知",
        body: expect.stringContaining("My Custom Column"),
      }),
    );
  });

  it("カラムにlabelが設定されていない場合、通知本文にページタイプラベルが含まれる", async () => {
    isPermissionGrantedMock.mockResolvedValue(true);
    const col = makeColumn({
      id: "col-1",
      pageType: "notifications",
      settings: {
        ...DEFAULT_COLUMN_SETTINGS,
        autoReloadEnabled: true,
        desktopNotifyEnabled: true,
      },
    });
    useAppStore.setState({ columns: [col] });
    const setUnreadCount = vi.fn();
    renderHook(() => useNewPostsNotification(setUnreadCount));
    await act(async () => {
      emitNewPosts("column-col-1", 1);
    });
    // notifications ページタイプのラベルは "通知"
    expect(sendNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "新着通知",
        body: expect.stringContaining("通知"),
      }),
    );
  });
});

describe("useApiRateLimitReports", () => {
  beforeEach(() => {
    capturedCallbacks.clear();
    mockUnlisten.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function emitRateLimit(
    label: string,
    bucketKey: string,
    limit: number,
    remaining: number,
    reset: number,
    accountId: string | null,
  ) {
    capturedCallbacks.get(IPC_EVENTS.WEBVIEW_API_RATE_LIMIT)?.({
      payload: { label, bucketKey, limit, remaining, reset, accountId },
    });
  }

  it("payloadのaccountIdでsetApiRateLimitが呼ばれる", async () => {
    const setApiRateLimit = vi.fn();
    vi.setSystemTime(1700000000000);
    renderHook(() => useApiRateLimitReports(setApiRateLimit));
    await act(async () => {
      emitRateLimit(
        "column-col-1",
        "home_timeline",
        500,
        100,
        1700000000,
        "acc-1",
      );
    });
    expect(setApiRateLimit).toHaveBeenCalledWith("acc-1", {
      bucketKey: "home_timeline",
      limit: 500,
      remaining: 100,
      reset: 1700000000,
      updatedAt: 1700000000000,
    });
  });

  it("常駐コンポーズ由来のlabelでもpayloadのaccountIdでsetApiRateLimitが呼ばれる", async () => {
    const setApiRateLimit = vi.fn();
    vi.setSystemTime(1700000000000);
    renderHook(() => useApiRateLimitReports(setApiRateLimit));
    await act(async () => {
      emitRateLimit(
        "compose-xxxx",
        "create_tweet",
        150,
        50,
        1700000000,
        "acc-2",
      );
    });
    expect(setApiRateLimit).toHaveBeenCalledWith("acc-2", {
      bucketKey: "create_tweet",
      limit: 150,
      remaining: 50,
      reset: 1700000000,
      updatedAt: 1700000000000,
    });
  });

  it("payloadのaccountIdがnullの場合はsetApiRateLimitが呼ばれない", async () => {
    const setApiRateLimit = vi.fn();
    renderHook(() => useApiRateLimitReports(setApiRateLimit));
    await act(async () => {
      emitRateLimit(
        "column-non-existent",
        "home_timeline",
        500,
        100,
        1700000000,
        null,
      );
    });
    expect(setApiRateLimit).not.toHaveBeenCalled();
  });
});

describe("useOfficialSettingsBroadcast", () => {
  beforeEach(() => {
    capturedCallbacks.clear();
    mockUnlisten.mockReset();
    evalInColumnMock.mockReset();
  });

  it("正常系: 2アカウント(acc-1, acc-2)がそれぞれ1カラムずつ持つ状態で、acc-1からのスナップショット受信時、acc-2の代表カラムに applyOfficialSettingsSnapshot の結果がevalInColumnで実行されること", async () => {
    useAppStore.setState({
      accounts: [
        {
          id: "acc-1",
          label: "Account 1",
          xUserId: "user1",
          dataDirectory: "/path/1",
          color: "#1DA1F2",
          createdAt: "2026-01-01T00:00:00Z",
        },
        {
          id: "acc-2",
          label: "Account 2",
          xUserId: "user2",
          dataDirectory: "/path/2",
          color: "#1DA1F2",
          createdAt: "2026-01-01T00:00:00Z",
        },
      ],
      columns: [
        makeColumn({ id: "col-1", accountId: "acc-1", pageType: "home" }),
        makeColumn({ id: "col-2", accountId: "acc-2", pageType: "home" }),
      ],
    });
    renderHook(() => useOfficialSettingsBroadcast());
    const snapshot = JSON.stringify({
      local: { themeColor: "blue" },
      nightMode: "0",
    });
    await act(async () => {
      capturedCallbacks.get(IPC_EVENTS.WEBVIEW_OFFICIAL_SETTINGS_CAPTURED)?.({
        payload: { accountId: "acc-1", snapshot },
      });
    });
    expect(evalInColumnMock).toHaveBeenCalledTimes(2);
    // acc-1 (source): TRIGGER_RELOAD
    expect(evalInColumnMock).toHaveBeenCalledWith(
      "col-1",
      expect.stringContaining("triggerReload"),
    );
    // acc-2: applyOfficialSettingsSnapshot (contains "incoming" variable which is in that script)
    expect(evalInColumnMock).toHaveBeenCalledWith(
      "col-2",
      expect.stringContaining("incoming"),
    );
  });

  it("配布元(sourceAccountId)自身のカラムには applyOfficialSettingsSnapshot ではなく TRIGGER_RELOAD が実行されること", async () => {
    useAppStore.setState({
      accounts: [
        {
          id: "acc-1",
          label: "Account 1",
          xUserId: "user1",
          dataDirectory: "/path/1",
          color: "#1DA1F2",
          createdAt: "2026-01-01T00:00:00Z",
        },
      ],
      columns: [
        makeColumn({ id: "col-1", accountId: "acc-1", pageType: "home" }),
      ],
    });
    renderHook(() => useOfficialSettingsBroadcast());
    const snapshot = JSON.stringify({
      local: { themeColor: "blue" },
      nightMode: "0",
    });
    await act(async () => {
      capturedCallbacks.get(IPC_EVENTS.WEBVIEW_OFFICIAL_SETTINGS_CAPTURED)?.({
        payload: { accountId: "acc-1", snapshot },
      });
    });
    expect(evalInColumnMock).toHaveBeenCalledTimes(1);
    expect(evalInColumnMock).toHaveBeenCalledWith(
      "col-1",
      expect.stringContaining("triggerReload"),
    );
  });

  it("compose/external カラムを除外し、通常のカラムを優先して選ぶこと(あるアカウントが home カラムと compose カラムの両方を持つ場合、home カラムへ配布されること)", async () => {
    useAppStore.setState({
      accounts: [
        {
          id: "acc-1",
          label: "Account 1",
          xUserId: "user1",
          dataDirectory: "/path/1",
          color: "#1DA1F2",
          createdAt: "2026-01-01T00:00:00Z",
        },
        {
          id: "acc-2",
          label: "Account 2",
          xUserId: "user2",
          dataDirectory: "/path/2",
          color: "#1DA1F2",
          createdAt: "2026-01-01T00:00:00Z",
        },
      ],
      columns: [
        makeColumn({ id: "col-1", accountId: "acc-1", pageType: "home" }),
        makeColumn({
          id: "col-2",
          accountId: "acc-2",
          pageType: "compose",
          order: 0,
        }),
        makeColumn({
          id: "col-3",
          accountId: "acc-2",
          pageType: "home",
          order: 1,
        }),
      ],
    });
    renderHook(() => useOfficialSettingsBroadcast());
    const snapshot = JSON.stringify({
      local: { themeColor: "red" },
      nightMode: "1",
    });
    await act(async () => {
      capturedCallbacks.get(IPC_EVENTS.WEBVIEW_OFFICIAL_SETTINGS_CAPTURED)?.({
        payload: { accountId: "acc-1", snapshot },
      });
    });
    expect(evalInColumnMock).toHaveBeenCalledTimes(2);
    // acc-1 (source): TRIGGER_RELOAD
    expect(evalInColumnMock).toHaveBeenCalledWith(
      "col-1",
      expect.stringContaining("triggerReload"),
    );
    // acc-2: should prefer home column (col-3) over compose column (col-2)
    expect(evalInColumnMock).toHaveBeenCalledWith("col-3", expect.any(String));
  });

  it("compose カラムしか持たないアカウントには、フォールバックでそのカラムへ配布されること", async () => {
    useAppStore.setState({
      accounts: [
        {
          id: "acc-1",
          label: "Account 1",
          xUserId: "user1",
          dataDirectory: "/path/1",
          color: "#1DA1F2",
          createdAt: "2026-01-01T00:00:00Z",
        },
        {
          id: "acc-2",
          label: "Account 2",
          xUserId: "user2",
          dataDirectory: "/path/2",
          color: "#1DA1F2",
          createdAt: "2026-01-01T00:00:00Z",
        },
      ],
      columns: [
        makeColumn({ id: "col-1", accountId: "acc-1", pageType: "home" }),
        makeColumn({ id: "col-2", accountId: "acc-2", pageType: "compose" }),
      ],
    });
    renderHook(() => useOfficialSettingsBroadcast());
    const snapshot = JSON.stringify({
      local: { themeColor: "green" },
      nightMode: "2",
    });
    await act(async () => {
      capturedCallbacks.get(IPC_EVENTS.WEBVIEW_OFFICIAL_SETTINGS_CAPTURED)?.({
        payload: { accountId: "acc-1", snapshot },
      });
    });
    expect(evalInColumnMock).toHaveBeenCalledTimes(2);
    // acc-1 (source): TRIGGER_RELOAD
    expect(evalInColumnMock).toHaveBeenCalledWith(
      "col-1",
      expect.stringContaining("triggerReload"),
    );
    // acc-2: only has compose column, so fallback to that
    expect(evalInColumnMock).toHaveBeenCalledWith("col-2", expect.any(String));
  });

  it("不正なJSON文字列を受信した場合、evalInColumn が一切呼ばれないこと(JSON.parse 失敗で処理中断)", async () => {
    useAppStore.setState({
      accounts: [
        {
          id: "acc-1",
          label: "Account 1",
          xUserId: "user1",
          dataDirectory: "/path/1",
          color: "#1DA1F2",
          createdAt: "2026-01-01T00:00:00Z",
        },
        {
          id: "acc-2",
          label: "Account 2",
          xUserId: "user2",
          dataDirectory: "/path/2",
          color: "#1DA1F2",
          createdAt: "2026-01-01T00:00:00Z",
        },
      ],
      columns: [
        makeColumn({ id: "col-1", accountId: "acc-1", pageType: "home" }),
        makeColumn({ id: "col-2", accountId: "acc-2", pageType: "home" }),
      ],
    });
    renderHook(() => useOfficialSettingsBroadcast());
    await act(async () => {
      capturedCallbacks.get(IPC_EVENTS.WEBVIEW_OFFICIAL_SETTINGS_CAPTURED)?.({
        payload: { accountId: "acc-1", snapshot: "invalid json {" },
      });
    });
    expect(evalInColumnMock).not.toHaveBeenCalled();
  });

  it("OFFICIAL_SETTINGS_WHITELIST_KEYS に含まれないキー(例: pushNotificationsPermission)が受信ペイロードに含まれていても、evalInColumn に渡す最終的なJSON文字列にそのキーが含まれないこと", async () => {
    useAppStore.setState({
      accounts: [
        {
          id: "acc-1",
          label: "Account 1",
          xUserId: "user1",
          dataDirectory: "/path/1",
          color: "#1DA1F2",
          createdAt: "2026-01-01T00:00:00Z",
        },
        {
          id: "acc-2",
          label: "Account 2",
          xUserId: "user2",
          dataDirectory: "/path/2",
          color: "#1DA1F2",
          createdAt: "2026-01-01T00:00:00Z",
        },
      ],
      columns: [
        makeColumn({ id: "col-1", accountId: "acc-1", pageType: "home" }),
        makeColumn({ id: "col-2", accountId: "acc-2", pageType: "home" }),
      ],
    });
    renderHook(() => useOfficialSettingsBroadcast());
    const snapshot = JSON.stringify({
      local: {
        themeColor: "blue",
        pushNotificationsPermission: "granted",
        someOtherKey: "should_be_filtered",
      },
      nightMode: "0",
    });
    await act(async () => {
      capturedCallbacks.get(IPC_EVENTS.WEBVIEW_OFFICIAL_SETTINGS_CAPTURED)?.({
        payload: { accountId: "acc-1", snapshot },
      });
    });
    expect(evalInColumnMock).toHaveBeenCalledTimes(2);
    // Check the call for acc-2 (non-source account at index 1)
    const callArg = evalInColumnMock.mock.calls[1][1];
    expect(callArg).not.toContain("pushNotificationsPermission");
    expect(callArg).not.toContain("someOtherKey");
    expect(callArg).toContain("themeColor");
  });

  it("nightMode が 0/1/2/null 以外の値(例えCookie属性を含む不正な文字列)の場合、evalInColumn に渡す最終的なJSON文字列の nightMode が undefined として扱われること(JSON.stringifyで省略されるか存在しないことを確認する)", async () => {
    useAppStore.setState({
      accounts: [
        {
          id: "acc-1",
          label: "Account 1",
          xUserId: "user1",
          dataDirectory: "/path/1",
          color: "#1DA1F2",
          createdAt: "2026-01-01T00:00:00Z",
        },
        {
          id: "acc-2",
          label: "Account 2",
          xUserId: "user2",
          dataDirectory: "/path/2",
          color: "#1DA1F2",
          createdAt: "2026-01-01T00:00:00Z",
        },
      ],
      columns: [
        makeColumn({ id: "col-1", accountId: "acc-1", pageType: "home" }),
        makeColumn({ id: "col-2", accountId: "acc-2", pageType: "home" }),
      ],
    });
    renderHook(() => useOfficialSettingsBroadcast());
    const snapshot = JSON.stringify({
      local: { themeColor: "blue" },
      nightMode: "invalid_value; path=/; domain=.x.com",
    });
    await act(async () => {
      capturedCallbacks.get(IPC_EVENTS.WEBVIEW_OFFICIAL_SETTINGS_CAPTURED)?.({
        payload: { accountId: "acc-1", snapshot },
      });
    });
    expect(evalInColumnMock).toHaveBeenCalledTimes(2);
    // Check the call for acc-2 (non-source account at index 1)
    const callArg = evalInColumnMock.mock.calls[1][1];
    // nightMode が undefined で stringified されないことを確認
    // Extract the safeSnapshotJson from the script
    const jsonMatch = callArg.match(/var incoming=(\{.*?\});/s);
    if (jsonMatch && jsonMatch[1]) {
      const parsed = JSON.parse(jsonMatch[1]);
      expect(parsed.nightMode).toBeUndefined();
    }
  });
});

describe("useOfficialSettingsPopupReload", () => {
  beforeEach(() => {
    capturedCallbacks.clear();
    mockUnlisten.mockReset();
  });

  function emitCaptured() {
    capturedCallbacks.get(IPC_EVENTS.WEBVIEW_OFFICIAL_SETTINGS_CAPTURED)?.({
      payload: { accountId: "acc-1", snapshot: "{}" },
    });
  }

  function emitClosed() {
    capturedCallbacks.get(IPC_EVENTS.OFFICIAL_SETTINGS_POPUP_CLOSED)?.({
      payload: undefined,
    });
  }

  it("適用イベントなしで閉じたイベントのみ発火した場合、recreateAllWebviewsが呼ばれない", async () => {
    const recreateAllWebviews = vi.fn();
    renderHook(() => useOfficialSettingsPopupReload(recreateAllWebviews));
    await act(async () => {
      emitClosed();
    });
    expect(recreateAllWebviews).not.toHaveBeenCalled();
  });

  it("適用イベント→閉じたイベントの順で発火した場合、recreateAllWebviewsが1回呼ばれる", async () => {
    const recreateAllWebviews = vi.fn();
    renderHook(() => useOfficialSettingsPopupReload(recreateAllWebviews));
    await act(async () => {
      emitCaptured();
      emitClosed();
    });
    expect(recreateAllWebviews).toHaveBeenCalledTimes(1);
  });

  it("適用→閉じた→(再適用なしで)閉じた、の順で発火した場合、2回目は呼ばれない", async () => {
    const recreateAllWebviews = vi.fn();
    renderHook(() => useOfficialSettingsPopupReload(recreateAllWebviews));
    await act(async () => {
      emitCaptured();
      emitClosed();
      emitClosed();
    });
    expect(recreateAllWebviews).toHaveBeenCalledTimes(1);
  });

  it("適用イベント発火後にrecreateAllWebviewsの参照を差し替えてから閉じたイベントを発火すると、新しい方の関数が呼ばれる", async () => {
    const oldRecreateAllWebviews = vi.fn();
    const newRecreateAllWebviews = vi.fn();
    const { rerender } = renderHook(
      ({ fn }: { fn: () => void }) => useOfficialSettingsPopupReload(fn),
      { initialProps: { fn: oldRecreateAllWebviews } },
    );
    await act(async () => {
      emitCaptured();
    });
    rerender({ fn: newRecreateAllWebviews });
    await act(async () => {
      emitClosed();
    });
    expect(oldRecreateAllWebviews).not.toHaveBeenCalled();
    expect(newRecreateAllWebviews).toHaveBeenCalledTimes(1);
  });
});
