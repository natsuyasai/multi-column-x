import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useFocusMainWebviewOnDialogOpen } from "@/hooks/useFocusMainWebviewOnDialogOpen";

const focusMainWebview = vi.hoisted(() => vi.fn());

vi.mock("@/services/mainWebview", () => ({
  focusMainWebview,
}));

vi.mock("@tauri-apps/plugin-log", () => ({
  error: vi.fn().mockResolvedValue(undefined),
}));

type Props = { anyDialogOpen: boolean; isMobile: boolean };

function renderFocusHook(initial: Props) {
  return renderHook(
    ({ anyDialogOpen, isMobile }: Props) =>
      useFocusMainWebviewOnDialogOpen(anyDialogOpen, isMobile),
    { initialProps: initial },
  );
}

describe("useFocusMainWebviewOnDialogOpen", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    focusMainWebview.mockReset();
    focusMainWebview.mockResolvedValue(undefined);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("ダイアログが開いたときアプリ本体の画面へフォーカスを移す", () => {
    const { rerender } = renderFocusHook({
      anyDialogOpen: false,
      isMobile: false,
    });
    expect(focusMainWebview).not.toHaveBeenCalled();

    rerender({ anyDialogOpen: true, isMobile: false });

    expect(focusMainWebview).toHaveBeenCalledTimes(1);
  });

  it("ダイアログが開いたままの間はフォーカス移動を繰り返さない", () => {
    const { rerender } = renderFocusHook({
      anyDialogOpen: false,
      isMobile: false,
    });
    rerender({ anyDialogOpen: true, isMobile: false });
    expect(focusMainWebview).toHaveBeenCalledTimes(1);

    // 別のダイアログがさらに重ねて開いても anyDialogOpen は true のまま
    rerender({ anyDialogOpen: true, isMobile: false });
    rerender({ anyDialogOpen: true, isMobile: false });

    expect(focusMainWebview).toHaveBeenCalledTimes(1);
  });

  it("ダイアログが閉じたときはフォーカス移動を要求しない", () => {
    const { rerender } = renderFocusHook({
      anyDialogOpen: false,
      isMobile: false,
    });
    rerender({ anyDialogOpen: true, isMobile: false });
    expect(focusMainWebview).toHaveBeenCalledTimes(1);

    rerender({ anyDialogOpen: false, isMobile: false });

    expect(focusMainWebview).toHaveBeenCalledTimes(1);
  });

  it("ダイアログを閉じて開き直したときは再びフォーカスを移す", () => {
    const { rerender } = renderFocusHook({
      anyDialogOpen: false,
      isMobile: false,
    });

    rerender({ anyDialogOpen: true, isMobile: false });
    rerender({ anyDialogOpen: false, isMobile: false });
    rerender({ anyDialogOpen: true, isMobile: false });

    expect(focusMainWebview).toHaveBeenCalledTimes(2);
  });

  it("フォーカス移動に失敗してもダイアログは開いたまま使える", async () => {
    focusMainWebview.mockRejectedValue(new Error("denied"));
    const { rerender } = renderFocusHook({
      anyDialogOpen: false,
      isMobile: false,
    });

    // 例外が出ないこと
    expect(() =>
      rerender({ anyDialogOpen: true, isMobile: false }),
    ).not.toThrow();

    // エラーはログにだけ出る（画面には出さない）
    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });
    expect(consoleErrorSpy.mock.calls[0][0]).toContain("denied");
  });

  it("モバイルではダイアログを開いてもフォーカス移動を要求しない", () => {
    const { rerender } = renderFocusHook({
      anyDialogOpen: false,
      isMobile: true,
    });

    rerender({ anyDialogOpen: true, isMobile: true });

    expect(focusMainWebview).not.toHaveBeenCalled();
  });
});
