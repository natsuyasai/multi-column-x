// custom_css.ts は IIFE のため、import 時に実行されて window.__multiColumnX に
// applyCustomCSS が公開される。style 要素の追加・置換・除去を検証する。
import { describe, it, expect, beforeAll, beforeEach } from "vitest";

const STYLE_ID = "multi-column-x-custom-css";

function apply(css: string): void {
  window.__multiColumnX.applyCustomCSS(css);
}

describe("inject/custom_css", () => {
  beforeAll(async () => {
    await import("./custom_css");
  });

  beforeEach(() => {
    document.getElementById(STYLE_ID)?.remove();
  });

  it("CSSをstyle要素としてheadに追加する", () => {
    apply("body { color: red; }");

    const style = document.getElementById(STYLE_ID);
    expect(style?.tagName).toBe("STYLE");
    expect(style?.textContent).toBe("body { color: red; }");
  });

  it("再適用すると既存のstyle要素が置き換えられ重複しない", () => {
    apply("body { color: red; }");
    apply("body { color: blue; }");

    const styles = document.querySelectorAll(`#${CSS.escape(STYLE_ID)}`);
    expect(styles).toHaveLength(1);
    expect(styles[0].textContent).toBe("body { color: blue; }");
  });

  it("空文字を適用すると既存のstyle要素が除去される", () => {
    apply("body { color: red; }");
    apply("");

    expect(document.getElementById(STYLE_ID)).toBeNull();
  });

  it("空白のみのCSSでもstyle要素を追加しない", () => {
    apply("   ");

    expect(document.getElementById(STYLE_ID)).toBeNull();
  });
});
