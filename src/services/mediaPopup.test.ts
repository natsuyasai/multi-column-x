import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IPC_COMMANDS } from "../constants/ipc";
import {
  resetMobileMediaPopupSync,
  syncMobileMediaPopupActive,
} from "./mediaPopup";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const mockInvoke = vi.mocked(invoke);

describe("syncMobileMediaPopupActive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue(undefined);
    resetMobileMediaPopupSync();
  });

  it("初回の呼び出しでは値を問わずネイティブへ通知する", async () => {
    await syncMobileMediaPopupActive(false);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith(
      IPC_COMMANDS.SET_MOBILE_MEDIA_POPUP_ACTIVE,
      { active: false },
    );
  });

  it("同じ値を続けて渡しても2回目は通知しない", async () => {
    await syncMobileMediaPopupActive(true);
    await syncMobileMediaPopupActive(true);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it("値が変わったときは再び通知する", async () => {
    await syncMobileMediaPopupActive(true);
    await syncMobileMediaPopupActive(false);
    await syncMobileMediaPopupActive(true);
    expect(mockInvoke.mock.calls.map((c) => c[1])).toEqual([
      { active: true },
      { active: false },
      { active: true },
    ]);
  });

  it("通知に失敗したら記憶を巻き戻し、同じ値でも次回は再送する", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("ng"));
    await expect(syncMobileMediaPopupActive(true)).rejects.toThrow("ng");
    await syncMobileMediaPopupActive(true);
    expect(mockInvoke).toHaveBeenCalledTimes(2);
  });
});
