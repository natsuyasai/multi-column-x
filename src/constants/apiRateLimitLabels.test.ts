import { describe, it, expect } from "vitest";
import {
  getApiRateLimitDescription,
  getApiRateLimitLabel,
  isColumnRelatedApiBucket,
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

describe("isColumnRelatedApiBucket", () => {
  it.each([
    "HomeTimeline",
    "HomeLatestTimeline",
    "SearchTimeline",
    "NotificationsTimeline",
  ])("カラム関連のbucketKey(%s)を渡すとtrueを返す", (bucketKey) => {
    expect(isColumnRelatedApiBucket(bucketKey)).toBe(true);
  });

  it("カラム非関連のbucketKeyを渡すとfalseを返す", () => {
    expect(isColumnRelatedApiBucket("UserTweets")).toBe(false);
  });

  it("辞書に存在しない未知のbucketKeyを渡すとfalseを返す", () => {
    expect(isColumnRelatedApiBucket("UnknownOperationXYZ")).toBe(false);
  });
});
