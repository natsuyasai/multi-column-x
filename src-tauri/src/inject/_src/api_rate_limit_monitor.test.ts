// api_rate_limit_monitor.ts の純粋関数の単体テスト
import { describe, it, expect } from "vitest";
import {
  extractBucketKey,
  parseRateLimitHeaders,
} from "./api_rate_limit_monitor";

describe("inject/api_rate_limit_monitor の純粋関数", () => {
  describe("extractBucketKey", () => {
    it("graphqlのURLから末尾のOperationNameを抽出できる", () => {
      expect(
        extractBucketKey(
          "https://x.com/i/api/graphql/T1x2zehUOKCWNpKwZCpnbg/UserTweets",
        ),
      ).toBe("UserTweets");
    });

    it("v1.1形式のURLから末尾2セグメントを抽出できる", () => {
      expect(extractBucketKey("https://x.com/i/api/1.1/flow/viewer.json")).toBe(
        "flow/viewer.json",
      );
    });

    it("不正なURLはnullを返す", () => {
      // "not a url" のような文字列はbase指定時にはrelative pathとして
      // 解決できてしまうため、base指定があってもURLとして解決不能な
      // 文字列（無効なホスト表記）を用いる。
      expect(extractBucketKey("http://%")).toBeNull();
    });

    it("パスが空のURLはnullを返す", () => {
      expect(extractBucketKey("https://x.com")).toBeNull();
      expect(extractBucketKey("https://x.com/")).toBeNull();
    });

    it("graphqlセグメントが末尾に近くてもOperationNameを抽出できる", () => {
      expect(
        extractBucketKey(
          "https://x.com/i/api/graphql/abcDEF123/HomeTimeline?foo=bar",
        ),
      ).toBe("HomeTimeline");
    });

    it("root-relativeパスのgraphql形式でもbaseを指定すればOperationNameを抽出できる", () => {
      expect(
        extractBucketKey(
          "/i/api/graphql/T1x2zehUOKCWNpKwZCpnbg/UserTweets",
          "https://x.com/home",
        ),
      ).toBe("UserTweets");
    });

    it("root-relativeパスのv1.1形式でもbaseを指定すれば末尾2セグメントを抽出できる", () => {
      expect(
        extractBucketKey("/i/api/1.1/flow/viewer.json", "https://x.com/home"),
      ).toBe("flow/viewer.json");
    });
  });

  describe("parseRateLimitHeaders", () => {
    it("3つのヘッダが揃っている場合に正しい数値を返す", () => {
      const headersRaw =
        "content-type: application/json\r\n" +
        "x-rate-limit-limit: 500\r\n" +
        "x-rate-limit-remaining: 499\r\n" +
        "x-rate-limit-reset: 1700000000\r\n";
      expect(parseRateLimitHeaders(headersRaw)).toEqual({
        limit: 500,
        remaining: 499,
        reset: 1700000000,
      });
    });

    it("大文字小文字が混在していても抽出できる", () => {
      const headersRaw =
        "X-Rate-Limit-Limit: 150\r\n" +
        "X-Rate-Limit-Remaining: 149\r\n" +
        "X-Rate-Limit-Reset: 1700000100\r\n";
      expect(parseRateLimitHeaders(headersRaw)).toEqual({
        limit: 150,
        remaining: 149,
        reset: 1700000100,
      });
    });

    it("レート制限ヘッダが含まれない場合はnullを返す", () => {
      const headersRaw = "content-type: application/json\r\n";
      expect(parseRateLimitHeaders(headersRaw)).toBeNull();
    });

    it("一部のヘッダのみ含まれる場合はnullを返す", () => {
      const headersRaw =
        "x-rate-limit-limit: 500\r\nx-rate-limit-remaining: 499\r\n";
      expect(parseRateLimitHeaders(headersRaw)).toBeNull();
    });

    it("数値に変換できない値の場合はnullを返す", () => {
      const headersRaw =
        "x-rate-limit-limit: abc\r\n" +
        "x-rate-limit-remaining: 499\r\n" +
        "x-rate-limit-reset: 1700000000\r\n";
      expect(parseRateLimitHeaders(headersRaw)).toBeNull();
    });

    it("空文字列の場合はnullを返す", () => {
      expect(parseRateLimitHeaders("")).toBeNull();
    });
  });
});
