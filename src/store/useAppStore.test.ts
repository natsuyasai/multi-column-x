import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAppStore, migrateColumn } from "./useAppStore";
import type { Account, Column } from "../types";

// Mock invoke from @tauri-apps/api/core
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

const mockAccount: Account = {
  id: "acc-1",
  label: "テストアカウント",
  dataDirectory: "/path/to/data",
  color: "#1d9bf0",
  createdAt: "2026-05-02T00:00:00Z",
};

const mockColumn: Column = {
  id: "col-1",
  accountId: "acc-1",
  pageType: "home",
  homeTabName: "フォロー中",
  width: 350,
  order: 0,
  gridRow: 1,
  gridCol: 1,
  heightMode: "auto",
  settings: {
    autoReloadEnabled: true,
    autoReloadInterval: 60,
    showCountdown: true,
    areaRemoveEnabled: true,
    showCustomMenu: false,
    scrollPosRestoreEnabled: true,
    customCSS: "",
    visibleLinks: [],
    smallImageEnabled: false,
    smallImageWidth: "50%",
    blurImageEnabled: false,
    blurImageAmount: "10px",
  },
};

describe("useAppStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // ストアをリセット
    useAppStore.setState({
      accounts: [],
      columns: [],
      globalSettings: {
        theme: "dark",
        customCSS: "",
        windowBounds: { x: 0, y: 0, width: 1400, height: 900 },
        defaultAutoReloadEnabled: true,
        defaultAutoReloadInterval: 60,
        defaultShowCountdown: true,
        defaultAreaRemoveEnabled: true,
        defaultShowCustomMenu: false,
        defaultScrollPosRestoreEnabled: true,
        defaultColumnCustomCSS: "",
        popupEscCloseEnabled: true,
        videoAutoPlayStopEnabled: false,
        showSortButtons: true,
        smallImageEnabled: false,
        smallImageWidth: "50%",
        blurImageEnabled: false,
        blurImageAmount: "10px",
        hideAdEnabled: false,
        zoomLevel: 1,
        useXAppForCompose: false,
      },
      isLoaded: false,
      isMobile: false,
      unreadCounts: {},
    });
  });

  it("アカウントを追加できる", () => {
    const { result } = renderHook(() => useAppStore());
    act(() => {
      result.current.addAccount(mockAccount);
    });
    expect(result.current.accounts).toContainEqual(mockAccount);
  });

  it("アカウントを削除できる", () => {
    const { result } = renderHook(() => useAppStore());
    act(() => {
      result.current.addAccount(mockAccount);
      result.current.removeAccount("acc-1");
    });
    expect(result.current.accounts).not.toContainEqual(mockAccount);
  });

  it("カラムを追加できる", () => {
    const { result } = renderHook(() => useAppStore());
    act(() => {
      result.current.addColumn(mockColumn);
    });
    expect(result.current.columns).toContainEqual(mockColumn);
  });

  it("カラムを削除できる", () => {
    const { result } = renderHook(() => useAppStore());
    act(() => {
      result.current.addColumn(mockColumn);
      result.current.removeColumn("col-1");
    });
    expect(result.current.columns).not.toContainEqual(mockColumn);
  });

  it("カラム設定を更新できる", () => {
    const { result } = renderHook(() => useAppStore());
    act(() => {
      result.current.addColumn(mockColumn);
      result.current.updateColumn("col-1", { width: 400 });
    });
    expect(result.current.columns[0].width).toBe(400);
  });

  it("isMobile のデフォルト値は false", () => {
    const { result } = renderHook(() => useAppStore());
    expect(result.current.isMobile).toBe(false);
  });

  it("setIsMobile で isMobile を変更できる", () => {
    const { result } = renderHook(() => useAppStore());
    act(() => {
      result.current.setIsMobile(true);
    });
    expect(result.current.isMobile).toBe(true);
  });

  it("setUnreadCount でカラムの未読数をセットできる", () => {
    const { result } = renderHook(() => useAppStore());
    act(() => {
      result.current.addColumn(mockColumn);
      result.current.setUnreadCount("col-1", 5);
    });
    expect(result.current.unreadCounts["col-1"]).toBe(5);
  });

  it("clearUnreadCount でカラムの未読数を0にリセットできる", () => {
    const { result } = renderHook(() => useAppStore());
    act(() => {
      result.current.addColumn(mockColumn);
      result.current.setUnreadCount("col-1", 5);
      result.current.clearUnreadCount("col-1");
    });
    expect(result.current.unreadCounts["col-1"]).toBe(0);
  });

  it("unreadCounts の初期値は空オブジェクト", () => {
    const { result } = renderHook(() => useAppStore());
    expect(result.current.unreadCounts).toEqual({});
  });
});

describe("migrateColumn", () => {
  it("gridフィールドがない既存カラムにデフォルト値を補完する", () => {
    const legacy = {
      id: "col-1",
      accountId: "acc-1",
      pageType: "home" as const,
      width: 350,
      order: 2,
      settings: {
        autoReloadEnabled: true,
        autoReloadInterval: 60,
        showCountdown: true,
        areaRemoveEnabled: true,
        customCSS: "",
        visibleLinks: [],
        smallImageEnabled: false,
        smallImageWidth: "50%",
      },
    };
    const result = migrateColumn(legacy as unknown as Column);
    expect(result.gridRow).toBe(1);
    expect(result.gridCol).toBe(3); // order + 1
    expect(result.heightMode).toBe("auto");
    expect(result.heightValue).toBeUndefined();
    expect(result.heightUnit).toBeUndefined();
  });

  it("gridフィールドがある新しいカラムはそのまま返す", () => {
    const col: Column = {
      ...mockColumn,
      gridRow: 2,
      gridCol: 3,
      heightMode: "fixed",
      heightValue: 400,
      heightUnit: "px",
    };
    const result = migrateColumn(col);
    expect(result.gridRow).toBe(2);
    expect(result.gridCol).toBe(3);
    expect(result.heightMode).toBe("fixed");
    expect(result.heightValue).toBe(400);
  });
});
