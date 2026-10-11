// src/lib/lineListValidation.test.ts

import { describe, expect, it } from "vitest";
import i18n from "@/i18n";
import { containsJapanese } from "@/test-utils/japanese";
import {
  parseAndValidateUserIdLines,
  parseAndValidateWordLines,
} from "./lineListValidation";
import { validateUserIdLine } from "./repostHiddenUserId";

describe("parseAndValidateWordLines", () => {
  it("正しい入力なら空行と前後空白を除いた配列をvalidで返す", () => {
    const result = parseAndValidateWordLines(" spam \n\n/foo/i", i18n.t);
    expect(result).toEqual({ kind: "valid", values: ["spam", "/foo/i"] });
  });

  it("不正な正規表現があればinvalidでエラーを返す", () => {
    const result = parseAndValidateWordLines("ok\n/[[/", i18n.t);
    expect(result).toEqual({
      kind: "invalid",
      error: "正規表現が不正です: /[[/",
    });
  });

  it("空文字ならvalidで空配列を返す", () => {
    const result = parseAndValidateWordLines("", i18n.t);
    expect(result).toEqual({ kind: "valid", values: [] });
  });
});

describe("parseAndValidateUserIdLines", () => {
  it("正しい入力なら先頭の@と重複を除いた配列をvalidで返す", () => {
    const result = parseAndValidateUserIdLines("@alice\nALICE\nbob", i18n.t);
    expect(result).toEqual({ kind: "valid", values: ["alice", "bob"] });
  });

  it("不正なIDがあれば最初の不正行のエラーをinvalidで返す", () => {
    const result = parseAndValidateUserIdLines("good\nbad-id!\nx!", i18n.t);
    expect(result).toEqual({
      kind: "invalid",
      error: validateUserIdLine("bad-id!", i18n.t),
    });
  });
});

describe("行リスト検証のエラー文言の言語", () => {
  const tEn = i18n.getFixedT("en");

  it("NGワードの不正行は英語のエラーで返り、日本語を含まない", () => {
    const result = parseAndValidateWordLines("ok\n/[[/", tEn);
    expect(result).toEqual({
      kind: "invalid",
      error: "Invalid regular expression: /[[/",
    });
  });

  it("不正なユーザーIDは英語のエラーで返り、日本語を含まない", () => {
    const result = parseAndValidateUserIdLines("good\nbad-id!", tEn);
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(containsJapanese(result.error)).toBe(false);
      expect(result.error).toContain("`bad-id!`");
    }
  });
});
