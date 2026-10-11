// contrast.ts の contrastRatio に対する fast-check プロパティテスト（仕様が明確なため実装後に作成）。
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast";

const hexColor = fc
  .tuple(
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
  )
  .map(
    ([r, g, b]) =>
      `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`,
  );

describe("contrastRatio プロパティ", () => {
  it("任意の2色のコントラスト比は常に1以上21以下になる", () => {
    fc.assert(
      fc.property(hexColor, hexColor, (a, b) => {
        const ratio = contrastRatio(a, b);
        expect(ratio).toBeGreaterThanOrEqual(1);
        expect(ratio).toBeLessThanOrEqual(21 + 1e-9);
      }),
    );
  });

  it("引数の順序を入れ替えても同じ値になる", () => {
    fc.assert(
      fc.property(hexColor, hexColor, (a, b) => {
        expect(contrastRatio(a, b)).toBe(contrastRatio(b, a));
      }),
    );
  });

  it("同じ色同士のコントラスト比は常に1になる", () => {
    fc.assert(
      fc.property(hexColor, (a) => {
        expect(contrastRatio(a, a)).toBe(1);
      }),
    );
  });
});
