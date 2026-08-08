import { describe, it, expect } from "vitest";
import {
  isRegexNgWord,
  validateNgWordLine,
  validateNgWordLines,
} from "./ngWordPattern";

describe("isRegexNgWord", () => {
  it("通常の文字列はfalseを返す", () => {
    expect(isRegexNgWord("spam")).toBe(false);
  });

  it("空文字列はfalseを返す", () => {
    expect(isRegexNgWord("")).toBe(false);
  });

  it("スラッシュで囲まれた文字列はtrueを返す", () => {
    expect(isRegexNgWord("/spam|ad/")).toBe(true);
  });

  it("flags付きのスラッシュ区切り文字列はtrueを返す", () => {
    expect(isRegexNgWord("/foo/i")).toBe(true);
  });

  it("日本語を含むスラッシュ区切り文字列はtrueを返す", () => {
    expect(isRegexNgWord("/日本語/")).toBe(true);
  });
});

describe("validateNgWordLine", () => {
  it("通常の文字列は常に有効(null)を返す", () => {
    expect(validateNgWordLine("spam")).toBeNull();
  });

  it("有効な正規表現(フラグなし)はnullを返す", () => {
    expect(validateNgWordLine("/spam|ad/")).toBeNull();
  });

  it("有効な正規表現(iフラグ付き)はnullを返す", () => {
    expect(validateNgWordLine("/foo/i")).toBeNull();
  });

  it("日本語を含む有効な正規表現はnullを返す", () => {
    expect(validateNgWordLine("/日本語/")).toBeNull();
  });

  it("構文エラーの正規表現はエラーメッセージを返す", () => {
    const result = validateNgWordLine("/[/");
    expect(result).not.toBeNull();
    expect(result).toContain("/[/");
  });

  it("iフラグを含む行でも例外が発生せず有効と判定される", () => {
    expect(() => validateNgWordLine("/foo/i")).not.toThrow();
    expect(validateNgWordLine("/foo/i")).toBeNull();
  });

  it("iフラグと他のフラグを併用しても有効と判定される", () => {
    expect(() => validateNgWordLine("/foo/gi")).not.toThrow();
    expect(validateNgWordLine("/foo/gi")).toBeNull();
  });
});

describe("validateNgWordLines", () => {
  it("すべての行が有効な場合はnullを返す", () => {
    expect(validateNgWordLines(["spam", "/foo|bar/", "/baz/i"])).toBeNull();
  });

  it("1つでも不正な行があればエラーメッセージを返す", () => {
    const result = validateNgWordLines(["spam", "/[/", "/baz/i"]);
    expect(result).not.toBeNull();
    expect(result).toContain("/[/");
  });

  it("空配列の場合はnullを返す", () => {
    expect(validateNgWordLines([])).toBeNull();
  });

  it("空行を含んでいても不正扱いしない", () => {
    expect(validateNgWordLines(["", "spam", ""])).toBeNull();
  });
});
