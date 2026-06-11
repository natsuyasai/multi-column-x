// keyboard_shortcut.ts は IIFE のため、import 時に window へ keydown リスナーが登録される。
// window.__TAURI__.core.invoke をモックして転送内容を検証する。
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

const invokeMock = vi.fn((_cmd: string, _args?: Record<string, unknown>) =>
  Promise.resolve<unknown>(undefined),
);

function pressKey(key: string, ctrlKey = true, shiftKey = false): void {
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key, ctrlKey, shiftKey }),
  );
}

describe("inject/keyboard_shortcut", () => {
  beforeAll(async () => {
    window.__TAURI__ = { core: { invoke: invokeMock } };
    await import("./keyboard_shortcut");
  });

  beforeEach(() => {
    invokeMock.mockClear();
  });

  it("Ctrl+1 を押すと jump_column_1 が転送される", () => {
    pressKey("1");
    expect(invokeMock).toHaveBeenCalledWith("report_keyboard_shortcut", {
      key: "jump_column_1",
    });
  });

  it("Ctrl+9 を押すと jump_column_9 が転送される", () => {
    pressKey("9");
    expect(invokeMock).toHaveBeenCalledWith("report_keyboard_shortcut", {
      key: "jump_column_9",
    });
  });

  it("Ctrl+0 では何も転送されない", () => {
    pressKey("0");
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("Ctrl なしの数字キーでは何も転送されない", () => {
    pressKey("1", false);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("Ctrl+T を押すと compose_tweet が転送される", () => {
    pressKey("t");
    expect(invokeMock).toHaveBeenCalledWith("report_keyboard_shortcut", {
      key: "compose_tweet",
    });
  });

  it("Ctrl+Shift+A を押すと account_manager が転送される", () => {
    pressKey("A", true, true);
    expect(invokeMock).toHaveBeenCalledWith("report_keyboard_shortcut", {
      key: "account_manager",
    });
  });
});
