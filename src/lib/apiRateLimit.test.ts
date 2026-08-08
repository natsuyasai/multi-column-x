import { describe, it, expect } from "vitest";
import { getRateLimitSeverity } from "./apiRateLimit";

describe("getRateLimitSeverity", () => {
  it("remaining/limitの比率が20%より大きい場合はnormalを返す", () => {
    expect(getRateLimitSeverity(100, 100)).toBe("normal");
    expect(getRateLimitSeverity(50, 100)).toBe("normal");
    expect(getRateLimitSeverity(21, 100)).toBe("normal");
  });

  it("remaining/limitの比率が20%以下かつ5%以上の場合はwarningを返す", () => {
    expect(getRateLimitSeverity(20, 100)).toBe("warning");
    expect(getRateLimitSeverity(10, 100)).toBe("warning");
    expect(getRateLimitSeverity(5, 100)).toBe("warning");
  });

  it("remaining/limitの比率が5%未満の場合はcriticalを返す", () => {
    expect(getRateLimitSeverity(4, 100)).toBe("critical");
    expect(getRateLimitSeverity(1, 100)).toBe("critical");
    expect(getRateLimitSeverity(0, 100)).toBe("critical");
  });

  it("limitが0の場合はnormalを返す（ゼロ除算回避）", () => {
    expect(getRateLimitSeverity(0, 0)).toBe("normal");
  });

  it("limitが負の場合もnormalを返す（不正値の判定不能扱い）", () => {
    expect(getRateLimitSeverity(5, -10)).toBe("normal");
  });

  it("境界値ちょうど20%はwarningを返す（20%は包含）", () => {
    expect(getRateLimitSeverity(20, 100)).toBe("warning");
  });

  it("境界値ちょうど5%はwarningを返す（5%はcriticalに含まれない）", () => {
    expect(getRateLimitSeverity(5, 100)).toBe("warning");
  });

  it("境界値5%未満（4.9%）はcriticalを返す", () => {
    expect(getRateLimitSeverity(49, 1000)).toBe("critical");
  });
});
