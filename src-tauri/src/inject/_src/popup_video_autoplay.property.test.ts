// popup_video_autoplay.ts の純粋関数 shouldAutoplay に対する fast-check プロパティテスト。
// import 時の IIFE は window.__mcxTargetHref が undefined のため副作用なく早期 return する。
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { shouldAutoplay } from "./popup_video_autoplay";

describe("shouldAutoplay プロパティ", () => {
  it("任意の文字列に対し戻り値は href が /video/ を含むかどうかと常に一致する", () => {
    fc.assert(
      fc.property(fc.string(), (href) => {
        expect(shouldAutoplay(href)).toBe(href.includes("/video/"));
      }),
    );
  });

  it("/video/ を含む文字列は常に true になる", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[A-Za-z0-9/]*$/),
        fc.stringMatching(/^[A-Za-z0-9/]*$/),
        (prefix, suffix) => {
          const href = `${prefix}/video/${suffix}`;
          expect(shouldAutoplay(href)).toBe(true);
        },
      ),
    );
  });

  it("undefined は常に false になる", () => {
    expect(shouldAutoplay(undefined)).toBe(false);
  });
});
