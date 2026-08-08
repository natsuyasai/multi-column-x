import { describe, it, expect } from "vitest";
import { matchesNgWord } from "./ng_word_matcher";

describe("inject/ng_word_matcher", () => {
  it("通常の文字列は大小文字を無視して部分一致する", () => {
    expect(matchesNgWord("THIS IS SPAM", "spam")).toBe(true);
    expect(matchesNgWord("this is spam", "SPAM")).toBe(true);
    expect(matchesNgWord("normal tweet", "spam")).toBe(false);
  });

  it("正規表現形式のNGワードが意図通りマッチする", () => {
    expect(matchesNgWord("this contains spam", "/spam|ad/")).toBe(true);
    expect(matchesNgWord("this contains an ad", "/spam|ad/")).toBe(true);
    expect(matchesNgWord("nothing here", "/spam|ad/")).toBe(false);
  });

  it("正規表現形式はflagsを指定しなくても大小文字を無視してマッチする", () => {
    expect(matchesNgWord("THIS IS SPAM", "/spam/")).toBe(true);
  });

  it("正規表現形式でflagsにiを含む場合も例外にならず動作する", () => {
    expect(() => matchesNgWord("THIS IS SPAM", "/spam/i")).not.toThrow();
    expect(matchesNgWord("THIS IS SPAM", "/spam/i")).toBe(true);
    expect(matchesNgWord("normal tweet", "/spam/i")).toBe(false);
  });

  it("正規表現形式で日本語パターンも動作する", () => {
    expect(matchesNgWord("これは広告ツイートです", "/広告|宣伝/")).toBe(true);
    expect(matchesNgWord("これは普通のツイートです", "/広告|宣伝/")).toBe(
      false,
    );
  });

  it("構文エラーの正規表現はリテラル文字列としてフォールバックし例外を投げない", () => {
    expect(() => matchesNgWord("text with /[/ in it", "/[/")).not.toThrow();
    expect(matchesNgWord("text with /[/ in it", "/[/")).toBe(true);
    expect(matchesNgWord("no match here", "/[/")).toBe(false);
  });
});
