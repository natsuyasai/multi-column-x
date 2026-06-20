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
