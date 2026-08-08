// ng_word_matcher.ts の純粋関数 matchesNgWord に対する fast-check プロパティテスト。
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { matchesNgWord } from "./ng_word_matcher";

// 正規表現として安全にコンパイルできるパターン文字列の集合。
const SAFE_PATTERNS = fc.constantFrom("a", "abc", "foo|bar", "[a-z]+", "\\d+");

// iフラグを含む組み合わせを必ず含めたフラグの集合。
const FLAGS = fc.constantFrom("", "i", "g", "gi", "ig");

describe("matchesNgWord プロパティ", () => {
  it("任意のtext・wordの組に対して例外を投げない", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (text, word) => {
        expect(() => matchesNgWord(text, word)).not.toThrow();
      }),
    );
  });

  it("スラッシュを含まないwordは既存の部分一致（大小無視）と一致する", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string().filter((w) => !w.includes("/")),
        (text, word) => {
          expect(matchesNgWord(text, word)).toBe(
            text.toLowerCase().includes(word.toLowerCase()),
          );
        },
      ),
    );
  });

  it("安全なパターンとフラグを組み立てた/pattern/flags形式は、直接コンパイルした正規表現のtest結果と一致する", () => {
    fc.assert(
      fc.property(SAFE_PATTERNS, FLAGS, fc.string(), (pattern, flags, text) => {
        const rawWord = `/${pattern}/${flags}`;
        const normalizedFlags = flags.includes("i") ? flags : flags + "i";
        const expected = new RegExp(pattern, normalizedFlags).test(text);
        expect(matchesNgWord(text, rawWord)).toBe(expected);
      }),
    );
  });
});
