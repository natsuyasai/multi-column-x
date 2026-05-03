import { describe, it, expect } from "vitest";
import { calculateGridBounds } from "./useColumns";
import type { Column } from "../types";

const baseSettings = {
  autoReloadEnabled: true,
  autoReloadInterval: 60,
  showCountdown: true,
  areaRemoveEnabled: true,
  customCSS: "",
  visibleLinks: [],
};

function makeCol(overrides: Partial<Column> & Pick<Column, "id" | "gridCol" | "gridRow">): Column {
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
      makeCol({ id: "c1", gridCol: 1, gridRow: 1, heightMode: "fixed", heightValue: 300, heightUnit: "px" }),
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
      makeCol({ id: "c1", gridCol: 1, gridRow: 1, heightMode: "fixed", heightValue: 50, heightUnit: "%" }),
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
