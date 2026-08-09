import { describe, it, expect } from "vitest";
import { buildGroups, normalizeOrder, moveGroup } from "@/lib/columnOrder";
import type { Column } from "@/types";

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
  whitelistEnabled: false,
  whitelistWords: [],
};

function makeColumn(overrides: Partial<Column> & { id: string }): Column {
  return {
    accountId: "acc-1",
    pageType: "home",
    width: 350,
    order: 0,
    gridRow: 1,
    gridCol: 1,
    heightMode: "auto",
    settings: baseSettings,
    ...overrides,
  };
}

describe("buildGroups", () => {
  it("gridColごとにグループ化されgridCol昇順で返る", () => {
    const columns: Column[] = [
      makeColumn({ id: "c2", gridCol: 2, gridRow: 1 }),
      makeColumn({ id: "c1", gridCol: 1, gridRow: 1 }),
    ];
    const groups = buildGroups(columns);
    expect(groups.map((g) => g.gridCol)).toEqual([1, 2]);
  });

  it("グループ内はgridRow昇順で返る", () => {
    const columns: Column[] = [
      makeColumn({ id: "c1", gridCol: 1, gridRow: 2 }),
      makeColumn({ id: "c2", gridCol: 1, gridRow: 1 }),
    ];
    const groups = buildGroups(columns);
    expect(groups[0].columns.map((c) => c.id)).toEqual(["c2", "c1"]);
  });

  it("gridRowまたはgridColが0以下のカラムは除外される", () => {
    const columns: Column[] = [
      makeColumn({ id: "c1", gridCol: 0, gridRow: 1 }),
      makeColumn({ id: "c2", gridCol: 1, gridRow: 0 }),
      makeColumn({ id: "c3", gridCol: -1, gridRow: -1 }),
      makeColumn({ id: "c4", gridCol: 1, gridRow: 1 }),
    ];
    const groups = buildGroups(columns);
    expect(groups).toHaveLength(1);
    expect(groups[0].columns.map((c) => c.id)).toEqual(["c4"]);
  });

  it("空配列を渡すと空配列が返る", () => {
    expect(buildGroups([])).toEqual([]);
  });
});

describe("normalizeOrder", () => {
  it("orderがgridCol昇順gridRow昇順で0から連番になる", () => {
    const columns: Column[] = [
      makeColumn({ id: "c1", gridCol: 2, gridRow: 1, order: 5 }),
      makeColumn({ id: "c2", gridCol: 1, gridRow: 2, order: 5 }),
      makeColumn({ id: "c3", gridCol: 1, gridRow: 1, order: 5 }),
    ];
    const result = normalizeOrder(columns);
    const byId = new Map(result.map((c) => [c.id, c.order]));
    expect(byId.get("c3")).toBe(0); // gridCol1 gridRow1
    expect(byId.get("c2")).toBe(1); // gridCol1 gridRow2
    expect(byId.get("c1")).toBe(2); // gridCol2 gridRow1
  });

  it("未割当カラムは既存order順で末尾に並ぶ", () => {
    const columns: Column[] = [
      makeColumn({ id: "c1", gridCol: 0, gridRow: 0, order: 1 }),
      makeColumn({ id: "c2", gridCol: 1, gridRow: 1, order: 10 }),
      makeColumn({ id: "c3", gridCol: 0, gridRow: 0, order: 0 }),
    ];
    const result = normalizeOrder(columns);
    const byId = new Map(result.map((c) => [c.id, c.order]));
    expect(byId.get("c2")).toBe(0);
    // 未割当は既存 order 順(c3:0 → c1:1)で末尾へ
    expect(byId.get("c3")).toBe(1);
    expect(byId.get("c1")).toBe(2);
  });

  it("割当と未割当が混在してもorderが重複しない", () => {
    const columns: Column[] = [
      makeColumn({ id: "c1", gridCol: 2, gridRow: 1, order: 3 }),
      makeColumn({ id: "c2", gridCol: 0, gridRow: 0, order: 1 }),
      makeColumn({ id: "c3", gridCol: 1, gridRow: 1, order: 2 }),
      makeColumn({ id: "c4", gridCol: 0, gridRow: 0, order: 0 }),
    ];
    const result = normalizeOrder(columns);
    const orders = result.map((c) => c.order).sort((a, b) => a - b);
    expect(orders).toEqual([0, 1, 2, 3]);
    expect(new Set(orders).size).toBe(orders.length);
  });

  it("元の配列の要素順序は保持される", () => {
    const columns: Column[] = [
      makeColumn({ id: "c3", gridCol: 3, gridRow: 1 }),
      makeColumn({ id: "c1", gridCol: 1, gridRow: 1 }),
      makeColumn({ id: "c2", gridCol: 2, gridRow: 1 }),
    ];
    const result = normalizeOrder(columns);
    expect(result.map((c) => c.id)).toEqual(["c3", "c1", "c2"]);
  });
});

describe("moveGroup", () => {
  it("グループを下へ移動するとgridColが入れ替わる", () => {
    const columns: Column[] = [
      makeColumn({ id: "c1", gridCol: 1, gridRow: 1 }),
      makeColumn({ id: "c2", gridCol: 2, gridRow: 1 }),
    ];
    const result = moveGroup(columns, 0, 1);
    const byId = new Map(result.map((c) => [c.id, c.gridCol]));
    expect(byId.get("c1")).toBe(2);
    expect(byId.get("c2")).toBe(1);
  });

  it("グループを上へ移動するとgridColが入れ替わる", () => {
    const columns: Column[] = [
      makeColumn({ id: "c1", gridCol: 1, gridRow: 1 }),
      makeColumn({ id: "c2", gridCol: 2, gridRow: 1 }),
    ];
    const result = moveGroup(columns, 1, 0);
    const byId = new Map(result.map((c) => [c.id, c.gridCol]));
    expect(byId.get("c1")).toBe(2);
    expect(byId.get("c2")).toBe(1);
  });

  it("縦積みグループは全メンバーが同じgridColへ一緒に移動する", () => {
    const columns: Column[] = [
      makeColumn({ id: "c1", gridCol: 1, gridRow: 1 }),
      makeColumn({ id: "c2", gridCol: 1, gridRow: 2 }),
      makeColumn({ id: "c3", gridCol: 2, gridRow: 1 }),
    ];
    const result = moveGroup(columns, 0, 1);
    const byId = new Map(result.map((c) => [c.id, c.gridCol]));
    expect(byId.get("c1")).toBe(2);
    expect(byId.get("c2")).toBe(2);
    expect(byId.get("c3")).toBe(1);
  });

  it("gridColが飛び番のとき空き列番号が維持される", () => {
    const columns: Column[] = [
      makeColumn({ id: "c1", gridCol: 1, gridRow: 1 }),
      makeColumn({ id: "c2", gridCol: 3, gridRow: 1 }),
    ];
    const result = moveGroup(columns, 0, 1);
    const gridCols = result.map((c) => c.gridCol).sort((a, b) => a - b);
    expect(gridCols).toEqual([1, 3]);
    const byId = new Map(result.map((c) => [c.id, c.gridCol]));
    expect(byId.get("c1")).toBe(3);
    expect(byId.get("c2")).toBe(1);
  });

  it("fromIdxとtoIdxが同じなら元の配列をそのまま返す", () => {
    const columns: Column[] = [
      makeColumn({ id: "c1", gridCol: 1, gridRow: 1 }),
      makeColumn({ id: "c2", gridCol: 2, gridRow: 1 }),
    ];
    const result = moveGroup(columns, 0, 0);
    expect(result).toBe(columns);
  });

  it("範囲外のインデックスを渡すと元の配列をそのまま返す", () => {
    const columns: Column[] = [
      makeColumn({ id: "c1", gridCol: 1, gridRow: 1 }),
      makeColumn({ id: "c2", gridCol: 2, gridRow: 1 }),
    ];
    expect(moveGroup(columns, -1, 1)).toBe(columns);
    expect(moveGroup(columns, 0, 2)).toBe(columns);
    expect(moveGroup(columns, 5, 0)).toBe(columns);
  });

  it("移動後にorderが再正規化される", () => {
    const columns: Column[] = [
      makeColumn({ id: "c1", gridCol: 1, gridRow: 1, order: 99 }),
      makeColumn({ id: "c2", gridCol: 2, gridRow: 1, order: 1 }),
    ];
    const result = moveGroup(columns, 0, 1);
    const byId = new Map(result.map((c) => [c.id, c.order]));
    // 移動後: c2 が gridCol1, c1 が gridCol2 になる
    expect(byId.get("c2")).toBe(0);
    expect(byId.get("c1")).toBe(1);
  });

  it("離れた位置へ移動できる", () => {
    const columns: Column[] = [
      makeColumn({ id: "c1", gridCol: 1, gridRow: 1 }),
      makeColumn({ id: "c2", gridCol: 2, gridRow: 1 }),
      makeColumn({ id: "c3", gridCol: 3, gridRow: 1 }),
    ];
    const result = moveGroup(columns, 0, 2);
    const byId = new Map(result.map((c) => [c.id, c.gridCol]));
    // c1 が末尾へ、c2,c3 が前へ詰まる
    expect(byId.get("c2")).toBe(1);
    expect(byId.get("c3")).toBe(2);
    expect(byId.get("c1")).toBe(3);
  });
});
