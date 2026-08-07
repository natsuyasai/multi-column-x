// apiRateLimit.ts の純粋関数 getRateLimitSeverity に対する fast-check プロパティテスト。
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { getRateLimitSeverity, type RateLimitSeverity } from "./apiRateLimit";

// severityの深刻さの順序（悪化するほど値が大きい）
const severityOrder: Record<RateLimitSeverity, number> = {
  normal: 0,
  warning: 1,
  critical: 2,
};

describe("getRateLimitSeverity プロパティ", () => {
  it("limit > 0 かつ 0 <= remaining <= limit の範囲では例外を投げず必ずseverityのいずれかを返す", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }).chain((limit) =>
          fc.record({
            limit: fc.constant(limit),
            remaining: fc.integer({ min: 0, max: limit }),
          }),
        ),
        ({ limit, remaining }) => {
          const result = getRateLimitSeverity(remaining, limit);
          expect(["normal", "warning", "critical"]).toContain(result);
        },
      ),
    );
  });

  it("同じlimitに対しremainingが小さいほうがseverityは悪化しない方向にはならない（単調性）", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }).chain((limit) =>
          fc.record({
            limit: fc.constant(limit),
            a: fc.integer({ min: 0, max: limit }),
            b: fc.integer({ min: 0, max: limit }),
          }),
        ),
        ({ limit, a, b }) => {
          const [smallerRemaining, largerRemaining] = a <= b ? [a, b] : [b, a];
          const worseOrEqualSeverity = getRateLimitSeverity(
            smallerRemaining,
            limit,
          );
          const betterOrEqualSeverity = getRateLimitSeverity(
            largerRemaining,
            limit,
          );
          // remainingが少ないほうのseverityは、remainingが多いほうのseverity以上に深刻（悪い）か同じである
          expect(severityOrder[worseOrEqualSeverity]).toBeGreaterThanOrEqual(
            severityOrder[betterOrEqualSeverity],
          );
        },
      ),
    );
  });

  it("limitが0以下の場合は任意のremainingに対して常にnormalを返す", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000, max: 0 }),
        fc.integer({ min: -1_000_000, max: 1_000_000 }),
        (limit, remaining) => {
          expect(getRateLimitSeverity(remaining, limit)).toBe("normal");
        },
      ),
    );
  });

  it("remaining/limitの比率が同じであればスケールしても同じseverityを返す（比率ベースの判定であることの検証）", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 1, max: 1000 }),
        (remaining, limit, scale) => {
          fc.pre(remaining <= limit);
          const base = getRateLimitSeverity(remaining, limit);
          const scaled = getRateLimitSeverity(remaining * scale, limit * scale);
          expect(scaled).toBe(base);
        },
      ),
    );
  });
});
