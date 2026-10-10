import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IPC_COMMANDS } from "@/constants/ipc";
import {
  addChromeExtension,
  addExtensionFromFolder,
  detectChromeExtensions,
  listExtensions,
  openExtensionPage,
  pickExtensionFolder,
  removeExtension,
  setExtensionEnabled,
} from "@/services/extensions";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

describe("extensions サービス", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue(undefined);
  });

  it("listExtensions は list_extensions を引数なしで呼び結果を返す", async () => {
    mockInvoke.mockResolvedValue([]);
    await expect(listExtensions()).resolves.toEqual([]);
    expect(mockInvoke).toHaveBeenCalledWith(IPC_COMMANDS.LIST_EXTENSIONS);
  });

  it("detectChromeExtensions は detect_chrome_extensions を呼び結果を返す", async () => {
    const result = { chromeFound: false, items: [] };
    mockInvoke.mockResolvedValue(result);
    await expect(detectChromeExtensions()).resolves.toEqual(result);
    expect(mockInvoke).toHaveBeenCalledWith(
      IPC_COMMANDS.DETECT_CHROME_EXTENSIONS,
    );
  });

  it("pickExtensionFolder は選択パスを返し、キャンセルでは null を返す", async () => {
    mockInvoke.mockResolvedValueOnce("C:\\ext");
    await expect(pickExtensionFolder()).resolves.toBe("C:\\ext");
    mockInvoke.mockResolvedValueOnce(null);
    await expect(pickExtensionFolder()).resolves.toBeNull();
    expect(mockInvoke).toHaveBeenCalledWith(IPC_COMMANDS.PICK_EXTENSION_FOLDER);
  });

  it("addExtensionFromFolder は path を渡す", async () => {
    await addExtensionFromFolder("C:\\ext");
    expect(mockInvoke).toHaveBeenCalledWith(
      IPC_COMMANDS.ADD_EXTENSION_FROM_FOLDER,
      { path: "C:\\ext" },
    );
  });

  it("addChromeExtension は chromeId を渡す", async () => {
    await addChromeExtension("abcd");
    expect(mockInvoke).toHaveBeenCalledWith(IPC_COMMANDS.ADD_CHROME_EXTENSION, {
      chromeId: "abcd",
    });
  });

  it("setExtensionEnabled は id と enabled を渡す", async () => {
    await setExtensionEnabled("e1", false);
    expect(mockInvoke).toHaveBeenCalledWith(
      IPC_COMMANDS.SET_EXTENSION_ENABLED,
      { id: "e1", enabled: false },
    );
  });

  it("removeExtension は id を渡す", async () => {
    await removeExtension("e1");
    expect(mockInvoke).toHaveBeenCalledWith(IPC_COMMANDS.REMOVE_EXTENSION, {
      id: "e1",
    });
  });

  it("openExtensionPage は id・kind・accountId を渡す", async () => {
    await openExtensionPage("e1", "options", "acc-1");
    expect(mockInvoke).toHaveBeenCalledWith(IPC_COMMANDS.OPEN_EXTENSION_PAGE, {
      id: "e1",
      kind: "options",
      accountId: "acc-1",
    });
  });

  it("コマンドが文字列エラーで reject されたらそのまま reject する", async () => {
    mockInvoke.mockRejectedValue("manifest.json が見つかりません");
    await expect(addExtensionFromFolder("C:\\x")).rejects.toBe(
      "manifest.json が見つかりません",
    );
  });
});
