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
    containerWidth: 1000,
    containerHeight: 800,
    scrollLeft: 0,
    sidebarWidth: 40,
    headerHeight: 36,
    scrollbarHeight: 12,
  };

  it("横一列（gridCol=1 のみ）の場合、既存と同じ結果を返す", () => {
    const cols = [makeCol({ id: "c1", gridCol: 1, gridRow: 1 })];
    const result = calculateGridBounds(cols, opts);
    expect(result["c1"]).toEqual({ x: 40, y: 36, width: 350, height: 752 });
    // height = 800 - 36 - 12 = 752
  });

  it("同じ gridCol に2つのカラムがある場合、縦に積む（autoは均等分割）", () => {
    const cols = [
      makeCol({ id: "c1", gridCol: 1, gridRow: 1 }),
      makeCol({ id: "c2", gridCol: 1, gridRow: 2 }),
    ];
    const result = calculateGridBounds(cols, opts);
    expect(result["c1"].y).toBe(36);
    expect(result["c1"].height).toBe(376); // 752 / 2 = 376
    expect(result["c2"].y).toBe(36 + 376);
    expect(result["c2"].height).toBe(376);
  });

  it("heightMode=fixed px のカラムは指定高さで、残りは均等割り", () => {
    const cols = [
      makeCol({ id: "c1", gridCol: 1, gridRow: 1, heightMode: "fixed", heightValue: 300, heightUnit: "px" }),
      makeCol({ id: "c2", gridCol: 1, gridRow: 2 }),
    ];
    const result = calculateGridBounds(cols, opts);
    expect(result["c1"].height).toBe(300);
    expect(result["c2"].y).toBe(36 + 300);
    expect(result["c2"].height).toBe(752 - 300); // 残り全部
  });

  it("heightMode=fixed % のカラムはコンテナ高さに対する割合", () => {
    const cols = [
      makeCol({ id: "c1", gridCol: 1, gridRow: 1, heightMode: "fixed", heightValue: 50, heightUnit: "%" }),
      makeCol({ id: "c2", gridCol: 1, gridRow: 2 }),
    ];
    const result = calculateGridBounds(cols, opts);
    expect(result["c1"].height).toBe(376); // 752 * 0.5 = 376
    expect(result["c2"].height).toBe(376);
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
