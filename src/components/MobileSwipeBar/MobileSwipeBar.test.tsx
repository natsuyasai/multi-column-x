import { render, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MobileSwipeBar } from "./MobileSwipeBar";

describe("MobileSwipeBar", () => {
  it("左へスワイプすると onSwipeNavigate が left で呼ばれる", () => {
    const onSwipeNavigate = vi.fn();
    const { container } = render(
      <MobileSwipeBar
        height={28}
        opacity={100}
        onSwipeNavigate={onSwipeNavigate}
      />,
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
      <MobileSwipeBar
        height={28}
        opacity={100}
        onSwipeNavigate={onSwipeNavigate}
      />,
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
      <MobileSwipeBar
        height={28}
        opacity={100}
        onSwipeNavigate={onSwipeNavigate}
      />,
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
      <MobileSwipeBar
        height={28}
        opacity={100}
        onSwipeNavigate={onSwipeNavigate}
      />,
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
        <MobileSwipeBar
          height={28}
          opacity={100}
          onSwipeNavigate={onSwipeNavigate}
        />,
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
      <MobileSwipeBar
        height={28}
        opacity={100}
        onSwipeNavigate={onSwipeNavigate}
      />,
    );
    const bar = container.firstChild as HTMLElement;
    fireEvent.touchStart(bar, { touches: [{ clientX: 100, clientY: 10 }] });
    fireEvent.touchEnd(bar, {
      changedTouches: [{ clientX: 160, clientY: 50 }],
    });
    expect(onSwipeNavigate).toHaveBeenCalledWith("right");
  });

  it("onSwipeNavigate 未指定でもスワイプでエラーにならない", () => {
    const { container } = render(<MobileSwipeBar height={28} opacity={100} />);
    const bar = container.firstChild as HTMLElement;
    expect(() => {
      fireEvent.touchStart(bar, { touches: [{ clientX: 200, clientY: 10 }] });
      fireEvent.touchEnd(bar, {
        changedTouches: [{ clientX: 100, clientY: 12 }],
      });
    }).not.toThrow();
  });

  it("横移動がしきい値を超え縦移動より優勢な touchmove で onSwipeProgress が left で呼ばれる", () => {
    const onSwipeProgress = vi.fn();
    const { container } = render(
      <MobileSwipeBar
        height={28}
        opacity={100}
        onSwipeProgress={onSwipeProgress}
      />,
    );
    const bar = container.firstChild as HTMLElement;
    fireEvent.touchStart(bar, { touches: [{ clientX: 200, clientY: 10 }] });
    fireEvent.touchMove(bar, { touches: [{ clientX: 180, clientY: 12 }] });
    expect(onSwipeProgress).toHaveBeenCalledWith("left");
  });

  it("横移動がしきい値を超え縦移動より優勢な touchmove で onSwipeProgress が right で呼ばれる", () => {
    const onSwipeProgress = vi.fn();
    const { container } = render(
      <MobileSwipeBar
        height={28}
        opacity={100}
        onSwipeProgress={onSwipeProgress}
      />,
    );
    const bar = container.firstChild as HTMLElement;
    fireEvent.touchStart(bar, { touches: [{ clientX: 100, clientY: 10 }] });
    fireEvent.touchMove(bar, { touches: [{ clientX: 120, clientY: 12 }] });
    expect(onSwipeProgress).toHaveBeenCalledWith("right");
  });

  it("touchmove で縦移動が優勢な場合は onSwipeProgress が呼ばれない", () => {
    const onSwipeProgress = vi.fn();
    const { container } = render(
      <MobileSwipeBar
        height={28}
        opacity={100}
        onSwipeProgress={onSwipeProgress}
      />,
    );
    const bar = container.firstChild as HTMLElement;
    fireEvent.touchStart(bar, { touches: [{ clientX: 100, clientY: 10 }] });
    fireEvent.touchMove(bar, { touches: [{ clientX: 115, clientY: 60 }] });
    expect(onSwipeProgress).not.toHaveBeenCalled();
  });

  it("touchmove の移動量がしきい値未満の場合は onSwipeProgress が呼ばれない", () => {
    const onSwipeProgress = vi.fn();
    const { container } = render(
      <MobileSwipeBar
        height={28}
        opacity={100}
        onSwipeProgress={onSwipeProgress}
      />,
    );
    const bar = container.firstChild as HTMLElement;
    fireEvent.touchStart(bar, { touches: [{ clientX: 100, clientY: 10 }] });
    fireEvent.touchMove(bar, { touches: [{ clientX: 105, clientY: 10 }] });
    expect(onSwipeProgress).not.toHaveBeenCalled();
  });

  it("一度 progress 通知した後、しきい値未満に戻る touchmove では onSwipeProgress が null で呼ばれる", () => {
    const onSwipeProgress = vi.fn();
    const { container } = render(
      <MobileSwipeBar
        height={28}
        opacity={100}
        onSwipeProgress={onSwipeProgress}
      />,
    );
    const bar = container.firstChild as HTMLElement;
    fireEvent.touchStart(bar, { touches: [{ clientX: 200, clientY: 10 }] });
    fireEvent.touchMove(bar, { touches: [{ clientX: 180, clientY: 12 }] });
    expect(onSwipeProgress).toHaveBeenCalledWith("left");
    onSwipeProgress.mockClear();
    fireEvent.touchMove(bar, { touches: [{ clientX: 195, clientY: 12 }] });
    expect(onSwipeProgress).toHaveBeenCalledWith(null);
  });

  it("同じ方向の touchmove が連続しても onSwipeProgress は再度呼ばれない", () => {
    const onSwipeProgress = vi.fn();
    const { container } = render(
      <MobileSwipeBar
        height={28}
        opacity={100}
        onSwipeProgress={onSwipeProgress}
      />,
    );
    const bar = container.firstChild as HTMLElement;
    fireEvent.touchStart(bar, { touches: [{ clientX: 200, clientY: 10 }] });
    fireEvent.touchMove(bar, { touches: [{ clientX: 180, clientY: 12 }] });
    expect(onSwipeProgress).toHaveBeenCalledTimes(1);
    onSwipeProgress.mockClear();
    fireEvent.touchMove(bar, { touches: [{ clientX: 160, clientY: 12 }] });
    expect(onSwipeProgress).not.toHaveBeenCalled();
  });

  it("touchcancel で onSwipeProgress が null で呼ばれる", () => {
    const onSwipeProgress = vi.fn();
    const { container } = render(
      <MobileSwipeBar
        height={28}
        opacity={100}
        onSwipeProgress={onSwipeProgress}
      />,
    );
    const bar = container.firstChild as HTMLElement;
    fireEvent.touchStart(bar, { touches: [{ clientX: 200, clientY: 10 }] });
    fireEvent.touchMove(bar, { touches: [{ clientX: 180, clientY: 12 }] });
    onSwipeProgress.mockClear();
    fireEvent.touchCancel(bar);
    expect(onSwipeProgress).toHaveBeenCalledWith(null);
  });

  it("progress 通知が無い状態での touchcancel では onSwipeProgress が呼ばれない", () => {
    const onSwipeProgress = vi.fn();
    const { container } = render(
      <MobileSwipeBar
        height={28}
        opacity={100}
        onSwipeProgress={onSwipeProgress}
      />,
    );
    const bar = container.firstChild as HTMLElement;
    fireEvent.touchStart(bar, { touches: [{ clientX: 200, clientY: 10 }] });
    fireEvent.touchCancel(bar);
    expect(onSwipeProgress).not.toHaveBeenCalled();
  });

  it("onSwipeProgress 未指定でも touchmove でエラーにならない", () => {
    const { container } = render(<MobileSwipeBar height={28} opacity={100} />);
    const bar = container.firstChild as HTMLElement;
    expect(() => {
      fireEvent.touchStart(bar, { touches: [{ clientX: 200, clientY: 10 }] });
      fireEvent.touchMove(bar, { touches: [{ clientX: 180, clientY: 12 }] });
      fireEvent.touchCancel(bar);
    }).not.toThrow();
  });

  it("opacity prop がルート要素の style.opacity に0-1のfloatとして反映される", () => {
    const { container } = render(<MobileSwipeBar height={28} opacity={80} />);
    const bar = container.firstChild as HTMLElement;
    expect(bar.style.opacity).toBe("0.8");
  });

  it("opacity が0のとき style.opacity が0になる", () => {
    const { container } = render(<MobileSwipeBar height={28} opacity={0} />);
    const bar = container.firstChild as HTMLElement;
    expect(bar.style.opacity).toBe("0");
  });

  it("opacity が100のとき style.opacity が1になる", () => {
    const { container } = render(<MobileSwipeBar height={28} opacity={100} />);
    const bar = container.firstChild as HTMLElement;
    expect(bar.style.opacity).toBe("1");
  });
});
