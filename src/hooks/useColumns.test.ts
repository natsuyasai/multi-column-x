import { describe, it, expect, vi, beforeEach } from "vitest";
import { calculateGridBounds, MOBILE_TAB_BAR_HEIGHT, useColumns } from "./useColumns";
import { useAppStore } from "../store/useAppStore";
import { renderHook, act } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));
import type { Column } from "../types";

const baseSettings = {
  autoReloadEnabled: true,
  autoReloadInterval: 60,
  showCountdown: true,
  areaRemoveEnabled: true,
  showCustomMenu: false,
  customCSS: "",
  visibleLinks: [],
};

function makeCol(
  overrides: Partial<Column> & Pick<Column, "id" | "gridCol" | "gridRow">,
): Column {
  return {
    accountId: "acc-1",
    pageType: "home",
    width: 350,
    order: 0,
    heightMode: "auto",
    settings: baseSettings,
    ...overrides,
  };
}

describe("calculateGridBounds", () => {
  const opts = {
    containerHeight: 800,
    scrollLeft: 0,
    sidebarWidth: 40,
    headerHeight: 36,
    scrollbarHeight: 12,
  };

  // 1カラム: headersTotal=36, available=800-12-36=752
  it("横一列（gridCol=1 のみ）の場合、y=headerHeight でheight=available", () => {
    const cols = [makeCol({ id: "c1", gridCol: 1, gridRow: 1 })];
    const result = calculateGridBounds(cols, opts);
    expect(result["c1"]).toEqual({ x: 40, y: 36, width: 350, height: 752 });
  });

  // 2カラム縦積み: headersTotal=72, available=800-12-72=716, autoHeight=358
  it("同じ gridCol に2つのカラムがある場合、縦に積む（autoは均等分割、各行にヘッダー分を含む）", () => {
    const cols = [
      makeCol({ id: "c1", gridCol: 1, gridRow: 1 }),
      makeCol({ id: "c2", gridCol: 1, gridRow: 2 }),
    ];
    const result = calculateGridBounds(cols, opts);
    expect(result["c1"].y).toBe(36);
    expect(result["c1"].height).toBe(358); // 716 / 2 = 358
    expect(result["c2"].y).toBe(36 + 358 + 36); // header + webview + header
    expect(result["c2"].height).toBe(358);
  });

  // fixed px + auto: available=716, c1.height=300, c2.height=716-300=416
  it("heightMode=fixed px のカラムは指定高さで、残りは均等割り", () => {
    const cols = [
      makeCol({
        id: "c1",
        gridCol: 1,
        gridRow: 1,
        heightMode: "fixed",
        heightValue: 300,
        heightUnit: "px",
      }),
      makeCol({ id: "c2", gridCol: 1, gridRow: 2 }),
    ];
    const result = calculateGridBounds(cols, opts);
    expect(result["c1"].height).toBe(300);
    expect(result["c2"].y).toBe(36 + 300 + 36); // c1.y + c1.height + c2.header
    expect(result["c2"].height).toBe(416); // 716 - 300
  });

  // fixed % + auto: available=716, c1.height=716*0.5=358, c2.height=358
  it("heightMode=fixed % のカラムはavailableHeightに対する割合", () => {
    const cols = [
      makeCol({
        id: "c1",
        gridCol: 1,
        gridRow: 1,
        heightMode: "fixed",
        heightValue: 50,
        heightUnit: "%",
      }),
      makeCol({ id: "c2", gridCol: 1, gridRow: 2 }),
    ];
    const result = calculateGridBounds(cols, opts);
    expect(result["c1"].height).toBe(358); // 716 * 0.5 = 358
    expect(result["c2"].height).toBe(358);
  });

  it("異なる gridCol は x 座標をずらす", () => {
    const cols = [
      makeCol({ id: "c1", gridCol: 1, gridRow: 1 }),
      makeCol({ id: "c2", gridCol: 2, gridRow: 1 }),
    ];
    const result = calculateGridBounds(cols, opts);
    expect(result["c1"].x).toBe(40);
    expect(result["c2"].x).toBe(40 + 350); // sidebarWidth + c1.width
  });

  it("scrollLeft が x 座標に反映される", () => {
    const cols = [makeCol({ id: "c1", gridCol: 1, gridRow: 1 })];
    const result = calculateGridBounds(cols, { ...opts, scrollLeft: 100 });
    expect(result["c1"].x).toBe(40 - 100);
  });
});

describe("MOBILE_TAB_BAR_HEIGHT", () => {
  it("56 px で定義されている", () => {
    expect(MOBILE_TAB_BAR_HEIGHT).toBe(56);
  });
});

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
            customCSS: "",
            visibleLinks: [],
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
            customCSS: "",
            visibleLinks: [],
          },
        },
      ],
      globalSettings: {
        theme: "dark",
        customCSS: "",
        windowBounds: { x: 0, y: 0, width: 1400, height: 900 },
        defaultAutoReloadEnabled: true,
        defaultAutoReloadInterval: 60,
        popupEscCloseEnabled: true,
        videoAutoPlayStopEnabled: false,
        showSortButtons: true,
        smallImageEnabled: false,
        smallImageWidth: "50%",
        hideAdEnabled: false,
        zoomLevel: 1,
      },
      isLoaded: true,
      isMobile: true,
    });
  });

  it("setActiveColumn はアクティブ列を (0, tabBarHeight) に、非アクティブ列を (-99999, 0) に移動する", async () => {
    const { result } = renderHook(() => useColumns());
    await act(async () => {
      await result.current.setActiveColumn("col-1");
    });
    // col-1 should be at (0, 56), col-2 at (-99999, 0)
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
      bounds: { columnId: "col-1", x: 0, y: MOBILE_TAB_BAR_HEIGHT },
    });
    expect(col2Call?.[1]).toMatchObject({
      bounds: { columnId: "col-2", x: -99999, y: 0 },
    });
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
