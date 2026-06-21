import { describe, it, expect } from "vitest";
import { resolveTheme } from "./theme";

describe("resolveTheme", () => {
  it("darkを指定するとdarkを返す", () => {
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("dark", true)).toBe("dark");
  });

  it("lightを指定するとlightを返す", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("light", false)).toBe("light");
  });

  it("systemかつOSがダークのときdarkを返す", () => {
    expect(resolveTheme("system", true)).toBe("dark");
  });

  it("systemかつOSがライトのときlightを返す", () => {
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("不正な値はdarkにフォールバックする", () => {
    expect(resolveTheme("unknown", false)).toBe("dark");
    expect(resolveTheme("", false)).toBe("dark");
  });
});
