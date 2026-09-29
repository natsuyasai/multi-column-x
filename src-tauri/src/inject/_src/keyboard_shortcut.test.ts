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

  it("r キー（Ctrl なし）を押すと reload_column が転送される", () => {
    pressKey("r", false);
    expect(invokeMock).toHaveBeenCalledWith("report_keyboard_shortcut", {
      key: "reload_column",
    });
  });

  it("Shift+R（Ctrl なし）を押すと reload_column が転送される", () => {
    pressKey("R", false, true);
    expect(invokeMock).toHaveBeenCalledWith("report_keyboard_shortcut", {
      key: "reload_column",
    });
  });

  it("? キー（Ctrl なし）を押すと show_shortcut_help が転送される", () => {
    pressKey("?", false);
    expect(invokeMock).toHaveBeenCalledWith("report_keyboard_shortcut", {
      key: "show_shortcut_help",
    });
  });

  it("Ctrl+r では reload_column が転送されない", () => {
    pressKey("r", true);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("input要素にフォーカス中は r キーを押しても転送されない", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "r", ctrlKey: false, bubbles: true }),
    );
    expect(invokeMock).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it("textarea要素にフォーカス中は ? キーを押しても転送されない", () => {
    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    textarea.dispatchEvent(
      new KeyboardEvent("keydown", { key: "?", ctrlKey: false, bubbles: true }),
    );
    expect(invokeMock).not.toHaveBeenCalled();
    document.body.removeChild(textarea);
  });

  it.each([
    ["l", "open_link_popup"],
    ["n", "add_column"],
    [",", "app_settings"],
    ["b", "toggle_top_bar"],
  ])("Ctrl+%s を押すと%sが転送される", (key, expected) => {
    pressKey(key);
    expect(invokeMock).toHaveBeenCalledWith("report_keyboard_shortcut", {
      key: expected,
    });
  });

  it("Shift なしの Ctrl+A では何も転送されない", () => {
    pressKey("a", true, false);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("ショートカットを転送したときはブラウザ既定の動作を止める", () => {
    const event = new KeyboardEvent("keydown", { key: "t", ctrlKey: true });
    const preventDefaultSpy = vi.spyOn(event, "preventDefault");
    window.dispatchEvent(event);
    expect(preventDefaultSpy).toHaveBeenCalled();
  });
});
