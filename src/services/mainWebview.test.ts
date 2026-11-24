import { describe, it, expect, vi, beforeEach } from "vitest";
import { focusMainWebview } from "@/services/mainWebview";

const setFocus = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({ setFocus }),
}));

describe("focusMainWebview", () => {
  beforeEach(() => {
    setFocus.mockReset();
    setFocus.mockResolvedValue(undefined);
  });

  it("現在のWebViewへフォーカス移動を1回要求する", async () => {
    await focusMainWebview();

    expect(setFocus).toHaveBeenCalledTimes(1);
  });

  it("フォーカス移動が失敗したときは呼び出し元へ例外を伝える", async () => {
    setFocus.mockRejectedValue(new Error("denied"));

    await expect(focusMainWebview()).rejects.toThrow("denied");
  });
});
