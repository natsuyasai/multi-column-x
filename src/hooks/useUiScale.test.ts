import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { remToPx } from "@/lib/uiScale";
import type { UiScale } from "@/types";
import { useUiScale } from "./useUiScale";

// プローブ（font-size: medium）の computed font-size を差し替える
let deviceFontPx = "16px";

beforeEach(() => {
  deviceFontPx = "16px";
  vi.spyOn(window, "getComputedStyle").mockImplementation(
    () => ({ fontSize: deviceFontPx }) as CSSStyleDeclaration,
  );
  document.documentElement.style.fontSize = "";
});

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.style.fontSize = "";
});

const rootFontSize = () => document.documentElement.style.fontSize;

describe("useUiScale", () => {
  it("大を選ぶとルートのフォントサイズが18pxになりrem換算も追従する", () => {
    const { result } = renderHook(() => useUiScale("large", false));
    expect(result.current).toBe(1.125);
    expect(rootFontSize()).toBe("18px");
    expect(remToPx(2)).toBe(36);
  });

  it("特大を選ぶとルートのフォントサイズが20pxになる", () => {
    renderHook(() => useUiScale("xLarge", false));
    expect(rootFontSize()).toBe("20px");
  });

  it("設定値を変更すると即座にルートのフォントサイズが更新される", () => {
    const { rerender } = renderHook(
      ({ s }: { s: UiScale }) => useUiScale(s, false),
      { initialProps: { s: "standard" as UiScale } },
    );
    expect(rootFontSize()).toBe("16px");
    rerender({ s: "small" });
    expect(rootFontSize()).toBe("14px");
    expect(remToPx(2)).toBe(28);
  });

  it("アンマウントするとルートのフォントサイズとrem換算が元に戻る", () => {
    const { unmount } = renderHook(() => useUiScale("xLarge", false));
    unmount();
    expect(rootFontSize()).toBe("");
    expect(remToPx(2)).toBe(32);
  });

  it("モバイルで端末に合わせる設定なら測定した端末倍率が反映される", () => {
    deviceFontPx = "20.8px";
    const { result } = renderHook(() => useUiScale("auto", true));
    expect(result.current).toBeCloseTo(1.3);
    expect(rootFontSize()).toBe(`${16 * 1.3}px`);
  });

  it("実行中に端末の倍率が変わるとresizeで追従する", () => {
    const { result } = renderHook(() => useUiScale("auto", true));
    expect(rootFontSize()).toBe("16px");
    deviceFontPx = "20.8px";
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(result.current).toBeCloseTo(1.3);
    expect(rootFontSize()).toBe(`${16 * 1.3}px`);
  });

  it("実行中に端末の倍率が変わるとフォアグラウンド復帰で追従する", () => {
    renderHook(() => useUiScale("auto", true));
    deviceFontPx = "20.8px";
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(rootFontSize()).toBe(`${16 * 1.3}px`);
  });

  it("デスクトップでは端末の倍率が変わっても追加補正せず標準のまま", () => {
    deviceFontPx = "20.8px";
    const { result } = renderHook(() => useUiScale("auto", false));
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(result.current).toBe(1);
    expect(rootFontSize()).toBe("16px");
  });

  it("端末に合わせる設定ではない場合は端末の倍率が変わってもプリセットのまま", () => {
    renderHook(() => useUiScale("standard", true));
    deviceFontPx = "20.8px";
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(rootFontSize()).toBe("16px");
  });

  it("プリセットから端末に合わせるへ戻すと端末の値に追従する", () => {
    deviceFontPx = "20.8px";
    const { rerender } = renderHook(
      ({ s }: { s: UiScale }) => useUiScale(s, true),
      { initialProps: { s: "small" as UiScale } },
    );
    expect(rootFontSize()).toBe("14px");
    rerender({ s: "auto" });
    expect(rootFontSize()).toBe(`${16 * 1.3}px`);
  });

  it("アンマウント後はresizeしてもリスナーが残らず再測定されない", () => {
    const spy = vi.spyOn(window, "getComputedStyle");
    const { unmount } = renderHook(() => useUiScale("auto", true));
    unmount();
    spy.mockClear();
    window.dispatchEvent(new Event("resize"));
    expect(spy).not.toHaveBeenCalled();
  });
});
