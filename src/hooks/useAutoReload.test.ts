import { invoke } from "@tauri-apps/api/core";
import { renderHook, act } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WEBVIEW_SCRIPTS } from "@/constants/ipc";
import { useAppStore } from "@/store/useAppStore";
import { useAutoReload } from "./useAutoReload";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

const mockInvoke = vi.mocked(invoke);

describe("useAutoReload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("無効時はremainingがnullになる", () => {
    const { result } = renderHook(() =>
      useAutoReload({ columnId: "col-1", enabled: false, intervalSec: 60 }),
    );
    expect(result.current.remaining).toBeNull();
  });

  it("有効時はintervalSecから1秒ごとにカウントダウンする", () => {
    const { result } = renderHook(() =>
      useAutoReload({ columnId: "col-1", enabled: true, intervalSec: 60 }),
    );
    expect(result.current.remaining).toBe(60);

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.remaining).toBe(57);
  });

  it("カウントが尽きるとeval_in_webviewでリロードしカウントを再開する", () => {
    const { result } = renderHook(() =>
      useAutoReload({ columnId: "col-1", enabled: true, intervalSec: 3 }),
    );

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(mockInvoke).toHaveBeenCalledWith("eval_in_webview", {
      label: "column-col-1",
      script: expect.stringContaining("triggerReload"),
    });
    expect(result.current.remaining).toBe(3); // 再カウント開始
  });

  it("自動更新の間隔で実行される更新は先頭へ戻す指定を持たない", () => {
    renderHook(() =>
      useAutoReload({ columnId: "col-1", enabled: true, intervalSec: 3 }),
    );

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    const script = (mockInvoke.mock.calls[0][1] as { script: string }).script;
    expect(script).toBe(WEBVIEW_SCRIPTS.TRIGGER_RELOAD);
    expect(script).toContain("triggerReload");
    expect(script).not.toContain("triggerReload(true)");
  });

  it("自動更新の間隔が経過したとき、StrictModeでも更新は1回だけ実行される", () => {
    renderHook(
      () => useAutoReload({ columnId: "col-1", enabled: true, intervalSec: 3 }),
      { wrapper: StrictMode },
    );

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it("resetでカウントがintervalSecに戻る", () => {
    const { result } = renderHook(() =>
      useAutoReload({ columnId: "col-1", enabled: true, intervalSec: 60 }),
    );
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(result.current.remaining).toBe(50);

    act(() => {
      result.current.reset();
    });
    expect(result.current.remaining).toBe(60);
  });

  it("無効時のresetは何もしない", () => {
    const { result } = renderHook(() =>
      useAutoReload({ columnId: "col-1", enabled: false, intervalSec: 60 }),
    );
    act(() => {
      result.current.reset();
    });
    expect(result.current.remaining).toBeNull();
  });

  it("intervalSecが0以下なら無効扱いになる", () => {
    const { result } = renderHook(() =>
      useAutoReload({ columnId: "col-1", enabled: true, intervalSec: 0 }),
    );
    expect(result.current.remaining).toBeNull();
  });

  it("アンマウントでタイマーが停止しリロードが発火しない", () => {
    const { unmount } = renderHook(() =>
      useAutoReload({ columnId: "col-1", enabled: true, intervalSec: 2 }),
    );
    unmount();
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});

describe("useAutoReload（バックアップ復元中の停止）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    useAppStore.setState({ restoreInProgress: false });
  });

  afterEach(() => {
    vi.useRealTimers();
    useAppStore.setState({ restoreInProgress: false });
  });

  it("復元中は更新時刻になっても eval_in_webview を呼ばない", () => {
    renderHook(() =>
      useAutoReload({ columnId: "col-1", enabled: true, intervalSec: 3 }),
    );
    useAppStore.getState().beginRestore();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("同じタイマーのまま復元が終わると、次の更新時刻から再び更新する", () => {
    renderHook(() =>
      useAutoReload({ columnId: "col-1", enabled: true, intervalSec: 3 }),
    );
    useAppStore.getState().beginRestore();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    useAppStore.getState().finishRestore();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith("eval_in_webview", {
      label: "column-col-1",
      script: WEBVIEW_SCRIPTS.TRIGGER_RELOAD,
    });
  });
});
