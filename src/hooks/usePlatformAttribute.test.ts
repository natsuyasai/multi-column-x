import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { usePlatformAttribute } from "./usePlatformAttribute";

const platformAttr = () =>
  document.documentElement.getAttribute("data-platform");

afterEach(() => {
  document.documentElement.removeAttribute("data-platform");
});

describe("usePlatformAttribute", () => {
  it("isMobileがtrueのときdata-platformがandroidになる", () => {
    renderHook(() => usePlatformAttribute(true));
    expect(platformAttr()).toBe("android");
  });

  it("isMobileがfalseのときdata-platformがdesktopになる", () => {
    renderHook(() => usePlatformAttribute(false));
    expect(platformAttr()).toBe("desktop");
  });

  it("isMobileの切替にdata-platformが追従する", () => {
    const { rerender } = renderHook(({ m }) => usePlatformAttribute(m), {
      initialProps: { m: false },
    });
    expect(platformAttr()).toBe("desktop");
    rerender({ m: true });
    expect(platformAttr()).toBe("android");
    rerender({ m: false });
    expect(platformAttr()).toBe("desktop");
  });

  it("アンマウントするとdata-platformが除去される", () => {
    const { unmount } = renderHook(() => usePlatformAttribute(true));
    expect(platformAttr()).toBe("android");
    unmount();
    expect(platformAttr()).toBeNull();
  });
});
