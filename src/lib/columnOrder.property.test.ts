import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildGroups, moveGroup, normalizeOrder } from "@/lib/columnOrder";
import type { Column } from "@/types";

const baseSettings: Column["settings"] = {
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

interface ColumnSpec {
  id: string;
  gridCol: number;
  gridRow: number;
  order: number;
}

function makeColumn(spec: ColumnSpec): Column {
  return {
    id: spec.id,
    accountId: "acc-1",
    pageType: "home",
    width: 350,
    order: spec.order,
    gridRow: spec.gridRow,
    gridCol: spec.gridCol,
    heightMode: "auto",
    settings: baseSettings,
  };
}

// gridCol / gridRow は 0 を含める（0以下は未割当分岐を通すため）。範囲は 0〜4 で十分。
const columnFieldsArb = fc.record({
  gridCol: fc.integer({ min: 0, max: 4 }),
  gridRow: fc.integer({ min: 0, max: 4 }),
  order: fc.integer({ min: 0, max: 20 }),
});

// id は Map のキーに使われるためユニークであることが前提。
// まず id 集合をユニークに生成し、その個数分だけ gridCol/gridRow/order を生成して合体させる。
const columnsArb: fc.Arbitrary<Column[]> = fc
  .uniqueArray(fc.string({ minLength: 1, maxLength: 8 }), {
    minLength: 0,
    maxLength: 8,
  })
  .chain((ids) =>
    fc
      .array(columnFieldsArb, { minLength: ids.length, maxLength: ids.length })
      .map((fields) => fields.map((f, i) => makeColumn({ id: ids[i], ...f }))),
  );

function isAssigned(c: Column): boolean {
  return c.gridCol >= 1 && c.gridRow >= 1;
}

describe("normalizeOrder プロパティ", () => {
  it("カラム数が変わらない", () => {
    fc.assert(
      fc.property(columnsArb, (columns) => {
        expect(normalizeOrder(columns).length).toBe(columns.length);
      }),
    );
  });

  it("カラムのid集合が変わらない", () => {
    fc.assert(
      fc.property(columnsArb, (columns) => {
        const before = new Set(columns.map((c) => c.id));
        const after = new Set(normalizeOrder(columns).map((c) => c.id));
        expect(after).toEqual(before);
      }),
    );
  });

  it("orderが0からn-1の順列になる", () => {
    fc.assert(
      fc.property(columnsArb, (columns) => {
        const result = normalizeOrder(columns);
        const orders = result.map((c) => c.order).sort((a, b) => a - b);
        const expected = result.map((_, i) => i);
        expect(orders).toEqual(expected);
      }),
    );
  });

  it("割当済みカラムのorderは未割当カラムのorderより常に小さい", () => {
    fc.assert(
      fc.property(columnsArb, (columns) => {
        const result = normalizeOrder(columns);
        const assignedOrders = result.filter(isAssigned).map((c) => c.order);
        const unassignedOrders = result
          .filter((c) => !isAssigned(c))
          .map((c) => c.order);
        if (assignedOrders.length === 0 || unassignedOrders.length === 0) {
          return; // 片方が空なら比較対象がない
        }
        expect(Math.max(...assignedOrders)).toBeLessThan(
          Math.min(...unassignedOrders),
        );
      }),
    );
  });

  it("冪等である", () => {
    fc.assert(
      fc.property(columnsArb, (columns) => {
        const once = normalizeOrder(columns);
        const twice = normalizeOrder(once);
        expect(twice).toEqual(once);
      }),
    );
  });

  it("割当済みカラムのorder順はgridCol昇順gridRow昇順と一致する", () => {
    fc.assert(
      fc.property(columnsArb, (columns) => {
        const result = normalizeOrder(columns);
        const assigned = result.filter(isAssigned);

        const byOrder = [...assigned]
          .sort((a, b) => a.order - b.order)
          .map((c) => c.id);
        const byGrid = [...assigned]
          .sort((a, b) =>
            a.gridCol !== b.gridCol
              ? a.gridCol - b.gridCol
              : a.gridRow - b.gridRow,
          )
          .map((c) => c.id);

        expect(byOrder).toEqual(byGrid);
      }),
    );
  });

  it("元の配列の要素順序を保持する", () => {
    fc.assert(
      fc.property(columnsArb, (columns) => {
        const result = normalizeOrder(columns);
        expect(result.map((c) => c.id)).toEqual(columns.map((c) => c.id));
      }),
    );
  });
});

// moveGroup 用: 有効なグループ（gridCol/gridRowともに1以上のカラムからなるグループ）が
// 1つ以上存在するシナリオに絞る。
const columnsWithGroupArb = columnsArb.filter(
  (columns) => buildGroups(columns).length >= 1,
);

const moveGroupScenarioArb = columnsWithGroupArb.chain((columns) => {
  const groupCount = buildGroups(columns).length;
  return fc.record({
    columns: fc.constant(columns),
    fromIdx: fc.integer({ min: 0, max: groupCount - 1 }),
    toIdx: fc.integer({ min: 0, max: groupCount - 1 }),
  });
});

// ラウンドトリップ検証用: グループが2つ以上ないと「移動」自体が意味をなさないため絞り込む
const columnsWithMultiGroupArb = columnsArb.filter(
  (columns) => buildGroups(columns).length >= 2,
);

const moveGroupRoundTripScenarioArb = columnsWithMultiGroupArb.chain(
  (columns) => {
    const groupCount = buildGroups(columns).length;
    return fc.record({
      columns: fc.constant(columns),
      fromIdx: fc.integer({ min: 0, max: groupCount - 1 }),
      toIdx: fc.integer({ min: 0, max: groupCount - 1 }),
    });
  },
);

describe("moveGroup プロパティ", () => {
  it("カラム数が変わらない", () => {
    fc.assert(
      fc.property(moveGroupScenarioArb, ({ columns, fromIdx, toIdx }) => {
        const result = moveGroup(columns, fromIdx, toIdx);
        expect(result.length).toBe(columns.length);
      }),
    );
  });

  it("カラムのid集合が変わらない", () => {
    fc.assert(
      fc.property(moveGroupScenarioArb, ({ columns, fromIdx, toIdx }) => {
        const result = moveGroup(columns, fromIdx, toIdx);
        const before = new Set(columns.map((c) => c.id));
        const after = new Set(result.map((c) => c.id));
        expect(after).toEqual(before);
      }),
    );
  });

  it("使われているgridCol値の集合が変わらない", () => {
    // スロット保持の性質: 縦積みグループは複数カラムが同じgridColを共有するため、
    // 移動後は「slotごとのカラム数」は変わりうる。不変なのは distinct な gridCol 値の集合。
    fc.assert(
      fc.property(moveGroupScenarioArb, ({ columns, fromIdx, toIdx }) => {
        const result = moveGroup(columns, fromIdx, toIdx);
        const resultById = new Map(result.map((c) => [c.id, c]));
        const before = new Set(
          columns.filter(isAssigned).map((c) => c.gridCol),
        );
        const after = new Set(
          columns.filter(isAssigned).map((c) => resultById.get(c.id)?.gridCol),
        );
        expect(after).toEqual(before);
      }),
    );
  });

  it("移動後もorderが0からn-1の順列になる", () => {
    // fromIdx === toIdx のときmoveGroupは意図的に入力をそのまま返す仕様
    // （columnOrder.test.ts の参照等価性テストで担保済み）。
    // 未正規化のorderが素通りしうるため、実際に移動が発生したケースに限定して検証する。
    fc.assert(
      fc.property(moveGroupScenarioArb, ({ columns, fromIdx, toIdx }) => {
        fc.pre(fromIdx !== toIdx);
        const result = moveGroup(columns, fromIdx, toIdx);
        const orders = result.map((c) => c.order).sort((a, b) => a - b);
        const expected = result.map((_, i) => i);
        expect(orders).toEqual(expected);
      }),
    );
  });

  it("moveGroup(cols, i, j) の後に moveGroup(結果, j, i) すると各カラムのgridCol配置が元に戻る", () => {
    fc.assert(
      fc.property(
        moveGroupRoundTripScenarioArb,
        ({ columns, fromIdx, toIdx }) => {
          const once = moveGroup(columns, fromIdx, toIdx);
          const back = moveGroup(once, toIdx, fromIdx);

          const originalGridColById = new Map(
            columns.map((c) => [c.id, c.gridCol]),
          );
          for (const c of back) {
            expect(c.gridCol).toBe(originalGridColById.get(c.id));
          }
        },
      ),
    );
  });

  it("範囲外インデックスでは入力をそのまま返す", () => {
    fc.assert(
      fc.property(
        columnsArb,
        fc.integer({ min: -100, max: -1 }),
        fc.integer({ min: 0, max: 100 }),
        (columns, negIdx, positiveOffset) => {
          const groupCount = buildGroups(columns).length;
          const tooLargeIdx = groupCount + positiveOffset;

          // 負のインデックス
          expect(moveGroup(columns, negIdx, 0)).toBe(columns);
          expect(moveGroup(columns, 0, negIdx)).toBe(columns);
          // グループ数以上のインデックス
          expect(moveGroup(columns, tooLargeIdx, 0)).toBe(columns);
          expect(moveGroup(columns, 0, tooLargeIdx)).toBe(columns);
        },
      ),
    );
  });
});

describe("buildGroups プロパティ", () => {
  it("返るグループはgridCol昇順である", () => {
    fc.assert(
      fc.property(columnsArb, (columns) => {
        const groups = buildGroups(columns);
        const gridCols = groups.map((g) => g.gridCol);
        const sorted = [...gridCols].sort((a, b) => a - b);
        expect(gridCols).toEqual(sorted);
      }),
    );
  });

  it("各グループ内はgridRow昇順である", () => {
    fc.assert(
      fc.property(columnsArb, (columns) => {
        const groups = buildGroups(columns);
        for (const group of groups) {
          const gridRows = group.columns.map((c) => c.gridRow);
          const sorted = [...gridRows].sort((a, b) => a - b);
          expect(gridRows).toEqual(sorted);
        }
      }),
    );
  });

  it("割当済みカラムの総数とグループ内カラムの総数が一致する", () => {
    fc.assert(
      fc.property(columnsArb, (columns) => {
        const groups = buildGroups(columns);
        const totalInGroups = groups.reduce(
          (sum, g) => sum + g.columns.length,
          0,
        );
        const assignedCount = columns.filter(isAssigned).length;
        expect(totalInGroups).toBe(assignedCount);
      }),
    );
  });
});
