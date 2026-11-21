import { render } from "@testing-library/react";
import { createElement, StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRestoreFocus } from "./useRestoreFocus";

function Dialog() {
  useRestoreFocus();
  return createElement("div", null, "ダイアログ");
}

function DialogWithAutoFocusInput() {
  useRestoreFocus();
  return createElement("input", { autoFocus: true, "aria-label": "名前" });
}

describe("useRestoreFocus", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("アンマウント時に開く前にフォーカスしていたボタンへフォーカスを戻す", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();

    const { unmount } = render(createElement(Dialog));
    opener.blur();
    expect(document.activeElement).not.toBe(opener);

    unmount();

    expect(document.activeElement).toBe(opener);
  });

  it("開く前の要素がDOMから消えていても例外を出さず、フォーカスも試みない", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const focusSpy = vi.spyOn(opener, "focus");

    const { unmount } = render(createElement(Dialog));
    opener.remove();

    expect(() => unmount()).not.toThrow();
    expect(focusSpy).not.toHaveBeenCalled();
  });

  it("開く前にフォーカスがbodyにあったときは何もしない", () => {
    const bodyFocusSpy = vi.spyOn(document.body, "focus");
    expect(document.activeElement).toBe(document.body);

    const { unmount } = render(createElement(Dialog));
    unmount();

    expect(bodyFocusSpy).not.toHaveBeenCalled();
  });

  it("StrictModeの擬似アンマウントでもダイアログ内のautoFocusの入力欄がフォーカスを保持する", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();

    const { getByLabelText } = render(
      createElement(StrictMode, null, createElement(DialogWithAutoFocusInput)),
    );

    expect(document.activeElement).toBe(getByLabelText("名前"));
  });

  it("アンマウント時に別の既存要素がフォーカスを持っていれば奪わない", () => {
    const opener = document.createElement("button");
    const other = document.createElement("button");
    document.body.append(opener, other);
    opener.focus();

    const { unmount } = render(createElement(Dialog));
    other.focus();
    unmount();

    expect(document.activeElement).toBe(other);
  });
});
