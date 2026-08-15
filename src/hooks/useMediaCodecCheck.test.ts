import { invoke } from "@tauri-apps/api/core";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMediaCodecCheck } from "./useMediaCodecCheck";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

describe("useMediaCodecCheck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("readyがfalseの間はチェックしない", async () => {
    renderHook(() => useMediaCodecCheck(false));
    await Promise.resolve();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("readyがtrueになったらチェックする", async () => {
    mockInvoke.mockResolvedValue({ h264Available: true, aacAvailable: true });
    renderHook(() => useMediaCodecCheck(true));
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("check_media_codec_support"),
    );
  });

  it("両コーデックとも利用可能な場合はhasMissingCodecがfalseでダイアログは自動で開かない", async () => {
    mockInvoke.mockResolvedValue({ h264Available: true, aacAvailable: true });
    const { result } = renderHook(() => useMediaCodecCheck(true));
    await waitFor(() => expect(result.current.checking).toBe(false));
    expect(result.current.hasMissingCodec).toBe(false);
    expect(result.current.isDialogOpen).toBe(false);
  });

  it("H.264のみ欠如している場合は判定してダイアログが自動で開く", async () => {
    mockInvoke.mockResolvedValue({
      h264Available: false,
      aacAvailable: true,
    });
    const { result } = renderHook(() => useMediaCodecCheck(true));
    await waitFor(() => expect(result.current.checking).toBe(false));
    expect(result.current.missingH264).toBe(true);
    expect(result.current.missingAac).toBe(false);
    expect(result.current.hasMissingCodec).toBe(true);
    expect(result.current.isDialogOpen).toBe(true);
  });

  it("AACのみ欠如している場合は判定してダイアログが自動で開く", async () => {
    mockInvoke.mockResolvedValue({
      h264Available: true,
      aacAvailable: false,
    });
    const { result } = renderHook(() => useMediaCodecCheck(true));
    await waitFor(() => expect(result.current.checking).toBe(false));
    expect(result.current.missingH264).toBe(false);
    expect(result.current.missingAac).toBe(true);
    expect(result.current.hasMissingCodec).toBe(true);
    expect(result.current.isDialogOpen).toBe(true);
  });

  it("両方欠如している場合は判定してダイアログが自動で開く", async () => {
    mockInvoke.mockResolvedValue({
      h264Available: false,
      aacAvailable: false,
    });
    const { result } = renderHook(() => useMediaCodecCheck(true));
    await waitFor(() => expect(result.current.checking).toBe(false));
    expect(result.current.missingH264).toBe(true);
    expect(result.current.missingAac).toBe(true);
    expect(result.current.hasMissingCodec).toBe(true);
    expect(result.current.isDialogOpen).toBe(true);
  });

  it("openDialogとcloseDialogでダイアログの開閉状態が切り替わり、closeDialog後もhasMissingCodecは維持される", async () => {
    mockInvoke.mockResolvedValue({
      h264Available: false,
      aacAvailable: true,
    });
    const { result } = renderHook(() => useMediaCodecCheck(true));
    await waitFor(() => expect(result.current.isDialogOpen).toBe(true));

    act(() => result.current.closeDialog());
    expect(result.current.isDialogOpen).toBe(false);
    expect(result.current.hasMissingCodec).toBe(true);

    act(() => result.current.openDialog());
    expect(result.current.isDialogOpen).toBe(true);
    expect(result.current.hasMissingCodec).toBe(true);
  });

  it("invokeが例外を投げた場合はfail-openとなりhasMissingCodecはfalseのままダイアログも開かない", async () => {
    mockInvoke.mockRejectedValue(new Error("invoke failed"));
    const { result } = renderHook(() => useMediaCodecCheck(true));
    await waitFor(() => expect(result.current.checking).toBe(false));
    expect(result.current.missingH264).toBe(false);
    expect(result.current.missingAac).toBe(false);
    expect(result.current.hasMissingCodec).toBe(false);
    expect(result.current.isDialogOpen).toBe(false);
  });

  it("同一のready=trueの間に再レンダリングが起きてもinvokeは1回しか呼ばれない", async () => {
    mockInvoke.mockResolvedValue({ h264Available: true, aacAvailable: true });
    const { result, rerender } = renderHook(
      ({ ready }: { ready: boolean }) => useMediaCodecCheck(ready),
      { initialProps: { ready: true } },
    );
    await waitFor(() => expect(result.current.checking).toBe(false));
    rerender({ ready: true });
    rerender({ ready: true });
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });
});
