// auto_reload.ts の純粋関数 compareStatusIds / maxStatusId に対する fast-check プロパティテスト。
// status ID は 1〜19 桁の正の数値文字列として生成する。BigInt は期待値の算出にのみ使う。
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { compareStatusIds, maxStatusId } from "./auto_reload";

const MAX_19_DIGITS = 10n ** 19n - 1n;

const statusIdArb = fc
  .bigInt({ min: 1n, max: MAX_19_DIGITS })
  .map((n) => n.toString());

/** ちょうど digits 桁の正の数値文字列。 */
function idWithDigits(digits: number): fc.Arbitrary<string> {
  return fc
    .bigInt({
      min: 10n ** BigInt(digits - 1),
      max: 10n ** BigInt(digits) - 1n,
    })
    .map((n) => n.toString());
}

// 桁数が確実に異なる 2 つの ID（先頭要素のほうが桁数が少ない）。
const shorterLongerArb = fc
  .tuple(fc.integer({ min: 1, max: 19 }), fc.integer({ min: 1, max: 19 }))
  .filter(([shortLen, longLen]) => shortLen < longLen)
  .chain(([shortLen, longLen]) =>
    fc.tuple(idWithDigits(shortLen), idWithDigits(longLen)),
  );

const nullableIdArb = fc.option(statusIdArb, { nil: null });

describe("compareStatusIds プロパティ", () => {
  it("反射性: 同じ値どうしの比較は0になる", () => {
    fc.assert(
      fc.property(statusIdArb, (a) => {
        expect(compareStatusIds(a, a)).toBe(0);
      }),
    );
  });

  it("反対称性: 引数を入れ替えると符号が反転する", () => {
    fc.assert(
      fc.property(statusIdArb, statusIdArb, (a, b) => {
        expect(Math.sign(compareStatusIds(a, b))).toBe(
          -Math.sign(compareStatusIds(b, a)) + 0,
        );
      }),
    );
  });

  it("推移性: a<=b かつ b<=c ならば a<=c", () => {
    fc.assert(
      fc.property(statusIdArb, statusIdArb, statusIdArb, (a, b, c) => {
        fc.pre(compareStatusIds(a, b) <= 0 && compareStatusIds(b, c) <= 0);
        expect(compareStatusIds(a, c)).toBeLessThanOrEqual(0);
      }),
    );
  });

  it("BigIntによる数値比較と一致する", () => {
    fc.assert(
      fc.property(statusIdArb, statusIdArb, (a, b) => {
        const x = BigInt(a);
        const y = BigInt(b);
        const expected = x > y ? 1 : x < y ? -1 : 0;
        expect(compareStatusIds(a, b)).toBe(expected);
      }),
    );
  });

  it("桁数が多いほうが常に大きい", () => {
    fc.assert(
      fc.property(shorterLongerArb, ([shorter, longer]) => {
        expect(compareStatusIds(shorter, longer)).toBe(-1);
        expect(compareStatusIds(longer, shorter)).toBe(1);
      }),
    );
  });
});

describe("maxStatusId プロパティ", () => {
  it("可換性: 引数の順序に依存しない", () => {
    fc.assert(
      fc.property(nullableIdArb, nullableIdArb, (a, b) => {
        expect(maxStatusId(a, b)).toBe(maxStatusId(b, a));
      }),
    );
  });

  it("冪等性: 同じ値どうしの最大はその値自身", () => {
    fc.assert(
      fc.property(nullableIdArb, (a) => {
        expect(maxStatusId(a, a)).toBe(a);
      }),
    );
  });

  it("結合性: 畳み込みの順序に依存しない", () => {
    fc.assert(
      fc.property(nullableIdArb, nullableIdArb, nullableIdArb, (a, b, c) => {
        expect(maxStatusId(maxStatusId(a, b), c)).toBe(
          maxStatusId(a, maxStatusId(b, c)),
        );
      }),
    );
  });

  it("nullは単位元として振る舞う", () => {
    fc.assert(
      fc.property(nullableIdArb, (a) => {
        expect(maxStatusId(a, null)).toBe(a);
        expect(maxStatusId(null, a)).toBe(a);
      }),
    );
  });

  it("結果はBigIntで比べた最大値と一致する", () => {
    fc.assert(
      fc.property(statusIdArb, statusIdArb, (a, b) => {
        const expected = BigInt(a) > BigInt(b) ? a : b;
        expect(maxStatusId(a, b)).toBe(expected);
      }),
    );
  });
});
