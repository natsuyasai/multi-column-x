import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { IPC_EVENTS } from "../constants/ipc";
import { useAppStore } from "../store/useAppStore";
import { DEFAULT_COLUMN_SETTINGS, getColumnLabel } from "../types";
import type { Column } from "../types";
import {
  __resetNotificationPermissionCacheForTests,
  useColumnCrashRecovery,
  useColumnFocusClearsUnread,
  useNewPostsNotification,
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
