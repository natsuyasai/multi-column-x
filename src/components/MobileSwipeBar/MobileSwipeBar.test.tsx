import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { MobileSwipeBar } from "./MobileSwipeBar";

describe("MobileSwipeBar", () => {
  it("左へフリックすると onSwipeNavigate が left で呼ばれる", () => {
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

  it("右へフリックすると onSwipeNavigate が right で呼ばれる", () => {
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

  it("移動量がしきい値未満のタッチはフリックと判定されない", () => {
    const onSwipeNavigate = vi.fn();
    const { container } = render(
      <MobileSwipeBar height={28} onSwipeNavigate={onSwipeNavigate} />,
    );
    const bar = container.firstChild as HTMLElement;
    fireEvent.touchStart(bar, { touches: [{ clientX: 100, clientY: 10 }] });
    fireEvent.touchEnd(bar, {
      changedTouches: [{ clientX: 110, clientY: 12 }],
    });
    expect(onSwipeNavigate).not.toHaveBeenCalled();
  });

  it("縦方向の移動が横より大きい場合はフリックと判定されない", () => {
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

  it("規定時間を超えたゆっくりした移動はフリックと判定されない", () => {
    vi.useFakeTimers();
    try {
      const onSwipeNavigate = vi.fn();
      const { container } = render(
        <MobileSwipeBar height={28} onSwipeNavigate={onSwipeNavigate} />,
      );
      const bar = container.firstChild as HTMLElement;
      fireEvent.touchStart(bar, { touches: [{ clientX: 200, clientY: 10 }] });
      vi.advanceTimersByTime(800);
      fireEvent.touchEnd(bar, {
        changedTouches: [{ clientX: 100, clientY: 12 }],
      });
      expect(onSwipeNavigate).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("onSwipeNavigate 未指定でもフリックでエラーにならない", () => {
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
