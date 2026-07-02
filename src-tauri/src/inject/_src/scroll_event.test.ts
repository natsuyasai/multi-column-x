// scroll_event.ts は IIFE のため import 時に window へ capture 付きの wheel リスナーが
// 登録される。横方向の移動量を requestAnimationFrame で1フレームに間引いて
// window.__TAURI__.core.invoke("report_webview_scroll", { delta }) へ転送する。
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

const invokeMock = vi.fn((_cmd: string, _args?: Record<string, unknown>) =>
  Promise.resolve<unknown>(undefined),
);

function wheel(deltaX: number, deltaY: number, shiftKey = false): void {
  window.dispatchEvent(
    new WheelEvent("wheel", { deltaX, deltaY, shiftKey, cancelable: true }),
  );
}

function flushAnimationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

describe("inject/scroll_event", () => {
  beforeAll(async () => {
    window.__TAURI__ = { core: { invoke: invokeMock } };
    await import("./scroll_event");
  });

  beforeEach(() => {
    invokeMock.mockClear();
  });

  it("横ホイールでreport_webview_scrollを呼ぶ", async () => {
    wheel(100, 0);
    await flushAnimationFrame();

    expect(invokeMock).toHaveBeenCalledWith("report_webview_scroll", {
      delta: 100,
    });
  });

  it("縦ホイールでは呼ばない", async () => {
    wheel(0, 100);
    await flushAnimationFrame();

    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("Shift押下中の縦ホイールは横スクロールとして転送する", async () => {
    wheel(0, 80, true);
    await flushAnimationFrame();

    expect(invokeMock).toHaveBeenCalledWith("report_webview_scroll", {
      delta: 80,
    });
  });

  it("1フレーム内の複数回のホイールは合算して1回だけ報告する", async () => {
    wheel(50, 0);
    wheel(30, 0);
    await flushAnimationFrame();

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("report_webview_scroll", {
      delta: 80,
    });
  });
});
