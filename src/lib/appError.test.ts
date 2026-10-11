import { describe, expect, it } from "vitest";
import i18n from "@/i18n";
import { describeAppError, isAppError } from "./appError";

describe("isAppError", () => {
  it("codeを持つオブジェクトをAppErrorと判定する", () => {
    expect(isAppError({ code: "x.y" })).toBe(true);
    expect(isAppError({ code: "x.y", detail: "d" })).toBe(true);
  });

  it("codeが無い・文字列でない・detailが文字列でない値は判定しない", () => {
    expect(isAppError(null)).toBe(false);
    expect(isAppError("x.y")).toBe(false);
    expect(isAppError(new Error("x"))).toBe(false);
    expect(isAppError({ code: 1 })).toBe(false);
    expect(isAppError({ code: "" })).toBe(false);
    expect(isAppError({ code: "x.y", detail: 1 })).toBe(false);
  });
});

describe("describeAppError", () => {
  const tJa = i18n.getFixedT("ja") as unknown as Parameters<
    typeof describeAppError
  >[1];
  const tEn = i18n.getFixedT("en") as unknown as Parameters<
    typeof describeAppError
  >[1];

  it("未知のコードは日本語の汎用文言になる", () => {
    expect(describeAppError({ code: "no.such" }, tJa)).toBe(
      "予期しないエラーが発生しました",
    );
  });

  it("未知のコードに詳細があれば日本語の汎用文言に付記する", () => {
    expect(describeAppError({ code: "no.such", detail: "boom" }, tJa)).toBe(
      "予期しないエラーが発生しました（boom）",
    );
  });

  it("未知のコードは英語の汎用文言になり日本語を含まない", () => {
    const text = describeAppError({ code: "no.such", detail: "boom" }, tEn);

    expect(text).toBe("An unexpected error occurred (boom)");
    expect(text).not.toMatch(/[぀-ヿ一-鿿]/);
  });

  it("英語でdetailが無ければ括弧を付けない", () => {
    expect(describeAppError({ code: "no.such" }, tEn)).toBe(
      "An unexpected error occurred",
    );
  });

  it("Errorはmessageをそのまま返す", () => {
    expect(describeAppError(new Error("plain"), tJa)).toBe("plain");
  });

  it("文字列はそのまま返す", () => {
    expect(describeAppError("from plugin", tEn)).toBe("from plugin");
  });

  it("それ以外の値は文字列化する", () => {
    expect(describeAppError(42, tEn)).toBe("42");
    expect(describeAppError(undefined, tEn)).toBe("undefined");
  });
});
