import { describe, expect, it } from "vitest";
import { contrastRatio, parseHexColor, relativeLuminance } from "./contrast";

describe("contrastRatio", () => {
  it("黒と白のコントラスト比は21になる", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
  });

  it("同じ色同士のコントラスト比は1になる", () => {
    expect(contrastRatio("#336699", "#336699")).toBeCloseTo(1, 5);
  });

  it("明るい灰色と暗い背景のコントラスト比は既知値の約6.1になる", () => {
    expect(contrastRatio("#999999", "#1a1a1a")).toBeCloseTo(6.1, 1);
  });

  it("前景色と背景色を入れ替えても同じ値になる", () => {
    expect(contrastRatio("#1a1a1a", "#999999")).toBeCloseTo(
      contrastRatio("#999999", "#1a1a1a"),
      10,
    );
  });
});

describe("relativeLuminance", () => {
  it("3桁の短縮形は6桁に展開した色と同じ相対輝度になる", () => {
    expect(relativeLuminance("#fff")).toBeCloseTo(
      relativeLuminance("#ffffff"),
      10,
    );
    expect(relativeLuminance("#f80")).toBeCloseTo(
      relativeLuminance("#ff8800"),
      10,
    );
  });
});

describe("parseHexColor", () => {
  it("大文字小文字を区別せずRGB値に変換する", () => {
    expect(parseHexColor("#FF8800")).toEqual({ r: 255, g: 136, b: 0 });
    expect(parseHexColor("#ff8800")).toEqual({ r: 255, g: 136, b: 0 });
  });

  it("不正な色文字列は例外を投げる", () => {
    for (const invalid of [
      "",
      "fff",
      "#ff",
      "#ggg",
      "#12345",
      "#1234567",
      "red",
    ]) {
      expect(() => parseHexColor(invalid)).toThrow();
    }
  });
});
