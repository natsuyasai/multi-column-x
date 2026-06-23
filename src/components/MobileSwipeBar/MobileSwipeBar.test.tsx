import { render, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MobileSwipeBar } from "./MobileSwipeBar";

describe("MobileSwipeBar", () => {
  it("左へスワイプすると onSwipeNavigate が left で呼ばれる", () => {
    const onSwipeNavigate = vi.fn();
    const { container } = render(
      <MobileSwipeBar height={28} onSwipeNavigate={onSwipeNavigate} />,
    );
    const bar = container.firstChild as HTMLElement;
    fireEvent.touchStart(bar, { touches: [{ clientX: 200, clientY: 10 }] });
    fireEvent.touchEnd(bar, {
      changedTouches: [{ clientX: 100, clientY: 12 }],
    });
    expect(onSwipeNavigate).toHaveBeenCalledWith("left");
  });

  it("右へスワイプすると onSwipeNavigate が right で呼ばれる", () => {
    const onSwipeNavigate = vi.fn();
    const { container } = render(
      <MobileSwipeBar height={28} onSwipeNavigate={onSwipeNavigate} />,
    );
    const bar = container.firstChild as HTMLElement;
    fireEvent.touchStart(bar, { touches: [{ clientX: 100, clientY: 10 }] });
    fireEvent.touchEnd(bar, {
      changedTouches: [{ clientX: 220, clientY: 12 }],
    });
    expect(onSwipeNavigate).toHaveBeenCalledWith("right");
  });

  it("移動量がしきい値未満のタッチはスワイプと判定されない", () => {
    const onSwipeNavigate = vi.fn();
    const { container } = render(
      <MobileSwipeBar height={28} onSwipeNavigate={onSwipeNavigate} />,
    );
    const bar = container.firstChild as HTMLElement;
    fireEvent.touchStart(bar, { touches: [{ clientX: 100, clientY: 10 }] });
    fireEvent.touchEnd(bar, {
      changedTouches: [{ clientX: 115, clientY: 12 }],
    });
    expect(onSwipeNavigate).not.toHaveBeenCalled();
  });

  it("縦方向の移動が横を大きく上回る場合はスワイプと判定されない", () => {
    const onSwipeNavigate = vi.fn();
    const { container } = render(
      <MobileSwipeBar height={28} onSwipeNavigate={onSwipeNavigate} />,
    );
    const bar = container.firstChild as HTMLElement;
    fireEvent.touchStart(bar, { touches: [{ clientX: 100, clientY: 10 }] });
    fireEvent.touchEnd(bar, {
      changedTouches: [{ clientX: 160, clientY: 160 }],
    });
    expect(onSwipeNavigate).not.toHaveBeenCalled();
  });

  it("ゆっくりした横スワイプでも切り替わる（時間制限なし）", () => {
    vi.useFakeTimers();
    try {
      const onSwipeNavigate = vi.fn();
      const { container } = render(
        <MobileSwipeBar height={28} onSwipeNavigate={onSwipeNavigate} />,
      );
      const bar = container.firstChild as HTMLElement;
      fireEvent.touchStart(bar, { touches: [{ clientX: 200, clientY: 10 }] });
      vi.advanceTimersByTime(1500);
      fireEvent.touchEnd(bar, {
        changedTouches: [{ clientX: 100, clientY: 12 }],
      });
      expect(onSwipeNavigate).toHaveBeenCalledWith("left");
    } finally {
      vi.useRealTimers();
    }
  });

  it("多少斜めでも横が縦を大きく上回っていれば切り替わる", () => {
    const onSwipeNavigate = vi.fn();
    const { container } = render(
      <MobileSwipeBar height={28} onSwipeNavigate={onSwipeNavigate} />,
    );
    const bar = container.firstChild as HTMLElement;
    fireEvent.touchStart(bar, { touches: [{ clientX: 100, clientY: 10 }] });
    fireEvent.touchEnd(bar, {
      changedTouches: [{ clientX: 160, clientY: 50 }],
    });
    expect(onSwipeNavigate).toHaveBeenCalledWith("right");
  });

  it("onSwipeNavigate 未指定でもスワイプでエラーにならない", () => {
    const { container } = render(<MobileSwipeBar height={28} />);
    const bar = container.firstChild as HTMLElement;
    expect(() => {
      fireEvent.touchStart(bar, { touches: [{ clientX: 200, clientY: 10 }] });
      fireEvent.touchEnd(bar, {
        changedTouches: [{ clientX: 100, clientY: 12 }],
      });
    }).not.toThrow();
  });
});
