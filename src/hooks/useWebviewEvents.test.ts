import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { IPC_EVENTS } from "../constants/ipc";
import { useAppStore } from "../store/useAppStore";
import { DEFAULT_COLUMN_SETTINGS } from "../types";
import type { Column } from "../types";
import {
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

describe("useNewPostsNotification", () => {
  beforeEach(() => {
    capturedCallbacks.clear();
    mockUnlisten.mockReset();
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

  it("label から column- プレフィックスを除いた columnId で setUnreadCount を呼ぶ", async () => {
    const setUnreadCount = vi.fn();
    renderHook(() => useNewPostsNotification(setUnreadCount));
    await act(async () => {
      emitNewPosts("column-col-1", 3);
    });
    expect(setUnreadCount).toHaveBeenCalledWith("col-1", 3);
  });

  it("通知カラムで autoReload 有効・許可済みならデスクトップ通知を出す", async () => {
    const notificationSpy = vi.fn();
    class MockNotification {
      static permission = "granted";
      constructor(title: string, options?: NotificationOptions) {
        notificationSpy(title, options);
      }
    }
    vi.stubGlobal("Notification", MockNotification);
    useAppStore.setState({
      columns: [
        makeColumn({
          id: "col-1",
          pageType: "notifications",
          settings: { ...DEFAULT_COLUMN_SETTINGS, autoReloadEnabled: true },
        }),
      ],
    });
    const setUnreadCount = vi.fn();
    renderHook(() => useNewPostsNotification(setUnreadCount));
    await act(async () => {
      emitNewPosts("column-col-1", 5);
    });
    expect(notificationSpy).toHaveBeenCalledWith("新着通知", {
      body: "5件の新しい通知があります",
    });
  });

  it("通知カラムでないカラムはデスクトップ通知を出さない", async () => {
    const notificationSpy = vi.fn();
    class MockNotification {
      static permission = "granted";
      constructor(title: string, options?: NotificationOptions) {
        notificationSpy(title, options);
      }
    }
    vi.stubGlobal("Notification", MockNotification);
    const setUnreadCount = vi.fn();
    renderHook(() => useNewPostsNotification(setUnreadCount));
    await act(async () => {
      emitNewPosts("column-col-1", 5);
    });
    expect(setUnreadCount).toHaveBeenCalledWith("col-1", 5);
    expect(notificationSpy).not.toHaveBeenCalled();
  });

  it("count が 0 のときはデスクトップ通知を出さない", async () => {
    const notificationSpy = vi.fn();
    class MockNotification {
      static permission = "granted";
      constructor(title: string, options?: NotificationOptions) {
        notificationSpy(title, options);
      }
    }
    vi.stubGlobal("Notification", MockNotification);
    useAppStore.setState({
      columns: [
        makeColumn({
          id: "col-1",
          pageType: "notifications",
          settings: { ...DEFAULT_COLUMN_SETTINGS, autoReloadEnabled: true },
        }),
      ],
    });
    const setUnreadCount = vi.fn();
    renderHook(() => useNewPostsNotification(setUnreadCount));
    await act(async () => {
      emitNewPosts("column-col-1", 0);
    });
    expect(setUnreadCount).toHaveBeenCalledWith("col-1", 0);
    expect(notificationSpy).not.toHaveBeenCalled();
  });
});
