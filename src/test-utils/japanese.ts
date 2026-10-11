import { expect } from "vitest";

const JAPANESE_PATTERN = /[぀-ヿ一-鿿]/;
const VISIBLE_ATTRIBUTES = ["title", "aria-label", "placeholder", "alt"];
const VALUE_ATTRIBUTE_TAGS = new Set(["BUTTON", "INPUT"]);
const IGNORED_TAGS = new Set(["SCRIPT", "STYLE"]);

/** かな・カタカナ・漢字を1文字でも含むか */
export function containsJapanese(text: string): boolean {
  return JAPANESE_PATTERN.test(text);
}

/** ユーザーに見える文言（テキストノード・代表的な属性）を収集する */
export function collectUserVisibleText(root: HTMLElement): string[] {
  const texts: string[] = [];

  const walker = root.ownerDocument.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
  );
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (parent && IGNORED_TAGS.has(parent.tagName)) continue;
    const value = node.nodeValue ?? "";
    if (value.trim() !== "") texts.push(value);
  }

  const elements = [root, ...Array.from(root.querySelectorAll("*"))];
  for (const element of elements) {
    if (IGNORED_TAGS.has(element.tagName)) continue;
    for (const name of VISIBLE_ATTRIBUTES) {
      const value = element.getAttribute(name);
      if (value) texts.push(value);
    }
    if (VALUE_ATTRIBUTE_TAGS.has(element.tagName)) {
      const value = element.getAttribute("value");
      if (value) texts.push(value);
    }
  }

  return texts;
}

/** 画面に見える文言に日本語が含まれていないことを検査する */
export function expectNoJapanese(root: HTMLElement): void {
  const found = collectUserVisibleText(root).filter(containsJapanese);
  expect(
    found,
    `Japanese text remains:\n${found.map((t) => `  - ${t}`).join("\n")}`,
  ).toEqual([]);
}
