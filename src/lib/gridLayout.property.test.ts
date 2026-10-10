import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { OFFSCREEN } from "../constants/ipc";
import type { Column } from "../types";
import {
  calculateGridBounds,
  getMobileTabBarHeight,
  MOBILE_TWO_COLUMN_MIN_WIDTH,
  mobileColumnLayout,
} from "./gridLayout";

// calculateGridBounds が参照するフィールドのみを持つ最小カラム仕様を生成する
const columnSpecArb = fc.record({
  gridCol: fc.integer({ min: 0, max: 4 }),
  gridRow: fc.integer({ min: 0, max: 4 }),
  width: fc.integer({ min: 100, max: 600 }),
  heightMode: fc.constantFrom("auto", "fixed"),
  heightValue: fc.integer({ min: 0, max: 800 }),
  heightUnit: fc.constantFrom("px", "%"),
});

type ColumnSpec = ReturnType<(typeof columnSpecArb)["generate"]>["value"];

// index で一意な id を割り当てて Column 配列にする
function toColumns(specs: ColumnSpec[]): Column[] {
  return specs.map((s, i) => ({ ...s, id: `col-${i}` }) as unknown as Column);
}

const optsArb = fc.record({
  containerHeight: fc.integer({ min: 0, max: 2000 }),
  scrollLeft: fc.integer({ min: 0, max: 2000 }),
  headerHeight: fc.integer({ min: 0, max: 100 }),
  scrollbarHeight: fc.integer({ min: 0, max: 50 }),
  topBarHeight: fc.integer({ min: 0, max: 100 }),
});

describe("calculateGridBounds プロパティ", () => {
  it("すべてのカラムが結果に含まれ、不変条件（width一致・height非負・y下限）を満たす", () => {
    fc.assert(
      fc.property(fc.array(columnSpecArb), optsArb, (specs, opts) => {
        const columns = toColumns(specs);
        const bounds = calculateGridBounds(columns, opts);

        // すべてのカラムが過不足なく結果に含まれる
        expect(Object.keys(bounds).length).toBe(columns.length);

        for (const col of columns) {
          const b = bounds[col.id];
          expect(b).toBeDefined();
          // 幅は入力カラムの width をそのまま反映する
          expect(b.width).toBe(col.width);
          // WebView 高さは負にならない
          expect(b.height).toBeGreaterThanOrEqual(0);
          // y はヘッダー上端なので topBarHeight + headerHeight 以上になる
          expect(b.y).toBeGreaterThanOrEqual(
            opts.topBarHeight + opts.headerHeight,
          );
        }
      }),
    );
  });
});

// --- mobileColumnLayout 用の arbitrary ---

// mobileColumnLayout が参照するフィールドのみを持つ最小カラム仕様。
// id は col-<index> で一意にし、order は任意の整数（関数内でソートされる仕様のため重複可）。
type MobileColumnSpec = Pick<Column, "id" | "order">;

const ordersArb = fc.array(fc.integer({ min: -1000, max: 1000 }), {
  minLength: 0,
  maxLength: 6,
});

function toMobileColumns(orders: number[]): MobileColumnSpec[] {
  return orders.map((order, i) => ({ id: `col-${i}`, order }));
}

/** null / 存在しないID / （columnsがあれば）存在するID のいずれかを生成する */
function activeColumnIdArb(
  columns: MobileColumnSpec[],
): fc.Arbitrary<string | null> {
  const options: fc.Arbitrary<string | null>[] = [
    fc.constant(null),
    fc.constant("nonexistent-id"),
  ];
  if (columns.length > 0) {
    options.push(fc.constantFrom(...columns.map((c) => c.id)));
  }
  return fc.oneof(...options);
}

// activeColumnId が null / 存在しないID / 存在するID のいずれかになる一般シナリオ
const mobileScenarioArb = ordersArb.chain((orders) => {
  const columns = toMobileColumns(orders);
  return fc.record({
    columns: fc.constant(columns),
    activeColumnId: activeColumnIdArb(columns),
    twoColumnEnabled: fc.boolean(),
    columnCount: fc.constant(2),
    viewportWidth: fc.integer({ min: 0, max: 2000 }),
    viewportHeight: fc.integer({ min: 0, max: 2000 }),
  });
});

// activeColumnId が必ず columns に存在するシナリオ（不変条件2の検証用）
const mobileExistingActiveScenarioArb = ordersArb
  .filter((orders) => orders.length > 0)
  .chain((orders) => {
    const columns = toMobileColumns(orders);
    return fc.record({
      columns: fc.constant(columns),
      activeColumnId: fc.constantFrom(...columns.map((c) => c.id)),
      twoColumnEnabled: fc.boolean(),
      columnCount: fc.constant(2),
      viewportWidth: fc.integer({ min: 0, max: 2000 }),
      viewportHeight: fc.integer({ min: 0, max: 2000 }),
    });
  });

// 2カラム表示が必ず成立するシナリオ（不変条件5の検証用）：
// twoColumnEnabled=true・viewportWidth>=MOBILE_TWO_COLUMN_MIN_WIDTH・columns.length>=2・activeColumnIdは存在するID
const mobileTwoColumnScenarioArb = ordersArb
  .filter((orders) => orders.length >= 2)
  .chain((orders) => {
    const columns = toMobileColumns(orders);
    return fc.record({
      columns: fc.constant(columns),
      columnCount: fc.constant(2),
      activeColumnId: fc.constantFrom(...columns.map((c) => c.id)),
      viewportWidth: fc.integer({
        min: MOBILE_TWO_COLUMN_MIN_WIDTH,
        max: 2000,
      }),
      viewportHeight: fc.integer({ min: 0, max: 2000 }),
    });
  });

// --- N列対応の mobileColumnLayout 用 arbitrary ---

// 列数設定は範囲外（負数・0・上限超過）も含めて広く生成する
const wideColumnCountArb = fc.integer({ min: 0, max: 10 });

const mobileMultiScenarioArb = ordersArb.chain((orders) => {
  const columns = toMobileColumns(orders);
  return fc.record({
    columns: fc.constant(columns),
    activeColumnId: activeColumnIdArb(columns),
    twoColumnEnabled: fc.boolean(),
    columnCount: wideColumnCountArb,
    viewportWidth: fc.integer({ min: 0, max: 2000 }),
    viewportHeight: fc.integer({ min: 0, max: 2000 }),
  });
});

// activeColumnId が必ず columns に存在するシナリオ
const mobileMultiExistingActiveArb = ordersArb
  .filter((orders) => orders.length > 0)
  .chain((orders) => {
    const columns = toMobileColumns(orders);
    return fc.record({
      columns: fc.constant(columns),
      activeColumnId: fc.constantFrom(...columns.map((c) => c.id)),
      twoColumnEnabled: fc.boolean(),
      columnCount: wideColumnCountArb,
      viewportWidth: fc.integer({ min: 0, max: 2000 }),
      viewportHeight: fc.integer({ min: 0, max: 2000 }),
    });
  });

type MultiInput = {
  columns: MobileColumnSpec[];
  columnCount: number;
  twoColumnEnabled: boolean;
  viewportWidth: number;
};

/** 仕様上の上限列数: 設定値(2〜6に丸め)・1列300dp・登録数の最小値 */
function expectedMaxColumns(input: MultiInput): number {
  const clamped = Math.min(6, Math.max(2, input.columnCount));
  return Math.min(
    clamped,
    Math.floor(input.viewportWidth / 300),
    input.columns.length,
  );
}

function visibleSorted(
  input: MultiInput,
  result: ReturnType<typeof mobileColumnLayout>,
) {
  return input.columns
    .map((c) => ({ c, b: result[c.id] }))
    .filter(({ b }) => b.x >= 0)
    .sort((a, b) => a.b.x - b.b.x);
}

describe("mobileColumnLayout 列数設定 プロパティ", () => {
  it("表示カラム数は設定列数・幅/300・登録数の最小値以下で、複数列条件を満たさなければちょうど1になる", () => {
    fc.assert(
      fc.property(mobileMultiExistingActiveArb, (input) => {
        const result = mobileColumnLayout(input);
        const count = visibleSorted(input, result).length;
        const max = expectedMaxColumns(input);
        const multi =
          input.twoColumnEnabled && input.viewportWidth >= 600 && max >= 2;
        if (multi) {
          expect(count).toBeGreaterThanOrEqual(2);
          expect(count).toBeLessThanOrEqual(max);
        } else {
          expect(count).toBe(1);
        }
      }),
    );
  });

  it("表示カラムはx昇順に隙間なく連続し、先頭のxは0で幅の合計はviewportWidthと一致する", () => {
    fc.assert(
      fc.property(mobileMultiExistingActiveArb, (input) => {
        const result = mobileColumnLayout(input);
        const shown = visibleSorted(input, result);
        expect(shown[0].b.x).toBe(0);
        for (let i = 1; i < shown.length; i++) {
          expect(shown[i].b.x).toBe(shown[i - 1].b.x + shown[i - 1].b.width);
        }
        const total = shown.reduce((sum, s) => sum + s.b.width, 0);
        expect(total).toBe(input.viewportWidth);
      }),
    );
  });

  it("アクティブカラムは列数設定に関わらず常に表示される", () => {
    fc.assert(
      fc.property(mobileMultiExistingActiveArb, (input) => {
        const result = mobileColumnLayout(input);
        expect(result[input.activeColumnId].x).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it("表示カラムはorderソート順で連続した窓になる", () => {
    fc.assert(
      fc.property(mobileMultiExistingActiveArb, (input) => {
        const result = mobileColumnLayout(input);
        const sorted = [...input.columns].sort((a, b) => a.order - b.order);
        const positions = input.columns
          .filter((c) => result[c.id].x >= 0)
          .map((c) => sorted.findIndex((s) => s.id === c.id))
          .sort((a, b) => a - b);
        for (let i = 1; i < positions.length; i++) {
          expect(positions[i]).toBe(positions[i - 1] + 1);
        }
      }),
    );
  });

  it("activeColumnIdがnullなら列数設定に関わらず全カラムが非表示になる", () => {
    fc.assert(
      fc.property(mobileMultiScenarioArb, (scenario) => {
        const result = mobileColumnLayout({
          ...scenario,
          activeColumnId: null,
        });
        for (const b of Object.values(result)) {
          expect(b.x).toBe(OFFSCREEN.MOBILE_X);
        }
      }),
    );
  });

  it("列数2のとき、従来の2カラム配置（左=幅の半分切り捨て・右=残り・末尾アクティブは左隣とペア）と一致する", () => {
    fc.assert(
      fc.property(mobileTwoColumnScenarioArb, (input) => {
        const result = mobileColumnLayout({
          ...input,
          columnCount: 2,
          twoColumnEnabled: true,
        });
        const sorted = [...input.columns].sort((a, b) => a.order - b.order);
        const activeIdx = sorted.findIndex(
          (c) => c.id === input.activeColumnId,
        );
        const leftIdx = Math.min(activeIdx, sorted.length - 2);
        const leftWidth = Math.floor(input.viewportWidth / 2);
        for (let i = 0; i < sorted.length; i++) {
          const b = result[sorted[i].id];
          if (i === leftIdx) {
            expect(b.x).toBe(0);
            expect(b.width).toBe(leftWidth);
          } else if (i === leftIdx + 1) {
            expect(b.x).toBe(leftWidth);
            expect(b.width).toBe(input.viewportWidth - leftWidth);
          } else {
            expect(b.x).toBe(OFFSCREEN.MOBILE_X);
          }
        }
      }),
    );
  });
});

describe("mobileColumnLayout プロパティ", () => {
  it("表示カラム数（x>=0のカラム数）は0・1・2のいずれかになる", () => {
    fc.assert(
      fc.property(mobileScenarioArb, (input) => {
        const result = mobileColumnLayout(input);
        const visibleCount = Object.values(result).filter(
          (b) => b.x >= 0,
        ).length;
        expect([0, 1, 2]).toContain(visibleCount);
      }),
    );
  });

  it("activeColumnIdがcolumnsに存在するIDなら、アクティブカラムは必ず表示される", () => {
    fc.assert(
      fc.property(mobileExistingActiveScenarioArb, (input) => {
        const result = mobileColumnLayout(input);
        const activeBounds = result[input.activeColumnId as string];
        expect(activeBounds).toBeDefined();
        expect(activeBounds.x).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it("表示カラムが1枚以上あるとき、表示カラムの幅の合計はviewportWidthと一致する", () => {
    fc.assert(
      fc.property(mobileScenarioArb, (input) => {
        const result = mobileColumnLayout(input);
        const visibleBounds = Object.values(result).filter((b) => b.x >= 0);
        if (visibleBounds.length === 0) {
          return; // 表示カラムが0枚のときは対象外
        }
        const totalWidth = visibleBounds.reduce((sum, b) => sum + b.width, 0);
        expect(totalWidth).toBe(input.viewportWidth);
      }),
    );
  });

  it("すべてのカラムのxは非表示を示すOFFSCREEN.MOBILE_Xか、非負値のいずれかである（非表示カラムに中間値が漏れない）", () => {
    fc.assert(
      fc.property(mobileScenarioArb, (input) => {
        const result = mobileColumnLayout(input);
        for (const b of Object.values(result)) {
          expect(b.x === OFFSCREEN.MOBILE_X || b.x >= 0).toBe(true);
        }
      }),
    );
  });

  it("2カラム表示成立時、表示される2枚はorderソート順で隣接している", () => {
    fc.assert(
      fc.property(mobileTwoColumnScenarioArb, (input) => {
        const result = mobileColumnLayout({
          ...input,
          twoColumnEnabled: true,
        });
        const sorted = [...input.columns].sort((a, b) => a.order - b.order);
        const visibleIds = input.columns
          .filter((c) => result[c.id].x >= 0)
          .map((c) => c.id);

        expect(visibleIds.length).toBe(2);

        const positions = visibleIds
          .map((id) => sorted.findIndex((c) => c.id === id))
          .sort((a, b) => a - b);
        expect(positions[1] - positions[0]).toBe(1);
      }),
    );
  });

  it("全カラムのheightは同一で、viewportHeight - getMobileTabBarHeight()と一致する", () => {
    fc.assert(
      fc.property(mobileScenarioArb, (input) => {
        const result = mobileColumnLayout(input);
        const expectedHeight = input.viewportHeight - getMobileTabBarHeight();
        for (const b of Object.values(result)) {
          expect(b.height).toBe(expectedHeight);
        }
      }),
    );
  });
});
