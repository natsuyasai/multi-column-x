import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseSha256Text } from "./githubRelease";

describe("parseSha256Text プロパティ", () => {
  it("戻り値が非nullなら常に小文字64桁hexである", () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const result = parseSha256Text(text);
        if (result !== null) {
          expect(result).toMatch(/^[0-9a-f]{64}$/);
        }
      }),
    );
  });

  it("有効な64桁hexに前後の空白や任意のファイル名suffixを付けても小文字hashを返す", () => {
    const hexCharArb = fc.constantFrom(..."0123456789abcdefABCDEF".split(""));
    const whitespaceArb = fc.constantFrom(" ", "\t", "\n");
    const whitespaceStringArb = (minLength: number) =>
      fc
        .array(whitespaceArb, { minLength, maxLength: 5 })
        .map((chars) => chars.join(""));
    fc.assert(
      fc.property(
        fc.array(hexCharArb, { minLength: 64, maxLength: 64 }),
        whitespaceStringArb(0),
        whitespaceStringArb(1),
        fc.string(),
        (hexChars, leadingWs, separator, suffix) => {
          const hex = hexChars.join("");
          const input = `${leadingWs}${hex}${separator}${suffix}`;
          expect(parseSha256Text(input)).toBe(hex.toLowerCase());
        },
      ),
    );
  });
});
