// api_rate_limit_monitor.ts の純粋関数 extractBucketKey に対する fast-check プロパティテスト。
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { extractBucketKey } from "./api_rate_limit_monitor";

const BASE = "https://x.com/home";

describe("extractBucketKey プロパティ", () => {
  it("任意の文字列を入力しても例外を投げず、必ずstring型かnullのいずれかを返す", () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = extractBucketKey(input, BASE);
        expect(result === null || typeof result === "string").toBe(true);
      }),
    );
  });

  it("GraphQL形式のURL（/i/api/graphql/<queryId>/<OperationName>）は必ずOperationNameと一致する結果を返す", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-zA-Z0-9]{1,20}$/),
        fc.stringMatching(/^[a-zA-Z0-9]{1,20}$/),
        (queryId, operationName) => {
          const url = `https://x.com/i/api/graphql/${queryId}/${operationName}`;
          expect(extractBucketKey(url, BASE)).toBe(operationName);
        },
      ),
    );
  });

  it("root-relativeなGraphQL形式のパスでもbaseを指定すればOperationNameと一致する結果を返す", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-zA-Z0-9]{1,20}$/),
        fc.stringMatching(/^[a-zA-Z0-9]{1,20}$/),
        (queryId, operationName) => {
          const url = `/i/api/graphql/${queryId}/${operationName}`;
          expect(extractBucketKey(url, BASE)).toBe(operationName);
        },
      ),
    );
  });
});
