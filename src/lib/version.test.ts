import { describe, expect, it } from "vitest";
import { isNewerVersion } from "./version";

describe("isNewerVersion", () => {
  it("パッチが上なら新しい", () =>
    expect(isNewerVersion("1.2.1", "1.2.0")).toBe(true));
  it("同一なら新しくない", () =>
    expect(isNewerVersion("1.2.0", "1.2.0")).toBe(false));
  it("古ければ新しくない", () =>
    expect(isNewerVersion("1.1.0", "1.2.0")).toBe(false));
  it("数値比較する(10>9)", () =>
    expect(isNewerVersion("1.10.0", "1.9.0")).toBe(true));
  it("vプレフィックスを無視する", () =>
    expect(isNewerVersion("v1.2.1", "1.2.0")).toBe(true));
});
