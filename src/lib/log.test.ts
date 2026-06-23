import { error as pluginError } from "@tauri-apps/plugin-log";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logError } from "./log";

vi.mock("@tauri-apps/plugin-log", () => ({
  error: vi.fn().mockResolvedValue(undefined),
}));

describe("logError", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("文脈名とErrorのmessageを含むメッセージをconsole.errorに出力する", () => {
    logError("listen cleanup")(new Error("boom"));

    expect(console.error).toHaveBeenCalledWith("[listen cleanup] boom");
  });

  it("Error以外の値は文字列化して出力する", () => {
    logError("invoke")("raw failure");

    expect(console.error).toHaveBeenCalledWith("[invoke] raw failure");
  });

  it("plugin-logのerrorにも同じメッセージを送る", () => {
    logError("ctx")(new Error("oops"));

    expect(pluginError).toHaveBeenCalledWith("[ctx] oops");
  });

  it("plugin-logのerrorがrejectしても例外を投げない", async () => {
    vi.mocked(pluginError).mockRejectedValueOnce(new Error("ipc down"));

    expect(() => logError("ctx")(new Error("oops"))).not.toThrow();
    await Promise.resolve();
  });
});
