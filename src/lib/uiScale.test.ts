import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ROOT_FONT_BASE_PX,
  clampUiScale,
  measureDeviceFontScale,
  remToPx,
  resolveDeviceUiScale,
  resolveUiScale,
  setRootFontPx,
} from "@/lib/uiScale";
import type { UiScale } from "@/types";

describe("resolveDeviceUiScale", () => {
  it("Androidでは端末のフォントサイズ倍率がそのまま端末追従値になる", () => {
    expect(resolveDeviceUiScale(true, 1.3)).toBe(1.3);
  });

  it.each([
    [3.0, 1.5],
    [0.1, 0.75],
    [0, 1],
    [Number.NaN, 1],
  ])(
    "Androidでは端末値 %s が許容範囲内の %s に収まる",
    (measured, expected) => {
      expect(resolveDeviceUiScale(true, measured)).toBe(expected);
    },
  );

  it.each([1.3, 2, 0.5])(
    "デスクトップでは端末値 %s でも追加の拡大縮小を行わず1になる",
    (measured) => {
      expect(resolveDeviceUiScale(false, measured)).toBe(1);
    },
  );
});

describe("clampUiScale", () => {
  it("上限を超える倍率は上限1.5に収まる", () => {
    expect(clampUiScale(3.0)).toBe(1.5);
  });

  it("下限を下回る倍率は下限0.75に収まる", () => {
    expect(clampUiScale(0.1)).toBe(0.75);
  });

  it.each([
    0,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    -1,
  ])("不正値 %s は1にフォールバックする", (v) => {
    expect(clampUiScale(v)).toBe(1);
  });

  it("許容範囲内の値はそのまま返す", () => {
    expect(clampUiScale(1.3)).toBe(1.3);
  });
});

describe("resolveUiScale", () => {
  it("端末に合わせる設定では端末追従値がそのままUIに反映される", () => {
    expect(resolveUiScale("auto", 1.3)).toBe(1.3);
  });

  it.each([
    ["small", 0.875],
    ["standard", 1],
    ["large", 1.125],
    ["xLarge", 1.25],
  ] as const)(
    "プリセット %s を選ぶと端末値1.3に関わらず %s に置き換わる",
    (setting, expected) => {
      expect(resolveUiScale(setting, 1.3)).toBe(expected);
    },
  );

  it("プリセットから端末に合わせるへ戻すと端末値に追従する", () => {
    expect(resolveUiScale("xLarge", 1.3)).toBe(1.25);
    expect(resolveUiScale("auto", 1.3)).toBe(1.3);
  });

  it.each([
    [3.0, 1.5],
    [0.1, 0.75],
    [0, 1],
    [Number.NaN, 1],
    [Number.POSITIVE_INFINITY, 1],
    [-2, 1],
  ])(
    "端末に合わせる設定で端末値 %s は許容範囲内の %s に収まる",
    (device, expected) => {
      expect(resolveUiScale("auto", device)).toBe(expected);
    },
  );

  it("未知の設定値は端末に合わせる扱いにフォールバックする", () => {
    expect(resolveUiScale("huge" as UiScale, 1.3)).toBe(1.3);
    expect(resolveUiScale("huge" as UiScale, 3.0)).toBe(1.5);
  });

  it("プロトタイプ由来のキー名が来ても端末に合わせる扱いにフォールバックする", () => {
    expect(resolveUiScale("constructor" as UiScale, 1.3)).toBe(1.3);
  });
});

describe("remToPx", () => {
  afterEach(() => {
    setRootFontPx(ROOT_FONT_BASE_PX);
  });

  it("初期状態ではrem値を16倍したpxに変換する", () => {
    expect(remToPx(2.25)).toBe(36);
  });

  it("setRootFontPxで変更したroot font-sizeに追従してpxへ変換する", () => {
    setRootFontPx(20);
    expect(remToPx(2)).toBe(40);
    expect(remToPx(2.25)).toBe(45);
  });

  it("変換結果は四捨五入した整数になる", () => {
    setRootFontPx(18);
    expect(remToPx(0.8125)).toBe(15);
  });
});

describe("measureDeviceFontScale", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockComputedFontSize(fontSize: string) {
    return vi
      .spyOn(window, "getComputedStyle")
      .mockReturnValue({ fontSize } as CSSStyleDeclaration);
  }

  it("プローブのfont-sizeを16で割った値を端末のフォントサイズ倍率として返す", () => {
    mockComputedFontSize("20.8px");
    expect(measureDeviceFontScale()).toBeCloseTo(1.3, 5);
  });

  it("標準の16pxなら倍率1を返す", () => {
    mockComputedFontSize("16px");
    expect(measureDeviceFontScale()).toBe(1);
  });

  it.each(["", "abc", "0px"])(
    "font-sizeが %j のように解釈できない場合は倍率1を返す",
    (fontSize) => {
      mockComputedFontSize(fontSize);
      expect(measureDeviceFontScale()).toBe(1);
    },
  );

  it("プローブはfont-size mediumの不可視要素としてbodyに追加し測定後に取り除く", () => {
    let snapshot: {
      fontSize: string;
      visibility: string;
      position: string;
    } | null = null;
    vi.spyOn(window, "getComputedStyle").mockImplementation((el) => {
      const style = (el as HTMLElement).style;
      snapshot = {
        fontSize: style.fontSize,
        visibility: style.visibility,
        position: style.position,
      };
      expect((el as HTMLElement).parentElement).toBe(document.body);
      return { fontSize: "16px" } as CSSStyleDeclaration;
    });
    const before = document.body.children.length;

    measureDeviceFontScale();

    expect(snapshot).toEqual({
      fontSize: "medium",
      visibility: "hidden",
      position: "absolute",
    });
    expect(document.body.children.length).toBe(before);
  });

  it("getComputedStyleが例外を投げてもプローブを取り除く", () => {
    vi.spyOn(window, "getComputedStyle").mockImplementation(() => {
      throw new Error("boom");
    });
    const before = document.body.children.length;

    expect(() => measureDeviceFontScale()).toThrow("boom");
    expect(document.body.children.length).toBe(before);
  });
});
