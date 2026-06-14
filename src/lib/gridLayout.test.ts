import { describe, it, expect } from "vitest";
import {
  calculateGridBounds,
  MOBILE_TAB_BAR_HEIGHT,
  mobileColumnBounds,
  resolveSwipeAreaHeight,
} from "./gridLayout";
import type { Column } from "../types";

const baseSettings = {
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
    headerHeight: 36,
    scrollbarHeight: 12,
  };

  // 1カラム: headersTotal=36, available=800-12-36=752
  it("横一列（gridCol=1 のみ）の場合、x=0, y=headerHeight でheight=available", () => {
    const cols = [makeCol({ id: "c1", gridCol: 1, gridRow: 1 })];
    const result = calculateGridBounds(cols, opts);
    expect(result["c1"]).toEqual({ x: 0, y: 36, width: 350, height: 752 });
  });

  // topBarHeight 指定時、bounds.y に topBarHeight が加算される
  it("topBarHeight が指定されたとき、bounds.y は topBarHeight+headerHeight からスタート", () => {
    const cols = [makeCol({ id: "c1", gridCol: 1, gridRow: 1 })];
    const result = calculateGridBounds(cols, { ...opts, topBarHeight: 32 });
    expect(result["c1"]).toEqual({ x: 0, y: 32 + 36, width: 350, height: 752 });
  });

  it("topBarHeight が省略された場合は 0 として扱う（後方互換）", () => {
    const cols = [makeCol({ id: "c1", gridCol: 1, gridRow: 1 })];
    const result = calculateGridBounds(cols, opts);
    expect(result["c1"].y).toBe(36);
  });

  // 2カラム縦積み + topBarHeight: c2.y には topBar も加算される
  it("縦積みカラムでも topBarHeight が全行の y に正しく加算される", () => {
    const cols = [
      makeCol({ id: "c1", gridCol: 1, gridRow: 1 }),
      makeCol({ id: "c2", gridCol: 1, gridRow: 2 }),
    ];
    const result = calculateGridBounds(cols, { ...opts, topBarHeight: 32 });
    expect(result["c1"].y).toBe(32 + 36);
    expect(result["c2"].y).toBe(32 + 36 + 358 + 36);
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
    expect(result["c1"].x).toBe(0);
    expect(result["c2"].x).toBe(350); // c1.width
  });

  it("scrollLeft が x 座標に反映される", () => {
    const cols = [makeCol({ id: "c1", gridCol: 1, gridRow: 1 })];
    const result = calculateGridBounds(cols, { ...opts, scrollLeft: 100 });
    expect(result["c1"].x).toBe(-100);
  });
});

describe("MOBILE_TAB_BAR_HEIGHT", () => {
  it("56 px で定義されている", () => {
    expect(MOBILE_TAB_BAR_HEIGHT).toBe(56);
  });
});

describe("resolveSwipeAreaHeight", () => {
  it("有効なら設定値の高さを返す", () => {
    expect(
      resolveSwipeAreaHeight({
        mobileSwipeAreaEnabled: true,
        mobileSwipeAreaHeight: 28,
      }),
    ).toBe(28);
  });

  it("無効なら0を返す", () => {
    expect(
      resolveSwipeAreaHeight({
        mobileSwipeAreaEnabled: false,
        mobileSwipeAreaHeight: 28,
      }),
    ).toBe(0);
  });
});

describe("mobileColumnBounds", () => {
  it("アクティブはx=0,y=0で高さからタブバーと帯を引く", () => {
    expect(
      mobileColumnBounds({
        isActive: true,
        swipeAreaHeight: 28,
        viewportWidth: 400,
        viewportHeight: 800,
      }),
    ).toEqual({ x: 0, y: 0, width: 400, height: 800 - 56 - 28 });
  });

  it("非アクティブはxが画面外", () => {
    const b = mobileColumnBounds({
      isActive: false,
      swipeAreaHeight: 0,
      viewportWidth: 400,
      viewportHeight: 800,
    });
    expect(b.x).toBeLessThan(0);
    expect(b.y).toBe(0);
    expect(b.height).toBe(800 - 56);
  });
});
