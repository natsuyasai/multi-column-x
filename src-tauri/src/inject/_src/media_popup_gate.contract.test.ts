// image_popup.ts と video_long_press_menu.ts は inject 間で import できないため、
// ポップアップ有効判定と送信経路選択を独立に複製している。両者が食い違わないことを全組み合わせで検証する。
import { describe, expect, it } from "vitest";
import { chooseMediaPopupTransport, isMediaPopupEnabled } from "./image_popup";
import {
  chooseLongPressPopupTransport,
  isLongPressMediaPopupEnabled,
} from "./video_long_press_menu";

const booleanOrUndefined = [true, false, undefined] as const;

describe("ポップアップ判定の複製間の同期", () => {
  it("すべての設定・プラットフォーム・列数・ブリッジの組み合わせで判定結果が一致する", () => {
    for (const kind of ["image", "video"] as const) {
      for (const imagePopupEnabled of booleanOrUndefined) {
        for (const videoPopupEnabled of booleanOrUndefined) {
          for (const mediaPopupRequiresMultiColumn of booleanOrUndefined) {
            for (const hasBridge of [true, false]) {
              for (const multiColumnActive of booleanOrUndefined) {
                const config = {
                  imagePopupEnabled,
                  videoPopupEnabled,
                  mediaPopupRequiresMultiColumn,
                };
                const env = { hasBridge, multiColumnActive };
                expect(isLongPressMediaPopupEnabled(kind, config, env)).toBe(
                  isMediaPopupEnabled(kind, config, env),
                );
              }
            }
          }
        }
      }
    }
  });

  it("設定オブジェクトが無い場合も判定結果が一致する", () => {
    const env = { hasBridge: true, multiColumnActive: true };
    expect(isLongPressMediaPopupEnabled("video", undefined, env)).toBe(
      isMediaPopupEnabled("video", undefined, env),
    );
  });

  it("送信経路の選択結果が一致する", () => {
    for (const hasBridge of [true, false]) {
      for (const hasInvoke of [true, false]) {
        const env = { hasBridge, hasInvoke };
        expect(chooseLongPressPopupTransport(env)).toBe(
          chooseMediaPopupTransport(env),
        );
      }
    }
  });
});
