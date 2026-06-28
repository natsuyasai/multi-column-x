import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { rafThrottle } from "./rafThrottle";

describe("rafThrottle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("1フレーム内の複数回呼び出しを1回に集約する", () => {
    const fn = vi.fn();
    const throttled = rafThrottle(fn);

    throttled();
    throttled();
    throttled();

    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersToNextFrame();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("集約後は最後に渡した引数で1回だけ呼び出される", () => {
    const fn = vi.fn();
    const throttled = rafThrottle(fn);

    throttled(1);
    throttled(2);
    throttled(3);
    vi.advanceTimersToNextFrame();

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(3);
  });

  it("フレーム消化後の次回呼び出しは新しいフレームで実行される", () => {
    const fn = vi.fn();
    const throttled = rafThrottle(fn);

    throttled("a");
    vi.advanceTimersToNextFrame();
    expect(fn).toHaveBeenCalledTimes(1);

    throttled("b");
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersToNextFrame();
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith("b");
  });

  it("cancelすると保留中のフレームは実行されない", () => {
    const fn = vi.fn();
    const throttled = rafThrottle(fn);

    throttled();
    throttled.cancel();
    vi.advanceTimersToNextFrame();

    expect(fn).not.toHaveBeenCalled();
  });

  it("cancel後でも再度呼び出せば次フレームで実行される", () => {
    const fn = vi.fn();
    const throttled = rafThrottle(fn);

    throttled();
    throttled.cancel();
    throttled();
    vi.advanceTimersToNextFrame();

    expect(fn).toHaveBeenCalledTimes(1);
  });
});
