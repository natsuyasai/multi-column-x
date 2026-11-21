import { describe, expect, it } from "vitest";
import { expectAccessibleControls } from "./a11y";

function mount(html: string): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.appendChild(container);
  return container;
}

describe("expectAccessibleControls", () => {
  it("ラベル付きの入力欄は通る", () => {
    const container = mount('<label for="a">名前</label><input id="a" />');

    expect(() => expectAccessibleControls(container)).not.toThrow();
  });

  it("aria-label 付きのアイコンボタンは通る", () => {
    const container = mount('<button aria-label="閉じる"><svg></svg></button>');

    expect(() => expectAccessibleControls(container)).not.toThrow();
  });

  it("ラベルの無い入力欄は失敗し、違反要素を列挙する", () => {
    const container = mount('<input id="orphan" />');

    expect(() => expectAccessibleControls(container)).toThrow(/input/);
  });

  it("中身の無いボタンは失敗する", () => {
    const container = mount("<button></button>");

    expect(() => expectAccessibleControls(container)).toThrow(/button/);
  });
});
