import { invoke } from "@tauri-apps/api/core";
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { IPC_COMMANDS, STORAGE_KEYS } from "../constants/ipc";
import { useAppStore } from "../store/useAppStore";
import { DEFAULT_COLUMN_SETTINGS, DEFAULT_GLOBAL_SETTINGS } from "../types";
import { useMobileColumns } from "./useMobileColumns";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

const mockInvoke = vi.mocked(invoke);

const account1 = {
  id: "acc-1",
  label: "Account1",
  dataDirectory: "/data/acc-1",
  color: "#1d9bf0",
  createdAt: "2026-01-01T00:00:00Z",
};

const account2 = {
  id: "acc-2",
  label: "Account2",
  dataDirectory: "/data/acc-2",
  color: "#f91880",
  createdAt: "2026-01-01T00:00:00Z",
};

const column1 = {
  id: "col-1",
  accountId: "acc-1",
  pageType: "home" as const,
  homeTabName: "フォロー中",
  width: 350,
  order: 0,
  gridRow: 1,
  gridCol: 1,
  heightMode: "auto" as const,
  settings: { ...DEFAULT_COLUMN_SETTINGS },
};

const column2 = {
  id: "col-2",
  accountId: "acc-2",
  pageType: "home" as const,
  homeTabName: "フォロー中",
  width: 350,
  order: 1,
  gridRow: 1,
  gridCol: 2,
  heightMode: "auto" as const,
  settings: { ...DEFAULT_COLUMN_SETTINGS },
};

function renderMobileColumns(dialogOpen = false) {
  const dialogOpenRef = { current: dialogOpen };
  const rendered = renderHook(() => useMobileColumns(dialogOpenRef));
  return { ...rendered, dialogOpenRef };
}

describe("useMobileColumns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue(undefined);
    localStorage.clear();
    useAppStore.setState({
      accounts: [account1, account2],
      columns: [column1, column2],
      globalSettings: {
        ...DEFAULT_GLOBAL_SETTINGS,
        mobileSwipeAreaEnabled: true,
        mobileSwipeAreaHeight: 28,
      },
      isLoaded: true,
      isMobile: true,
      topBarExpanded: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("setActiveColumnはリサイズ前にアクティブカラムのCookieを切り替える", async () => {
    const { result } = renderMobileColumns();

    await act(async () => {
      await result.current.setActiveColumn("col-1");
    });

    const commandSequence = mockInvoke.mock.calls.map((c) => c[0]);
    const cookieIdx = commandSequence.indexOf(IPC_COMMANDS.SET_COLUMN_COOKIES);
    const firstResizeIdx = commandSequence.indexOf(
      IPC_COMMANDS.RESIZE_COLUMN_WEBVIEW,
    );
    expect(cookieIdx).toBeGreaterThanOrEqual(0);
    expect(firstResizeIdx).toBeGreaterThan(cookieIdx);
    expect(mockInvoke).toHaveBeenCalledWith(IPC_COMMANDS.SET_COLUMN_COOKIES, {
      accountId: "acc-1",
    });
  });

  it("restoreMobileColumnsはlocalStorageのアクティブカラムを復元する", async () => {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_COLUMN_ID, "col-2");
    const { result } = renderMobileColumns();

    await act(async () => {
      await result.current.restoreMobileColumns(
        useAppStore.getState().columns,
        useAppStore.getState().accounts,
      );
    });

    expect(result.current.activeColumnId).toBe("col-2");
    expect(mockInvoke).toHaveBeenCalledWith(IPC_COMMANDS.SET_COLUMN_COOKIES, {
      accountId: "acc-2",
    });
  });

  it("保存されたアクティブカラムIDが存在しない場合はorder最小のカラムにフォールバックする", async () => {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_COLUMN_ID, "col-ghost");
    const { result } = renderMobileColumns();

    await act(async () => {
      await result.current.restoreMobileColumns(
        useAppStore.getState().columns,
        useAppStore.getState().accounts,
      );
    });

    // order が最小（0）の col-1 にフォールバックする
    expect(result.current.activeColumnId).toBe("col-1");
  });

  it("navigateColumnは端のカラムでは何もしない", () => {
    const { result } = renderMobileColumns();
    act(() => {
      // col-2 は order 最大（末尾）
      result.current.setActiveColumnIdState("col-2");
    });
    mockInvoke.mockClear();

    act(() => {
      // "left" は次のカラム（末尾より先）へ進もうとするため範囲外で no-op
      result.current.navigateColumn("left");
    });

    expect(result.current.activeColumnId).toBe("col-2");
    expect(result.current.swipeState).toBeNull();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("ダイアログ表示中はnavigateColumnが無効になる", () => {
    const { result, dialogOpenRef } = renderMobileColumns();
    act(() => {
      // col-1 は隣に col-2 が存在するため、本来は切替可能な状態
      result.current.setActiveColumnIdState("col-1");
    });
    dialogOpenRef.current = true;
    mockInvoke.mockClear();

    act(() => {
      result.current.navigateColumn("left");
    });

    expect(result.current.activeColumnId).toBe("col-1");
    expect(result.current.swipeState).toBeNull();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("カラム切替時にswipeStateがswitchingになり400ms後に解除される", () => {
    vi.useFakeTimers();
    const { result } = renderMobileColumns();
    act(() => {
      result.current.setActiveColumnIdState("col-1");
    });

    act(() => {
      result.current.navigateColumn("left");
    });

    expect(result.current.swipeState).toEqual({
      direction: "left",
      phase: "switching",
    });

    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(result.current.swipeState).toBeNull();
  });
});
