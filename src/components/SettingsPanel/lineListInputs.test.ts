import { describe, expect, it } from "vitest";
import { nextLineListErrors, validateLineListInputs } from "./lineListInputs";

describe("validateLineListInputs", () => {
  it("すべて正しい入力ならvalidを返し、空行と前後空白を除いた配列を返す", () => {
    const result = validateLineListInputs({
      ngWords: " spam \n\nbot",
      repostHiddenUserIds: "user_a\n\nuser_b",
      whitelistWords: "推し\n\n限定",
    });
    expect(result).toEqual({
      kind: "valid",
      values: {
        ngWords: ["spam", "bot"],
        repostHiddenUserIds: ["user_a", "user_b"],
        whitelistWords: ["推し", "限定"],
      },
    });
  });

  it("ngWordsが不正ならngWordsのエラーを返す", () => {
    const result = validateLineListInputs({
      ngWords: "/(/",
      repostHiddenUserIds: "",
      whitelistWords: "",
    });
    expect(result).toEqual({
      kind: "invalid",
      field: "ngWords",
      error: "正規表現が不正です: /(/",
    });
  });

  it("ngWordsとwhitelistの両方が不正ならngWordsだけを返す（最初の失敗のみ）", () => {
    const result = validateLineListInputs({
      ngWords: "/(/",
      repostHiddenUserIds: "",
      whitelistWords: "/(/",
    });
    expect(result).toEqual({
      kind: "invalid",
      field: "ngWords",
      error: "正規表現が不正です: /(/",
    });
  });

  it("repostHiddenUserIdsの不正行でエラーを返す", () => {
    const result = validateLineListInputs({
      ngWords: "",
      repostHiddenUserIds: "valid_id\nbad-id!",
      whitelistWords: "",
    });
    expect(result).toEqual({
      kind: "invalid",
      field: "repostHiddenUserIds",
      error:
        "`bad-id!` はXのユーザーIDとして正しくありません（英数字とアンダースコアの1〜15文字）",
    });
  });

  it("whitelistWordsが不正ならwhitelistWordsのエラーを返す", () => {
    const result = validateLineListInputs({
      ngWords: "",
      repostHiddenUserIds: "",
      whitelistWords: "/(/",
    });
    expect(result).toEqual({
      kind: "invalid",
      field: "whitelistWords",
      error: "正規表現が不正です: /(/",
    });
  });
});

describe("nextLineListErrors", () => {
  it("validなら全フィールドがnullになる", () => {
    const prev = {
      ngWords: "prevNgError",
      repostHiddenUserIds: "prevRepostError",
      whitelistWords: "prevWhitelistError",
    };
    const result = nextLineListErrors(prev, {
      kind: "valid",
      values: { ngWords: [], repostHiddenUserIds: [], whitelistWords: [] },
    });
    expect(result).toEqual({
      ngWords: null,
      repostHiddenUserIds: null,
      whitelistWords: null,
    });
  });

  it("失敗フィールドより前のフィールドはnullになる", () => {
    const prev = {
      ngWords: "prevNgError",
      repostHiddenUserIds: "prevRepostError",
      whitelistWords: "prevWhitelistError",
    };
    const result = nextLineListErrors(prev, {
      kind: "invalid",
      field: "whitelistWords",
      error: "whitelistのエラー",
    });
    expect(result).toEqual({
      ngWords: null,
      repostHiddenUserIds: null,
      whitelistWords: "whitelistのエラー",
    });
  });

  it("失敗フィールドより後ろのフィールドはprevのまま維持される", () => {
    const prev = {
      ngWords: "prevNgError",
      repostHiddenUserIds: "prevRepostError",
      whitelistWords: "prevWhitelistError",
    };
    const result = nextLineListErrors(prev, {
      kind: "invalid",
      field: "ngWords",
      error: "ngWordsのエラー",
    });
    expect(result).toEqual({
      ngWords: "ngWordsのエラー",
      repostHiddenUserIds: "prevRepostError",
      whitelistWords: "prevWhitelistError",
    });
  });
});
