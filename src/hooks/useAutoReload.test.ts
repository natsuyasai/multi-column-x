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

describe("useAutoReload（全カラム再読み込みでのカウントダウン振り直し）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    useAppStore.setState({ reloadAllSignal: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
    useAppStore.setState({ reloadAllSignal: 0 });
  });

  it("全カラム再読み込みボタンを押すと各カラムの自動更新カウントダウンが振り直される", () => {
    const a = renderHook(() =>
      useAutoReload({ columnId: "col-a", enabled: true, intervalSec: 60 }),
    );
    const b = renderHook(() =>
      useAutoReload({ columnId: "col-b", enabled: true, intervalSec: 30 }),
    );
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(a.result.current.remaining).toBe(50);
    expect(b.result.current.remaining).toBe(20);

    act(() => {
      useAppStore.getState().bumpReloadAllSignal();
    });

    expect(a.result.current.remaining).toBe(60);
    expect(b.result.current.remaining).toBe(30);
  });

  it("振り直し後は間隔の最初から再びカウントダウンする", () => {
    const { result } = renderHook(() =>
      useAutoReload({ columnId: "col-1", enabled: true, intervalSec: 60 }),
    );
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    act(() => {
      useAppStore.getState().bumpReloadAllSignal();
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.remaining).toBe(58);
  });

  it("初回マウントではカウントダウンを振り直さずintervalSecのまま開始する", () => {
    useAppStore.setState({ reloadAllSignal: 5 });
    const { result } = renderHook(() =>
      useAutoReload({ columnId: "col-1", enabled: true, intervalSec: 60 }),
    );
    expect(result.current.remaining).toBe(60);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.remaining).toBe(57);
  });

  it("自動更新が無効なカラムはsignalが増えてもremainingがnullのまま", () => {
    const { result } = renderHook(() =>
      useAutoReload({ columnId: "col-1", enabled: false, intervalSec: 60 }),
    );
    act(() => {
      useAppStore.getState().bumpReloadAllSignal();
    });
    expect(result.current.remaining).toBeNull();
  });

  it("signalが増えてもeval_in_webviewは余計に呼ばれない", () => {
    renderHook(() =>
      useAutoReload({ columnId: "col-1", enabled: true, intervalSec: 60 }),
    );
    act(() => {
      useAppStore.getState().bumpReloadAllSignal();
    });
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("bumpReloadAllSignalを呼ぶたびにreloadAllSignalが1ずつ増える", () => {
    expect(useAppStore.getState().reloadAllSignal).toBe(0);
    useAppStore.getState().bumpReloadAllSignal();
    useAppStore.getState().bumpReloadAllSignal();
    expect(useAppStore.getState().reloadAllSignal).toBe(2);
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
