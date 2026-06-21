import { describe, expect, it } from "vitest";
import { shouldAutoPrompt } from "./updatePrompt";

describe("shouldAutoPrompt", () => {
  it("見送り記録が無ければ表示する", () => {
    expect(shouldAutoPrompt("1.2.0", null)).toBe(true);
  });
  it("見送ったバージョンと同じなら表示しない", () => {
    expect(shouldAutoPrompt("1.2.0", "1.2.0")).toBe(false);
  });
  it("見送ったバージョンと異なれば表示する", () => {
    expect(shouldAutoPrompt("1.3.0", "1.2.0")).toBe(true);
  });
});
