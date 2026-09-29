// src/lib/lineListValidation.test.ts

import { describe, expect, it } from "vitest";
import {
  parseAndValidateUserIdLines,
  parseAndValidateWordLines,
} from "./lineListValidation";
import { validateUserIdLine } from "./repostHiddenUserId";

describe("parseAndValidateWordLines", () => {
  it("正しい入力なら空行と前後空白を除いた配列をvalidで返す", () => {
    const result = parseAndValidateWordLines(" spam \n\n/foo/i");
    expect(result).toEqual({ kind: "valid", values: ["spam", "/foo/i"] });
  });

  it("不正な正規表現があればinvalidでエラーを返す", () => {
    const result = parseAndValidateWordLines("ok\n/[[/");
    expect(result).toEqual({
      kind: "invalid",
      error: "正規表現が不正です: /[[/",
    });
  });

  it("空文字ならvalidで空配列を返す", () => {
    const result = parseAndValidateWordLines("");
    expect(result).toEqual({ kind: "valid", values: [] });
  });
});

describe("parseAndValidateUserIdLines", () => {
  it("正しい入力なら先頭の@と重複を除いた配列をvalidで返す", () => {
    const result = parseAndValidateUserIdLines("@alice\nALICE\nbob");
    expect(result).toEqual({ kind: "valid", values: ["alice", "bob"] });
  });

  it("不正なIDがあれば最初の不正行のエラーをinvalidで返す", () => {
    const result = parseAndValidateUserIdLines("good\nbad-id!\nx!");
    expect(result).toEqual({
      kind: "invalid",
      error: validateUserIdLine("bad-id!"),
    });
  });
});
