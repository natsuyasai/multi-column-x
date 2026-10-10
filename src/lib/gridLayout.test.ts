import { afterEach, describe, it, expect } from "vitest";
import { OFFSCREEN } from "../constants/ipc";
import type { Column } from "../types";
import {
  calculateGridBounds,
  clampMobileColumnCount,
  getHeaderHeight,
  getMobileTabBarHeight,
  getScrollbarHeight,
  getTopBarHeight,
  MOBILE_TWO_COLUMN_MIN_WIDTH,
  mobileColumnLayout,
  resolveSwipeAreaHeight,
} from "./gridLayout";
import { setRootFontPx } from "./uiScale";

const baseSettings = {
  autoReloadEnabled: true,
  autoReloadInterval: 60,
  showCountdown: true,
  hideHeaderEnabled: true,
  hideTweetInputEnabled: true,
  showCustomMenu: false,
  scrollPosRestoreEnabled: true,
  customCSS: "",
  visibleLinks: [],
  smallImageEnabled: false,
  smallImageWidth: "50%",
  blurImageEnabled: false,
  blurImageAmount: "10px",
  ngWords: [],
  repostHiddenUserIds: [],
  whitelistEnabled: false,
  whitelistWords: [],
  returnToLastReadEnabled: false,
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

describe("レイアウト高さ（rem 定数を px 化する関数）", () => {
  afterEach(() => {
    setRootFontPx(16);
  });

  it("倍率1.0（root 16px）では従来の px 値と一致する", () => {
    expect(getHeaderHeight()).toBe(36);
    expect(getScrollbarHeight()).toBe(12);
    expect(getMobileTabBarHeight()).toBe(56);
    expect(getTopBarHeight(false)).toBe(32);
    expect(getTopBarHeight(true)).toBe(64);
  });

  it("倍率1.25（root 20px）では全ての高さが1.25倍になる", () => {
    setRootFontPx(20);
    expect(getHeaderHeight()).toBe(45);
    expect(getScrollbarHeight()).toBe(15);
    expect(getMobileTabBarHeight()).toBe(70);
    expect(getTopBarHeight(false)).toBe(40);
    expect(getTopBarHeight(true)).toBe(80);
  });

  it("倍率1.25のときモバイルのカラム高さはタブバー高さ（70px）を引いた値になる", () => {
    setRootFontPx(20);
    const layout = mobileColumnLayout({
      columns: [makeCol({ id: "a", gridCol: 0, gridRow: 0 })],
      activeColumnId: "a",
      twoColumnEnabled: false,
      columnCount: 2,
      viewportWidth: 400,
      viewportHeight: 800,
    });
    expect(layout.a.height).toBe(730);
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
      columnCount: 2,
      viewportWidth: 800,
      viewportHeight: 1000,
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
      columnCount: 2,
      viewportWidth: 800,
      viewportHeight: 1000,
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
      columnCount: 2,
      viewportWidth: 800,
      viewportHeight: 1000,
    });
    expect(result["c2"]).toEqual({
      x: 0,
      y: 0,
      width: 800,
      height: 1000 - 56,
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
      columnCount: 2,
      viewportWidth: 599,
      viewportHeight: 1000,
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
      columnCount: 2,
      viewportWidth: 800,
      viewportHeight: 1000,
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
      columnCount: 2,
      viewportWidth: 800,
      viewportHeight: 1000,
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
      columnCount: 2,
      viewportWidth: 800,
      viewportHeight: 1000,
    });
    expect(result["c1"].width + result["c2"].width).toBe(800);
  });

  // 仕様 #5
  it("アクティブがorder末尾のとき、ペア窓は左隣とアクティブにクランプされる", () => {
    const result = mobileColumnLayout({
      columns: cols3,
      activeColumnId: "c3",
      twoColumnEnabled: true,
      columnCount: 2,
      viewportWidth: 800,
      viewportHeight: 1000,
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
      columnCount: 2,
      viewportWidth: 600,
      viewportHeight: 1000,
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
      columnCount: 2,
      viewportWidth: 601,
      viewportHeight: 1000,
    });
    expect(result["c1"].width).toBe(300);
    expect(result["c2"].width).toBe(301);
    expect(result["c1"].width + result["c2"].width).toBe(601);
  });

  // 仕様 #8
  it("表示カラムのyは常に0、heightはタブバーを引いた値になる", () => {
    const result = mobileColumnLayout({
      columns: cols3,
      activeColumnId: "c1",
      twoColumnEnabled: true,
      columnCount: 2,
      viewportWidth: 800,
      viewportHeight: 1000,
    });
    expect(result["c1"].y).toBe(0);
    expect(result["c2"].y).toBe(0);
    expect(result["c1"].height).toBe(1000 - 56);
    expect(result["c2"].height).toBe(1000 - 56);
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
      columnCount: 2,
      viewportWidth: 800,
      viewportHeight: 1000,
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
      columnCount: 2,
      viewportWidth: 800,
      viewportHeight: 1000,
    });
    expect(result["c2"]).toEqual({ x: 0, y: 0, width: 400, height: 944 });
    expect(result["c3"]).toEqual({ x: 400, y: 0, width: 400, height: 944 });
    expect(result["c1"].x).toBe(OFFSCREEN.MOBILE_X);
  });
});

describe("mobileColumnLayout 列数設定", () => {
  const cols7 = Array.from({ length: 7 }, (_, i) => ({
    id: `C${i + 1}`,
    order: i,
  }));
  const idsOf = (cols: { id: string }[]) => cols.map((c) => c.id);
  const visibleIds = (
    result: Record<string, { x: number }>,
    ids: string[],
  ): string[] => ids.filter((id) => result[id].x >= 0);

  it("列数を3に設定すると幅が十分なときアクティブ位置から連続3列が等幅で表示される", () => {
    const result = mobileColumnLayout({
      columns: cols7,
      activeColumnId: "C2",
      twoColumnEnabled: true,
      columnCount: 3,
      viewportWidth: 1200,
      viewportHeight: 1000,
    });
    expect(visibleIds(result, idsOf(cols7))).toEqual(["C2", "C3", "C4"]);
    expect(result["C2"].x).toBe(0);
    expect(result["C3"].x).toBe(400);
    expect(result["C4"].x).toBe(800);
    expect(result["C2"].width).toBe(400);
    expect(result["C3"].width).toBe(400);
    expect(result["C4"].width).toBe(400);
    for (const id of ["C1", "C5", "C6", "C7"]) {
      expect(result[id].x).toBe(OFFSCREEN.MOBILE_X);
    }
  });

  it("末尾付近のカラムをアクティブにすると窓が左へずれてN列が保たれる", () => {
    const result = mobileColumnLayout({
      columns: cols7,
      activeColumnId: "C7",
      twoColumnEnabled: true,
      columnCount: 3,
      viewportWidth: 1200,
      viewportHeight: 1000,
    });
    expect(visibleIds(result, idsOf(cols7))).toEqual(["C5", "C6", "C7"]);
    expect(result["C5"].x).toBe(0);
    expect(result["C6"].x).toBe(400);
    expect(result["C7"].x).toBe(800);
  });

  it("列数が登録カラム数より多いときは登録カラム数だけ表示される", () => {
    const cols2 = cols7.slice(0, 2);
    const result = mobileColumnLayout({
      columns: cols2,
      activeColumnId: "C1",
      twoColumnEnabled: true,
      columnCount: 4,
      viewportWidth: 1200,
      viewportHeight: 1000,
    });
    expect(visibleIds(result, idsOf(cols2))).toEqual(["C1", "C2"]);
    expect(result["C1"].width).toBe(600);
    expect(result["C2"].width).toBe(600);
  });

  it("1列あたりの最小幅を下回る列数は入る最大列数に自動で減らされる", () => {
    const result = mobileColumnLayout({
      columns: cols7,
      activeColumnId: "C1",
      twoColumnEnabled: true,
      columnCount: 6,
      viewportWidth: 900,
      viewportHeight: 1000,
    });
    expect(visibleIds(result, idsOf(cols7))).toEqual(["C1", "C2", "C3"]);
    expect(result["C1"].width).toBe(300);
    expect(result["C3"].x).toBe(600);
  });

  it("画面幅が600dp未満のときは列数設定にかかわらず1列表示になる", () => {
    const result = mobileColumnLayout({
      columns: cols7,
      activeColumnId: "C2",
      twoColumnEnabled: true,
      columnCount: 3,
      viewportWidth: 500,
      viewportHeight: 1000,
    });
    expect(visibleIds(result, idsOf(cols7))).toEqual(["C2"]);
    expect(result["C2"]).toEqual({ x: 0, y: 0, width: 500, height: 944 });
  });

  it("複数カラム表示がOFFのときは列数設定にかかわらず1列表示になる", () => {
    const result = mobileColumnLayout({
      columns: cols7,
      activeColumnId: "C2",
      twoColumnEnabled: false,
      columnCount: 4,
      viewportWidth: 1200,
      viewportHeight: 1000,
    });
    expect(visibleIds(result, idsOf(cols7))).toEqual(["C2"]);
    expect(result["C2"].width).toBe(1200);
  });

  it("列数の既定値は2であり従来の2カラム表示と同じ配置になる", () => {
    const base = {
      columns: cols7,
      activeColumnId: "C2",
      twoColumnEnabled: true,
      viewportWidth: 1201,
      viewportHeight: 1000,
    };
    const explicit = mobileColumnLayout({ ...base, columnCount: 2 });
    const unset = mobileColumnLayout({
      ...base,
      columnCount: undefined as unknown as number,
    });
    expect(visibleIds(explicit, idsOf(cols7))).toEqual(["C2", "C3"]);
    expect(explicit["C2"]).toEqual({ x: 0, y: 0, width: 600, height: 944 });
    expect(explicit["C3"]).toEqual({ x: 600, y: 0, width: 601, height: 944 });
    expect(unset).toEqual(explicit);
  });

  it("範囲外の列数は2から6に丸められる", () => {
    expect(clampMobileColumnCount(1)).toBe(2);
    expect(clampMobileColumnCount(7)).toBe(6);
    expect(clampMobileColumnCount(0)).toBe(2);
    expect(clampMobileColumnCount(-3)).toBe(2);
    expect(clampMobileColumnCount(Number.NaN)).toBe(2);
    expect(clampMobileColumnCount(3.9)).toBe(3);
    expect(clampMobileColumnCount(6)).toBe(6);
    expect(clampMobileColumnCount(2)).toBe(2);

    const wide = {
      columns: cols7,
      activeColumnId: "C1",
      twoColumnEnabled: true,
      viewportWidth: 2400,
      viewportHeight: 1000,
    };
    expect(
      visibleIds(mobileColumnLayout({ ...wide, columnCount: 1 }), idsOf(cols7)),
    ).toEqual(["C1", "C2"]);
    expect(
      visibleIds(mobileColumnLayout({ ...wide, columnCount: 7 }), idsOf(cols7)),
    ).toEqual(["C1", "C2", "C3", "C4", "C5", "C6"]);
  });
});
