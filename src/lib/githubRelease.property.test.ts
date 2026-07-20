import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseDigestSha256 } from "./githubRelease";

describe("parseDigestSha256 プロパティ", () => {
  it("戻り値が非nullなら常に小文字64桁hexである", () => {
    fc.assert(
      fc.property(fc.string(), (digest) => {
        const result = parseDigestSha256(digest);
        if (result !== null) {
          expect(result).toMatch(/^[0-9a-f]{64}$/);
        }
      }),
    );
  });

  it("sha256:に有効な64桁hex(大小混在)を付けると元hexの小文字を返す", () => {
    const hexCharArb = fc.constantFrom(..."0123456789abcdefABCDEF".split(""));
    fc.assert(
      fc.property(
        fc.array(hexCharArb, { minLength: 64, maxLength: 64 }),
        (hexChars) => {
          const hex = hexChars.join("");
          const input = `sha256:${hex}`;
          expect(parseDigestSha256(input)).toBe(hex.toLowerCase());
        },
      ),
    );
  });
});
