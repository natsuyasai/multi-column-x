import { describe, it, expect } from "vitest";
import { OFFSCREEN } from "../constants/ipc";
import type { Column } from "../types";
import {
  calculateGridBounds,
  MOBILE_TAB_BAR_HEIGHT,
  MOBILE_TWO_COLUMN_MIN_WIDTH,
  mobileColumnLayout,
  resolveSwipeAreaHeight,
} from "./gridLayout";

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

describe("MOBILE_TWO_COLUMN_MIN_WIDTH", () => {
  it("600 px で定義されている", () => {
    expect(MOBILE_TWO_COLUMN_MIN_WIDTH).toBe(600);
  });
});

describe("mobileColumnLayout", () => {
  const cols3 = [
    { id: "c1", order: 0 },
    { id: "c2", order: 1 },
    { id: "c3", order: 2 },
  ];

  // 仕様 #1
  it("activeColumnIdがnullのとき、全カラムが画面外に退避する", () => {
    const result = mobileColumnLayout({
      columns: cols3,
      activeColumnId: null,
      twoColumnEnabled: true,
      viewportWidth: 800,
      viewportHeight: 1000,
      swipeAreaHeight: 0,
    });
    expect(result["c1"].x).toBe(OFFSCREEN.MOBILE_X);
    expect(result["c2"].x).toBe(OFFSCREEN.MOBILE_X);
    expect(result["c3"].x).toBe(OFFSCREEN.MOBILE_X);
  });

  // 仕様 #2
  it("activeColumnIdがcolumnsに存在しないIDのとき、フォールバックせず全カラムが画面外になる", () => {
    const result = mobileColumnLayout({
      columns: cols3,
      activeColumnId: "unknown-id",
      twoColumnEnabled: true,
      viewportWidth: 800,
      viewportHeight: 1000,
      swipeAreaHeight: 0,
    });
    expect(result["c1"].x).toBe(OFFSCREEN.MOBILE_X);
    expect(result["c2"].x).toBe(OFFSCREEN.MOBILE_X);
    expect(result["c3"].x).toBe(OFFSCREEN.MOBILE_X);
  });

  // 仕様 #3: twoColumnEnabled=false
  it("twoColumnEnabledがfalseのとき、アクティブのみ全幅表示で他は画面外になる", () => {
    const result = mobileColumnLayout({
      columns: cols3,
      activeColumnId: "c2",
      twoColumnEnabled: false,
      viewportWidth: 800,
      viewportHeight: 1000,
      swipeAreaHeight: 20,
    });
    expect(result["c2"]).toEqual({
      x: 0,
      y: 0,
      width: 800,
      height: 1000 - (56 + 20),
    });
    expect(result["c1"].x).toBe(OFFSCREEN.MOBILE_X);
    expect(result["c3"].x).toBe(OFFSCREEN.MOBILE_X);
  });

  // 仕様 #3: viewportWidthが600未満
  it("viewportWidthが600未満のとき、アクティブのみ全幅表示で他は画面外になる", () => {
    const result = mobileColumnLayout({
      columns: cols3,
      activeColumnId: "c2",
      twoColumnEnabled: true,
      viewportWidth: 599,
      viewportHeight: 1000,
      swipeAreaHeight: 0,
    });
    expect(result["c2"]).toEqual({
      x: 0,
      y: 0,
      width: 599,
      height: 1000 - 56,
    });
    expect(result["c1"].x).toBe(OFFSCREEN.MOBILE_X);
    expect(result["c3"].x).toBe(OFFSCREEN.MOBILE_X);
  });

  // 仕様 #3: columns.lengthが1未満(1のみ)
  it("columnsが1件のとき、アクティブのみ全幅表示になる", () => {
    const result = mobileColumnLayout({
      columns: [{ id: "c1", order: 0 }],
      activeColumnId: "c1",
      twoColumnEnabled: true,
      viewportWidth: 800,
      viewportHeight: 1000,
      swipeAreaHeight: 0,
    });
    expect(result["c1"]).toEqual({
      x: 0,
      y: 0,
      width: 800,
      height: 1000 - 56,
    });
  });

  // 仕様 #4
  it("2カラム条件成立時、order順でアクティブとその右隣が左右に並ぶ", () => {
    const result = mobileColumnLayout({
      columns: cols3,
      activeColumnId: "c1",
      twoColumnEnabled: true,
      viewportWidth: 800,
      viewportHeight: 1000,
      swipeAreaHeight: 0,
    });
    expect(result["c1"]).toEqual({ x: 0, y: 0, width: 400, height: 944 });
    expect(result["c2"]).toEqual({ x: 400, y: 0, width: 400, height: 944 });
    expect(result["c3"].x).toBe(OFFSCREEN.MOBILE_X);
  });

  // 仕様 #4: 幅合計が厳密一致することの確認
  it("2カラム表示の幅の合計はviewportWidthに厳密一致する", () => {
    const result = mobileColumnLayout({
      columns: cols3,
      activeColumnId: "c1",
      twoColumnEnabled: true,
      viewportWidth: 800,
      viewportHeight: 1000,
      swipeAreaHeight: 0,
    });
    expect(result["c1"].width + result["c2"].width).toBe(800);
  });

  // 仕様 #5
  it("アクティブがorder末尾のとき、ペア窓は左隣とアクティブにクランプされる", () => {
    const result = mobileColumnLayout({
      columns: cols3,
      activeColumnId: "c3",
      twoColumnEnabled: true,
      viewportWidth: 800,
      viewportHeight: 1000,
      swipeAreaHeight: 0,
    });
    expect(result["c1"].x).toBe(OFFSCREEN.MOBILE_X);
    expect(result["c2"]).toEqual({ x: 0, y: 0, width: 400, height: 944 });
    expect(result["c3"]).toEqual({ x: 400, y: 0, width: 400, height: 944 });
  });

  // 仕様 #6: viewportWidth === 600 の境界値
  it("viewportWidthがちょうど600のとき、2カラム表示になる", () => {
    const result = mobileColumnLayout({
      columns: cols3,
      activeColumnId: "c1",
      twoColumnEnabled: true,
      viewportWidth: 600,
      viewportHeight: 1000,
      swipeAreaHeight: 0,
    });
    expect(result["c1"].width).toBe(300);
    expect(result["c2"].width).toBe(300);
    expect(result["c2"].x).toBe(300);
  });

  // 仕様 #7: 奇数幅
  it("奇数幅のとき、左は切り捨て・右は残り幅になる", () => {
    const result = mobileColumnLayout({
      columns: cols3,
      activeColumnId: "c1",
      twoColumnEnabled: true,
      viewportWidth: 601,
      viewportHeight: 1000,
      swipeAreaHeight: 0,
    });
    expect(result["c1"].width).toBe(300);
    expect(result["c2"].width).toBe(301);
    expect(result["c1"].width + result["c2"].width).toBe(601);
  });

  // 仕様 #8
  it("表示カラムのyは常に0、heightはタブバーとスワイプ帯を引いた値になる", () => {
    const result = mobileColumnLayout({
      columns: cols3,
      activeColumnId: "c1",
      twoColumnEnabled: true,
      viewportWidth: 800,
      viewportHeight: 1000,
      swipeAreaHeight: 30,
    });
    expect(result["c1"].y).toBe(0);
    expect(result["c2"].y).toBe(0);
    expect(result["c1"].height).toBe(1000 - (56 + 30));
    expect(result["c2"].height).toBe(1000 - (56 + 30));
  });

  // 仕様 #9
  it("表示ペア以外のカラムはすべて画面外x座標になる", () => {
    const cols4 = [
      { id: "c1", order: 0 },
      { id: "c2", order: 1 },
      { id: "c3", order: 2 },
      { id: "c4", order: 3 },
    ];
    const result = mobileColumnLayout({
      columns: cols4,
      activeColumnId: "c2",
      twoColumnEnabled: true,
      viewportWidth: 800,
      viewportHeight: 1000,
      swipeAreaHeight: 0,
    });
    expect(result["c1"].x).toBe(OFFSCREEN.MOBILE_X);
    expect(result["c2"].x).toBe(0);
    expect(result["c3"].x).toBe(400);
    expect(result["c4"].x).toBe(OFFSCREEN.MOBILE_X);
  });

  it("columns順がorder順でなくても内部でソートして正しくペアを組む", () => {
    const shuffled = [
      { id: "c3", order: 2 },
      { id: "c1", order: 0 },
      { id: "c2", order: 1 },
    ];
    const result = mobileColumnLayout({
      columns: shuffled,
      activeColumnId: "c2",
      twoColumnEnabled: true,
      viewportWidth: 800,
      viewportHeight: 1000,
      swipeAreaHeight: 0,
    });
    expect(result["c2"]).toEqual({ x: 0, y: 0, width: 400, height: 944 });
    expect(result["c3"]).toEqual({ x: 400, y: 0, width: 400, height: 944 });
    expect(result["c1"].x).toBe(OFFSCREEN.MOBILE_X);
  });
});
