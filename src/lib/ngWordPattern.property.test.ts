// ngWordPattern.ts の純粋関数群に対する fast-check プロパティテスト。
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  isRegexNgWord,
  validateNgWordLine,
  validateNgWordLines,
} from "./ngWordPattern";

// 正規表現として安全にコンパイルできるパターン文字列の集合。
const SAFE_PATTERNS = fc.constantFrom("a", "abc", "foo|bar", "[a-z]+", "\\d+");

// iフラグを含む組み合わせを必ず含めたフラグの集合。
const FLAGS = fc.constantFrom("", "i", "g", "gi", "ig");

describe("isRegexNgWord / validateNgWordLine プロパティ", () => {
  it("任意の文字列に対して例外を投げない", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(() => isRegexNgWord(s)).not.toThrow();
        expect(() => validateNgWordLine(s)).not.toThrow();
      }),
    );
  });

  it("スラッシュを含まない文字列は常にリテラル扱いになる（isRegexNgWordはfalse、validateNgWordLineはnull）", () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !s.includes("/")),
        (s) => {
          expect(isRegexNgWord(s)).toBe(false);
          expect(validateNgWordLine(s)).toBeNull();
        },
      ),
    );
  });

  it("iフラグの有無に関わらず、安全なパターンを組み立てた/pattern/flags形式は常に有効(null)と判定される", () => {
    fc.assert(
      fc.property(SAFE_PATTERNS, FLAGS, (pattern, flags) => {
        const line = `/${pattern}/${flags}`;
        expect(validateNgWordLine(line)).toBeNull();
      }),
    );
  });
});

describe("validateNgWordLines プロパティ", () => {
  it("validateNgWordLinesがnullを返すことと、すべての行でvalidateNgWordLineがnullであることは同値である", () => {
    fc.assert(
      fc.property(fc.array(fc.string()), (lines) => {
        const overallResult = validateNgWordLines(lines);
        const allLinesValid = lines.every(
          (line) => validateNgWordLine(line) === null,
        );
        expect(overallResult === null).toBe(allLinesValid);
      }),
    );
  });
});
