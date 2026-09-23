import { describe, expect, it } from "vitest";
import { resolveLinkPopupUrl } from "./linkPopupUrl";

describe("resolveLinkPopupUrl", () => {
  const cases: ReadonlyArray<[string, string]> = [
    ["https://example.com", "https://example.com"],
    ["HTTP://example.com", "HTTP://example.com"],
    ["example.com", "https://example.com"],
    ["httpbin.org/get", "https://httpbin.org/get"],
    ["http-status.example", "https://http-status.example"],
  ];

  it.each(cases)(
    "入力されたURLのスキームの有無に応じて補完する（%s → %s）",
    (input, expected) => {
      expect(resolveLinkPopupUrl(input)).toBe(expected);
    },
  );
});
