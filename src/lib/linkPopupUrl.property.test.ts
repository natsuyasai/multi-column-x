// linkPopupUrl.ts の純粋関数に対する fast-check プロパティテスト。
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { resolveLinkPopupUrl } from "./linkPopupUrl";

describe("resolveLinkPopupUrl プロパティ", () => {
  it("空でない入力に対して、結果は常にhttp(s)スキームで始まる", () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => s.length > 0),
        (input) => {
          expect(resolveLinkPopupUrl(input)).toMatch(/^https?:\/\//i);
        },
      ),
    );
  });

  it("すでにhttp(s)スキームで始まる入力はそのまま返す", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("http", "https", "HTTP", "HTTPS", "Http", "hTTps"),
        fc.string(),
        (scheme, rest) => {
          const input = `${scheme}://${rest}`;
          expect(resolveLinkPopupUrl(input)).toBe(input);
        },
      ),
    );
  });
});
