import { invoke } from "@tauri-apps/api/core";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEFAULT_COLUMN_SETTINGS } from "../types";
import type { Column } from "../types";
import {
  applyColumnSettingsScripts,
  createColumnWebview,
  removeColumnWebview,
  resizeColumnWebview,
  setColumnCookies,
} from "./columnWebview";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("columnWebview service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invoke).mockResolvedValue(undefined);
  });

  it("createColumnWebviewはcolumnとdataDirectoryとboundsをargsにまとめて送る", async () => {
    const column = {
      id: "col-1",
      accountId: "acc-1",
      pageType: "home",
      width: 350,
      order: 0,
      gridRow: 1,
      gridCol: 1,
      heightMode: "auto",
      settings: DEFAULT_COLUMN_SETTINGS,
    } as Column;
    await createColumnWebview(column, "/data/acc-1", {
      x: 0,
      y: 36,
      width: 350,
      height: 800,
    });
    expect(invoke).toHaveBeenCalledWith("create_column_webview", {
      args: {
        column,
        dataDirectory: "/data/acc-1",
        x: 0,
        y: 36,
        width: 350,
        height: 800,
      },
    });
  });

  it("resizeColumnWebviewはcolumnIdとboundsをまとめて送る", async () => {
    await resizeColumnWebview("col-1", {
      x: 0,
      y: 36,
      width: 400,
      height: 800,
    });
    expect(invoke).toHaveBeenCalledWith("resize_column_webview", {
      bounds: { columnId: "col-1", x: 0, y: 36, width: 400, height: 800 },
    });
  });

  it("removeColumnWebviewはcolumnIdを送る", async () => {
    await removeColumnWebview("col-1");
    expect(invoke).toHaveBeenCalledWith("remove_column_webview", {
      columnId: "col-1",
    });
  });

  it("setColumnCookiesはaccountIdを送る", async () => {
    await setColumnCookies("acc-1");
    expect(invoke).toHaveBeenCalledWith("set_column_cookies", {
      accountId: "acc-1",
    });
  });

  it("applyColumnSettingsScriptsは4つのスクリプトを順に適用する", async () => {
    await applyColumnSettingsScripts("col-1", DEFAULT_COLUMN_SETTINGS, ["ng"]);
    expect(invoke).toHaveBeenCalledTimes(4);
    const labels = vi
      .mocked(invoke)
      .mock.calls.map((c) => (c[1] as { label: string }).label);
    expect(labels.every((l) => l === "column-col-1")).toBe(true);
  });

  it("evalInColumn経由の失敗はapplyColumnSettingsScriptsを中断しない", async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error("eval failed"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    await applyColumnSettingsScripts("col-1", DEFAULT_COLUMN_SETTINGS, []);
    expect(invoke).toHaveBeenCalledTimes(4);
    consoleError.mockRestore();
  });
});
