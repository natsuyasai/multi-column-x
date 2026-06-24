import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createUpdater } from "../services/updater";
import { useAppUpdater } from "./useAppUpdater";

vi.mock("../services/updater", () => ({ createUpdater: vi.fn() }));

describe("useAppUpdater", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("起動時に更新があればavailableに反映する", async () => {
    vi.mocked(createUpdater).mockReturnValue({
      check: vi.fn().mockResolvedValue({ version: "1.2.0" }),
      install: vi.fn(),
    });
    const { result } = renderHook(() => useAppUpdater(false));
    await waitFor(() =>
      expect(result.current.available).toEqual({ version: "1.2.0" }),
    );
  });

  it("readyがfalseの間は起動チェックせず、trueになってから1度だけチェックする", async () => {
    const check = vi.fn().mockResolvedValue({ version: "1.2.0" });
    vi.mocked(createUpdater).mockReturnValue({ check, install: vi.fn() });
    const { result, rerender } = renderHook(
      ({ ready }: { ready: boolean }) => useAppUpdater(false, ready),
      { initialProps: { ready: false } },
    );
    // ready=false の間はチェックされない（カラム復元前）
    await Promise.resolve();
    expect(check).not.toHaveBeenCalled();
    expect(result.current.available).toBeNull();
    // ready=true（カラム復元完了）になって初めてチェックする
    rerender({ ready: true });
    await waitFor(() =>
      expect(result.current.available).toEqual({ version: "1.2.0" }),
    );
    expect(check).toHaveBeenCalledOnce();
  });

  it("見送り済みバージョンは起動時に表示しない", async () => {
    localStorage.setItem("mcx_dismissedUpdateVersion", "1.2.0");
    vi.mocked(createUpdater).mockReturnValue({
      check: vi.fn().mockResolvedValue({ version: "1.2.0" }),
      install: vi.fn(),
    });
    const { result } = renderHook(() => useAppUpdater(false));
    await waitFor(() => expect(result.current.checking).toBe(false));
    expect(result.current.available).toBeNull();
  });

  it("dismissで見送りを記録しavailableを消す", async () => {
    vi.mocked(createUpdater).mockReturnValue({
      check: vi.fn().mockResolvedValue({ version: "1.2.0" }),
      install: vi.fn(),
    });
    const { result } = renderHook(() => useAppUpdater(false));
    await waitFor(() => expect(result.current.available).not.toBeNull());
    act(() => result.current.dismiss());
    expect(result.current.available).toBeNull();
    expect(localStorage.getItem("mcx_dismissedUpdateVersion")).toBe("1.2.0");
  });

  it("checkManualは見送り済みでも更新を表示する", async () => {
    localStorage.setItem("mcx_dismissedUpdateVersion", "1.2.0");
    vi.mocked(createUpdater).mockReturnValue({
      check: vi.fn().mockResolvedValue({ version: "1.2.0" }),
      install: vi.fn(),
    });
    const { result } = renderHook(() => useAppUpdater(false));
    await waitFor(() => expect(result.current.checking).toBe(false));
    await act(async () => await result.current.checkManually());
    expect(result.current.available).toEqual({ version: "1.2.0" });
  });

  it("isMobileがfalse→trueに切り替わると新しいupdaterで再チェックする", async () => {
    const desktop = {
      check: vi.fn().mockResolvedValue(null),
      install: vi.fn(),
    };
    const mobile = {
      check: vi.fn().mockResolvedValue({ version: "1.2.0" }),
      install: vi.fn(),
    };
    vi.mocked(createUpdater).mockImplementation((isMobile: boolean) =>
      isMobile ? mobile : desktop,
    );
    const { result, rerender } = renderHook(
      ({ m }: { m: boolean }) => useAppUpdater(m),
      { initialProps: { m: false } },
    );
    await waitFor(() => expect(desktop.check).toHaveBeenCalledOnce());
    rerender({ m: true });
    await waitFor(() =>
      expect(result.current.available).toEqual({ version: "1.2.0" }),
    );
    expect(mobile.check).toHaveBeenCalledOnce();
  });

  it("install中は通知されたprogressを公開し完了でnullに戻す", async () => {
    // install を任意のタイミングで解決できるよう deferred にする。
    let resolveInstall!: () => void;
    let report!: (p: unknown) => void;
    const install = vi.fn().mockImplementation((onProgress) => {
      report = onProgress;
      return new Promise<void>((resolve) => {
        resolveInstall = resolve;
      });
    });
    vi.mocked(createUpdater).mockReturnValue({
      check: vi.fn().mockResolvedValue({ version: "1.2.0" }),
      install,
    });
    const { result } = renderHook(() => useAppUpdater(false));
    await waitFor(() => expect(result.current.available).not.toBeNull());

    // install 実行中（未解決）に進捗を通知すると progress に反映される。
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.install();
    });
    act(() => report({ phase: "downloading", downloaded: 500, total: 1000 }));
    expect(result.current.progress).toEqual({
      phase: "downloading",
      downloaded: 500,
      total: 1000,
    });
    expect(result.current.installing).toBe(true);

    act(() => report({ phase: "installing" }));
    expect(result.current.progress).toEqual({ phase: "installing" });

    // 解決後は片付けられて null に戻る。
    await act(async () => {
      resolveInstall();
      await pending;
    });
    expect(result.current.progress).toBeNull();
    expect(result.current.installing).toBe(false);
  });

  it("installが失敗してもprogressはnullに戻る", async () => {
    const install = vi.fn().mockRejectedValue(new Error("boom"));
    vi.mocked(createUpdater).mockReturnValue({
      check: vi.fn().mockResolvedValue({ version: "1.2.0" }),
      install,
    });
    const { result } = renderHook(() => useAppUpdater(false));
    await waitFor(() => expect(result.current.available).not.toBeNull());
    await act(async () => await result.current.install());
    expect(result.current.progress).toBeNull();
    expect(result.current.installing).toBe(false);
  });

  it("checkManualで更新が無ければmanualResultがnoneになる", async () => {
    vi.mocked(createUpdater).mockReturnValue({
      check: vi.fn().mockResolvedValue(null),
      install: vi.fn(),
    });
    const { result } = renderHook(() => useAppUpdater(false));
    await waitFor(() => expect(result.current.checking).toBe(false));
    await act(async () => await result.current.checkManually());
    expect(result.current.manualResult).toBe("none");
  });
});
