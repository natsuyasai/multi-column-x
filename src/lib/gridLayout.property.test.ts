import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Column } from "../types";
import { calculateGridBounds } from "./gridLayout";

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
