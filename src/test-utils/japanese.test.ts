import { describe, expect, it } from "vitest";
import {
  collectUserVisibleText,
  containsJapanese,
  expectNoJapanese,
} from "./japanese";

function render(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  return root;
}

describe("containsJapanese", () => {
  it.each(["こんにちは", "カタカナ", "漢字", "Hello 設定"])(
    "日本語を含む文字列は true を返す（%s）",
    (text) => {
      expect(containsJapanese(text)).toBe(true);
    },
  );

  it.each(["Hello", "", "Settings 123 !?", "Multi Column X"])(
    "日本語を含まない文字列は false を返す（%s）",
    (text) => {
      expect(containsJapanese(text)).toBe(false);
    },
  );
});

describe("collectUserVisibleText", () => {
  it("テキストノードを収集する", () => {
    const root = render("<p>Hello <b>World</b></p>");

    expect(collectUserVisibleText(root)).toEqual(
      expect.arrayContaining(["Hello ", "World"]),
    );
  });

  it("title・aria-label・placeholder・alt 属性を収集する", () => {
    const root = render(
      '<button title="T" aria-label="A"></button><input placeholder="P"><img alt="I">',
    );

    expect(collectUserVisibleText(root).sort()).toEqual(["A", "I", "P", "T"]);
  });

  it("button と input の value 属性を収集する", () => {
    const root = render('<button value="B"></button><input value="V">');

    expect(collectUserVisibleText(root).sort()).toEqual(["B", "V"]);
  });

  it("button と input 以外の value 属性は収集しない", () => {
    const root = render('<li value="3">x</li>');

    expect(collectUserVisibleText(root)).toEqual(["x"]);
  });

  it("script と style の中身は除外する", () => {
    const root = render(
      "<script>日本語</script><style>/* 日本語 */</style><p>ok</p>",
    );

    expect(collectUserVisibleText(root)).toEqual(["ok"]);
  });

  it("ルート要素自身の属性も収集する", () => {
    const root = render("");
    root.setAttribute("aria-label", "Root");

    expect(collectUserVisibleText(root)).toEqual(["Root"]);
  });
});

describe("expectNoJapanese", () => {
  it("日本語がなければ成功する", () => {
    expect(() => expectNoJapanese(render("<p>Hello</p>"))).not.toThrow();
  });

  it("テキストに日本語があれば失敗し、該当文言を列挙する", () => {
    expect(() => expectNoJapanese(render("<p>設定</p>"))).toThrow(/設定/);
  });

  it("属性のみに日本語があっても失敗する", () => {
    expect(() =>
      expectNoJapanese(render('<button aria-label="閉じる">x</button>')),
    ).toThrow(/閉じる/);
  });

  it("value 属性の日本語を検出する", () => {
    expect(() => expectNoJapanese(render('<input value="保存">'))).toThrow(
      /保存/,
    );
  });
});
