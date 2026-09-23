import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { normalizeColumnLabel } from "./index";

describe("normalizeColumnLabel プロパティ", () => {
  it("結果が undefined でないとき、結果は空文字ではなく、前後に空白を含まない", () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = normalizeColumnLabel(input);
        if (result !== undefined) {
          expect(result.length).toBeGreaterThan(0);
          expect(result).toBe(result.trim());
        }
      }),
    );
  });

  it("冪等性: 結果が undefined でなければ normalizeColumnLabel(result) === result", () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = normalizeColumnLabel(input);
        if (result !== undefined) {
          expect(normalizeColumnLabel(result)).toBe(result);
        }
      }),
    );
  });

  it("空白を付与しても結果は変わらない", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.array(fc.constantFrom(" ", "\t", "\n", "　")).map((a) => a.join("")),
        fc.array(fc.constantFrom(" ", "\t", "\n", "　")).map((a) => a.join("")),
        (s, pad1, pad2) => {
          expect(normalizeColumnLabel(pad1 + s + pad2)).toBe(
            normalizeColumnLabel(s),
          );
        },
      ),
    );
  });

  it("空白のみの入力は常に undefined", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(" ", "\t", "\n", "　")).map((a) => a.join("")),
        (padding) => {
          expect(normalizeColumnLabel(padding)).toBeUndefined();
        },
      ),
    );
  });

  it("結果が undefined でないとき、結果は入力の部分文字列である", () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = normalizeColumnLabel(input);
        if (result !== undefined) {
          expect(input.includes(result)).toBe(true);
        }
      }),
    );
  });
});
