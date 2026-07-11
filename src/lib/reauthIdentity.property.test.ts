import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { evaluateReauthIdentity } from "./reauthIdentity";

describe("evaluateReauthIdentity プロパティ", () => {
  it("expectedが未設定(undefined/null/空文字)なら常にskipを返す", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(undefined, null, ""),
        fc.string(),
        (expected, actual) => {
          expect(evaluateReauthIdentity(expected, actual)).toBe("skip");
        },
      ),
    );
  });

  it("expectedが非空でactualと等しいなら常にmatchを返す", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (s) => {
        expect(evaluateReauthIdentity(s, s)).toBe("match");
      }),
    );
  });

  it("expectedが非空でactualと異なるなら常にmismatchを返す", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string(),
        (expected, actual) => {
          fc.pre(expected !== actual);
          expect(evaluateReauthIdentity(expected, actual)).toBe("mismatch");
        },
      ),
    );
  });

  it("戻り値は常にskip・match・mismatchのいずれかである", () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.string(), fc.constant(undefined), fc.constant(null)),
        fc.string(),
        (expected, actual) => {
          const result = evaluateReauthIdentity(expected, actual);
          expect(["skip", "match", "mismatch"]).toContain(result);
        },
      ),
    );
  });
});
