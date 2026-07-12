import { describe, it, expect } from "vitest";
import { evaluateReauthIdentity } from "./reauthIdentity";

describe("evaluateReauthIdentity", () => {
  it("expectedがundefinedのときskipを返す", () => {
    expect(evaluateReauthIdentity(undefined, "1234567890")).toBe("skip");
  });

  it("expectedがnullのときskipを返す", () => {
    expect(evaluateReauthIdentity(null, "1234567890")).toBe("skip");
  });

  it("expectedが空文字のときskipを返す", () => {
    expect(evaluateReauthIdentity("", "1234567890")).toBe("skip");
  });

  it("expectedとactualが一致するときmatchを返す", () => {
    expect(evaluateReauthIdentity("1234567890", "1234567890")).toBe("match");
  });

  it("expectedとactualが不一致のときmismatchを返す", () => {
    expect(evaluateReauthIdentity("1234567890", "999999999")).toBe("mismatch");
  });
});
