import { invoke } from "@tauri-apps/api/core";
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAppStore } from "../store/useAppStore";
import { useColumns } from "./useColumns";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

// calculateGridBounds のテストは src/lib/gridLayout.test.ts へ移動した

describe("useColumns mobile", () => {
  const mockInvoke = vi.mocked(invoke);

  beforeEach(() => {
    vi.clearAllMocks();
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
      columns: [
        {
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
            ngWords: [],
          },
        },
        {
          id: "col-2",
          accountId: "acc-1",
          pageType: "home",
          homeTabName: "フォロー中",
          width: 350,
          order: 1,
          gridRow: 1,
          gridCol: 2,
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
            ngWords: [],
          },
        },
      ],
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
        imagePopupEnabled: true,
        videoPopupEnabled: true,
        showSortButtons: true,
        smallImageEnabled: false,
        smallImageWidth: "50%",
        blurImageEnabled: false,
        blurImageAmount: "10px",
        hideAdEnabled: false,
        columnScale: "default",
        useXAppForCompose: false,
        mobileSwipeAreaEnabled: true,
        mobileSwipeAreaHeight: 28,
        presets: [],
        ngWords: [],
      },
      isLoaded: true,
      isMobile: true,
    });
  });

  it("setActiveColumn はアクティブ列を (0, 0) に、非アクティブ列を (-99999, 0) に移動する", async () => {
    const { result } = renderHook(() => useColumns());
    await act(async () => {
      await result.current.setActiveColumn("col-1");
    });
    // col-1 should be at (0, 0), col-2 at (-99999, 0)
    const calls = mockInvoke.mock.calls.filter(
      (c) => c[0] === "resize_column_webview",
    );
    const col1Call = calls.find(
      (c) => (c[1] as any).bounds.columnId === "col-1",
    );
    const col2Call = calls.find(
      (c) => (c[1] as any).bounds.columnId === "col-2",
    );
    expect(col1Call?.[1]).toMatchObject({
      bounds: { columnId: "col-1", x: 0, y: 0 },
    });
    expect(col2Call?.[1]).toMatchObject({
      bounds: { columnId: "col-2", x: -99999, y: 0 },
    });
  });

  it("recreateColumnWebview は対象カラムを remove してから create し直す", async () => {
    const { result } = renderHook(() => useColumns());
    await act(async () => {
      await result.current.setActiveColumn("col-1");
    });
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue(undefined);

    await act(async () => {
      await result.current.recreateColumnWebview("col-1");
    });

    const removeIdx = mockInvoke.mock.calls.findIndex(
      (c) =>
        c[0] === "remove_column_webview" && (c[1] as any).columnId === "col-1",
    );
    const createIdx = mockInvoke.mock.calls.findIndex(
      (c) =>
        c[0] === "create_column_webview" &&
        (c[1] as any).args.column.id === "col-1",
    );
    expect(removeIdx).toBeGreaterThanOrEqual(0);
    expect(createIdx).toBeGreaterThanOrEqual(0);
    // remove が create より前に呼ばれる（クラッシュ状態の WebView を破棄してから再作成）
    expect(removeIdx).toBeLessThan(createIdx);
  });

  it("recreateColumnWebview は存在しないカラムでは何もしない", async () => {
    const { result } = renderHook(() => useColumns());
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue(undefined);

    await act(async () => {
      await result.current.recreateColumnWebview("col-unknown");
    });

    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("handleRemoveColumn でアクティブ列を削除すると order が最小の列がアクティブになる", async () => {
    const { result } = renderHook(() => useColumns());
    // set col-1 active first
    await act(async () => {
      await result.current.setActiveColumn("col-1");
    });
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue(undefined);
    // remove col-1 (active)
    await act(async () => {
      await result.current.handleRemoveColumn("col-1");
    });
    // col-2 should become active
    expect(result.current.activeColumnId).toBe("col-2");
  });
});
