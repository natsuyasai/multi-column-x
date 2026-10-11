import { afterEach, describe, it, expect } from "vitest";
import i18n from "@/i18n";
import { containsJapanese } from "@/test-utils/japanese";
import {
  getApiRateLimitDescription,
  getApiRateLimitLabel,
  getKnownApiRateLimitBucketKeys,
  getColumnRelatedBucketKeys,
  isColumnRelatedApiBucket,
} from "./apiRateLimitLabels";

describe("getApiRateLimitLabel", () => {
  it("辞書に存在するbucketKeyを渡すと対応する日本語ラベルを返す", () => {
    expect(getApiRateLimitLabel("UserTweets", i18n.t)).toBe(
      "ユーザーのツイート取得",
    );
  });

  it("辞書に存在しないbucketKeyを渡すとbucketKeyをそのまま返す", () => {
    expect(getApiRateLimitLabel("UnknownOperationXYZ", i18n.t)).toBe(
      "UnknownOperationXYZ",
    );
  });
});

describe("getApiRateLimitDescription", () => {
  it("辞書に存在するbucketKeyを渡すと対応する説明文を返す", () => {
    expect(getApiRateLimitDescription("UserTweets", i18n.t)).toBe(
      "指定ユーザーのツイート一覧を取得するAPI。",
    );
  });

  it("辞書に存在しないbucketKeyを渡すとundefinedを返す", () => {
    expect(
      getApiRateLimitDescription("UnknownOperationXYZ", i18n.t),
    ).toBeUndefined();
  });
});

describe("isColumnRelatedApiBucket", () => {
  it.each([
    "HomeTimeline",
    "HomeLatestTimeline",
    "SearchTimeline",
    "NotificationsTimeline",
    "CreateTweet",
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

describe("getColumnRelatedBucketKeys", () => {
  it("getColumnRelatedBucketKeysはカラム関連のbucketKeyを定義順で返す", () => {
    expect(getColumnRelatedBucketKeys()).toEqual([
      "HomeTimeline",
      "HomeLatestTimeline",
      "SearchTimeline",
      "NotificationsTimeline",
      "CreateTweet",
    ]);
  });
});

describe("APIレート制限のバケット名の表示言語切り替え", () => {
  afterEach(async () => {
    await i18n.changeLanguage("ja");
  });

  it("英語表示ではバケット名と説明文が英語になる", async () => {
    await i18n.changeLanguage("en");

    expect(getApiRateLimitLabel("UserTweets", i18n.t)).toBe("User posts");
    expect(getApiRateLimitDescription("UserTweets", i18n.t)).toBe(
      "API that fetches the list of posts by a given user.",
    );
  });

  it("英語表示でも辞書に無いbucketKeyはそのまま返す", async () => {
    await i18n.changeLanguage("en");

    expect(getApiRateLimitLabel("UnknownOperationXYZ", i18n.t)).toBe(
      "UnknownOperationXYZ",
    );
  });

  it("登録済みのすべてのbucketKeyに日本語と英語の名称・説明文があり英語に日本語を含まない", async () => {
    for (const bucketKey of getKnownApiRateLimitBucketKeys()) {
      await i18n.changeLanguage("ja");
      const jaLabel = getApiRateLimitLabel(bucketKey, i18n.t);
      const jaDescription = getApiRateLimitDescription(bucketKey, i18n.t);
      expect(containsJapanese(jaLabel), bucketKey).toBe(true);
      expect(containsJapanese(jaDescription ?? ""), bucketKey).toBe(true);

      await i18n.changeLanguage("en");
      const enLabel = getApiRateLimitLabel(bucketKey, i18n.t);
      const enDescription = getApiRateLimitDescription(bucketKey, i18n.t);
      expect(enLabel, bucketKey).not.toBe(bucketKey);
      expect(containsJapanese(enLabel), bucketKey).toBe(false);
      expect(enDescription, bucketKey).toBeTruthy();
      expect(containsJapanese(enDescription ?? ""), bucketKey).toBe(false);
    }
  });
});
