import { describe, it, expect } from "vitest";
import { hasAdTrackingHref, isAdLabelText } from "./hide_ad_matcher";

describe("inject/hide_ad_matcher", () => {
  describe("isAdLabelText", () => {
    it.each(["Ad", "Promoted", "広告", " ad ", "PROMOTED"])(
      "従来の広告ラベル「%s」は広告と判定する",
      (text) => {
        expect(isAdLabelText(text)).toBe(true);
      },
    );

    it("「Ad from starlink.com」は広告と判定する", () => {
      expect(isAdLabelText("Ad from starlink.com")).toBe(true);
    });

    it("本文の途中に「Ad from」を含むだけのテキストは広告と判定しない", () => {
      expect(isAdLabelText("I got Ad from my boss")).toBe(false);
    });

    it("「Ad from」のみで提供元が無いテキストは広告と判定しない", () => {
      expect(isAdLabelText("Ad from")).toBe(false);
    });

    it("空文字は広告と判定しない", () => {
      expect(isAdLabelText("  ")).toBe(false);
    });
  });

  describe("hasAdTrackingHref", () => {
    it("twclid 付きの外部リンクは広告計測リンクと判定する", () => {
      expect(
        hasAdTrackingHref([
          "https://www.starlink.com/?utm_medium=paid&twclid=abc123",
        ]),
      ).toBe(true);
    });

    it("twclid の無い外部リンクは判定しない", () => {
      expect(hasAdTrackingHref(["https://example.com/?a=1"])).toBe(false);
    });

    it("不正なURLでも例外を投げず false を返す", () => {
      expect(hasAdTrackingHref(["http://"])).toBe(false);
    });

    it("http/https 以外のスキームは判定しない", () => {
      expect(hasAdTrackingHref(["javascript:void(0)?twclid=1"])).toBe(false);
    });

    it("リンクが空なら false を返す", () => {
      expect(hasAdTrackingHref([])).toBe(false);
    });
  });
});
