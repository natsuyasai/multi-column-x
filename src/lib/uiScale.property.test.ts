import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  UI_SCALE_MAX,
  UI_SCALE_MIN,
  clampUiScale,
  resolveDeviceUiScale,
  resolveUiScale,
} from "@/lib/uiScale";
import type { UiScale } from "@/types";

const anyNumber = fc.oneof(
  fc.double({ noNaN: false }),
  fc.constantFrom(
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    0,
    -0,
  ),
);
const presetSetting = fc.constantFrom<UiScale>(
  "small",
  "standard",
  "large",
  "xLarge",
);

describe("uiScale のプロパティ", () => {
  it("端末に合わせる設定の結果は任意の端末値で常に許容範囲内の有限値になる", () => {
    fc.assert(
      fc.property(anyNumber, (x) => {
        const r = resolveUiScale("auto", x);
        expect(Number.isFinite(r)).toBe(true);
        expect(r).toBeGreaterThanOrEqual(UI_SCALE_MIN);
        expect(r).toBeLessThanOrEqual(UI_SCALE_MAX);
      }),
    );
  });

  it("プリセットを選んだ結果は端末値に依存しない", () => {
    fc.assert(
      fc.property(presetSetting, anyNumber, anyNumber, (setting, a, b) => {
        expect(resolveUiScale(setting, a)).toBe(resolveUiScale(setting, b));
      }),
    );
  });

  it("デスクトップの端末追従値は任意の値で常に1になる", () => {
    fc.assert(
      fc.property(anyNumber, (x) => {
        expect(resolveDeviceUiScale(false, x)).toBe(1);
      }),
    );
  });

  it("Androidの端末追従値は任意の値で常に許容範囲内の有限値になる", () => {
    fc.assert(
      fc.property(anyNumber, (x) => {
        const r = resolveDeviceUiScale(true, x);
        expect(r).toBeGreaterThanOrEqual(UI_SCALE_MIN);
        expect(r).toBeLessThanOrEqual(UI_SCALE_MAX);
      }),
    );
  });

  it("許容範囲内の値はクランプしても変わらない", () => {
    fc.assert(
      fc.property(
        fc.double({ min: UI_SCALE_MIN, max: UI_SCALE_MAX, noNaN: true }),
        (x) => {
          expect(clampUiScale(x)).toBe(x);
        },
      ),
    );
  });
});
