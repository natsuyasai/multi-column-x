import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAppStore } from "./useAppStore";
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
  settings: {
    autoReloadEnabled: true,
    autoReloadInterval: 60,
    showCountdown: true,
    areaRemoveEnabled: true,
    customCSS: "",
    visibleLinks: [],
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
      },
      isLoaded: false,
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
});
