import { invoke } from "@tauri-apps/api/core";
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { OFFSCREEN } from "../constants/ipc";
import { useAppStore } from "../store/useAppStore";
import type { Column } from "../types";
import { DEFAULT_COLUMN_SETTINGS, DEFAULT_GLOBAL_SETTINGS } from "../types";
import { useColumns } from "./useColumns";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

// desktop パスの Linux 用 useEffect が platform() を呼ぶため、Windows 相当でモックする。
vi.mock("@tauri-apps/plugin-os", () => ({
  platform: vi.fn(() => "windows"),
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

describe("useColumns desktop recreateAllWebviews", () => {
  const mockInvoke = vi.mocked(invoke);

  // desktop の restoreColumns は containerRef.current.clientHeight を読む。
  // jsdom は clientHeight を計測しないため、固定値を返す div を ref に差し込む。
  function attachContainer(
    ref: { current: HTMLDivElement | null },
    clientHeight = 900,
  ) {
    const div = document.createElement("div");
    Object.defineProperty(div, "clientHeight", {
      value: clientHeight,
      configurable: true,
    });
    ref.current = div;
  }

  function makeColumn(id: string, gridCol: number): Column {
    return {
      id,
      accountId: "acc-1",
      pageType: "home",
      homeTabName: "フォロー中",
      width: 350,
      order: gridCol - 1,
      gridRow: 1,
      gridCol,
      heightMode: "auto",
      settings: { ...DEFAULT_COLUMN_SETTINGS },
    };
  }

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
      columns: [makeColumn("col-1", 1), makeColumn("col-2", 2)],
      globalSettings: { ...DEFAULT_GLOBAL_SETTINGS },
      isLoaded: true,
      isMobile: false,
      topBarExpanded: false,
    });
  });

  /** columnId ごとに最後の resize_column_webview 呼び出しの bounds を返す。 */
  function lastResizeBoundsById(): Record<string, { x: number }> {
    const result: Record<string, { x: number }> = {};
    for (const call of mockInvoke.mock.calls) {
      if (call[0] !== "resize_column_webview") continue;
      const bounds = (call[1] as { bounds: { columnId: string; x: number } })
        .bounds;
      result[bounds.columnId] = bounds;
    }
    return result;
  }

  it("ダイアログ表示中に recreateAllWebviews すると再生成後にカラムをオフスクリーンへ再退避する", async () => {
    // 回帰: 再認証（AccountManager ダイアログ表示中）に列を再読み込みすると、
    // recreateAllWebviews が列 WebView を前面に表示し直して TopBar/ダイアログを
    // 操作不能にしていた。ダイアログ表示中は再生成後も退避を維持する。
    const { result } = renderHook(() => useColumns());
    attachContainer(result.current.containerRef);
    act(() => {
      result.current.setDialogOpen(true);
    });
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue(undefined);

    await act(async () => {
      await result.current.recreateAllWebviews();
    });

    const last = lastResizeBoundsById();
    expect(last["col-1"]?.x).toBe(OFFSCREEN.DESKTOP_X);
    expect(last["col-2"]?.x).toBe(OFFSCREEN.DESKTOP_X);
  });

  it("ダイアログ非表示中の recreateAllWebviews はカラムを通常座標に配置する（退避しない）", async () => {
    const { result } = renderHook(() => useColumns());
    attachContainer(result.current.containerRef);
    // dialogOpen は既定 false
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue(undefined);

    await act(async () => {
      await result.current.recreateAllWebviews();
    });

    const last = lastResizeBoundsById();
    expect(last["col-1"]?.x).not.toBe(OFFSCREEN.DESKTOP_X);
    expect(last["col-2"]?.x).not.toBe(OFFSCREEN.DESKTOP_X);
  });
});
