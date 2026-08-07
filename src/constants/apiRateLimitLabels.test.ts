import { describe, it, expect } from "vitest";
import {
  getApiRateLimitDescription,
  getApiRateLimitLabel,
} from "./apiRateLimitLabels";

describe("getApiRateLimitLabel", () => {
  it("辞書に存在するbucketKeyを渡すと対応する日本語ラベルを返す", () => {
    expect(getApiRateLimitLabel("UserTweets")).toBe("ユーザーのツイート取得");
  });

  it("辞書に存在しないbucketKeyを渡すとbucketKeyをそのまま返す", () => {
    expect(getApiRateLimitLabel("UnknownOperationXYZ")).toBe(
      "UnknownOperationXYZ",
    );
  });
});

describe("getApiRateLimitDescription", () => {
  it("辞書に存在するbucketKeyを渡すと対応する説明文を返す", () => {
    expect(getApiRateLimitDescription("UserTweets")).toBe(
      "指定ユーザーのツイート一覧を取得するAPI。",
    );
  });

  it("辞書に存在しないbucketKeyを渡すとundefinedを返す", () => {
    expect(getApiRateLimitDescription("UnknownOperationXYZ")).toBeUndefined();
  });
});
