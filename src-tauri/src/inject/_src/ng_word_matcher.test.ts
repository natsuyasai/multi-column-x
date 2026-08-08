import { describe, it, expect } from "vitest";
import { matchesNgWord, shouldHideTweetText } from "./ng_word_matcher";

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

describe("inject/ng_word_matcher shouldHideTweetText", () => {
  it("NGワード・ホワイトリストどちらも指定なしなら非表示にしない", () => {
    expect(shouldHideTweetText("normal tweet", [], false, [])).toBe(false);
  });

  it("NGワードに一致すればホワイトリスト無効でも非表示にする", () => {
    expect(shouldHideTweetText("this is spam", ["spam"], false, [])).toBe(true);
  });

  it("NGワードに一致すればホワイトリスト有効でも非表示にする", () => {
    expect(shouldHideTweetText("this is spam", ["spam"], true, ["spam"])).toBe(
      true,
    );
  });

  it("ホワイトリスト有効・ワード指定あり・一致するテキストはNGワード一致がなければ非表示にしない", () => {
    expect(shouldHideTweetText("hello world", [], true, ["hello"])).toBe(false);
  });

  it("ホワイトリスト有効・ワード指定あり・一致しないテキストは非表示にする", () => {
    expect(shouldHideTweetText("goodbye world", [], true, ["hello"])).toBe(
      true,
    );
  });

  it("ホワイトリスト有効だがwhitelistWordsが空配列ならNGワード一致がなければ非表示にしない", () => {
    expect(shouldHideTweetText("hello world", [], true, [])).toBe(false);
  });

  it("whitelistEnabledがfalseの場合はwhitelistWordsに何が入っていても無視される", () => {
    expect(shouldHideTweetText("goodbye world", [], false, ["hello"])).toBe(
      false,
    );
  });

  it("NGワードに一致しホワイトリストにも一致する場合はNG優先で非表示にする", () => {
    expect(
      shouldHideTweetText("hello spam world", ["spam"], true, ["hello"]),
    ).toBe(true);
  });

  it("正規表現形式のNGワードでも非表示判定が動作する", () => {
    expect(
      shouldHideTweetText("this contains an ad", ["/spam|ad/"], false, []),
    ).toBe(true);
  });

  it("正規表現形式のホワイトリストワードでも判定が動作する", () => {
    expect(
      shouldHideTweetText("これは広告ツイートです", [], true, ["/広告|宣伝/"]),
    ).toBe(false);
    expect(
      shouldHideTweetText("これは普通のツイートです", [], true, [
        "/広告|宣伝/",
      ]),
    ).toBe(true);
  });
});
