import { act, renderHook } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { useOutsideClick } from "./useOutsideClick";

function setupDom() {
  const inner = document.createElement("div");
  const outsideEl = document.createElement("button");
  document.body.appendChild(inner);
  document.body.appendChild(outsideEl);
  return { inner, outsideEl };
}

function dispatchMouseDown(target: Element) {
  act(() => {
    target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  });
}

describe("useOutsideClick", () => {
  it("enabled=trueのとき、ref要素の外側をクリックするとonOutsideClickが呼ばれる", () => {
    const { inner, outsideEl } = setupDom();
    const onOutsideClick = vi.fn();
    renderHook(() => {
      const ref = useRef<HTMLDivElement | null>(inner);
      useOutsideClick(ref, onOutsideClick, true);
    });

    dispatchMouseDown(outsideEl);

    expect(onOutsideClick).toHaveBeenCalledTimes(1);
  });

  it("enabled=trueのとき、ref要素の内側をクリックするとonOutsideClickは呼ばれない", () => {
    const { inner } = setupDom();
    const onOutsideClick = vi.fn();
    renderHook(() => {
      const ref = useRef<HTMLDivElement | null>(inner);
      useOutsideClick(ref, onOutsideClick, true);
    });

    dispatchMouseDown(inner);

    expect(onOutsideClick).not.toHaveBeenCalled();
  });

  it("enabled=falseの場合は外側をクリックしてもonOutsideClickは呼ばれない", () => {
    const { inner, outsideEl } = setupDom();
    const onOutsideClick = vi.fn();
    renderHook(() => {
      const ref = useRef<HTMLDivElement | null>(inner);
      useOutsideClick(ref, onOutsideClick, false);
    });

    dispatchMouseDown(outsideEl);

    expect(onOutsideClick).not.toHaveBeenCalled();
  });

  it("アンマウント後は外側をクリックしてもonOutsideClickは呼ばれない", () => {
    const { inner, outsideEl } = setupDom();
    const onOutsideClick = vi.fn();
    const { unmount } = renderHook(() => {
      const ref = useRef<HTMLDivElement | null>(inner);
      useOutsideClick(ref, onOutsideClick, true);
    });

    unmount();
    dispatchMouseDown(outsideEl);

    expect(onOutsideClick).not.toHaveBeenCalled();
  });
});
