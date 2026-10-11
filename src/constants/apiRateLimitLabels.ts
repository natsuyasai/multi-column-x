// APIレート制限モニターが表示するbucketKey（GraphQLのOperationNameやv1.1パス）と
// 辞書（rateLimit 名前空間）のラベル・説明文の対応表。
// 説明文の出典: X公式 https://docs.x.com/x-api/fundamentals/rate-limits 、
// 非公式リバースエンジニアリングドキュメント apidance.pro (https://doc.apidance.pro/)、
// trevorhobenshield/twitter-api-client (https://github.com/trevorhobenshield/twitter-api-client) 等。
import type { AppTFunction } from "@/i18n/types";

// 辞書（rateLimit 名前空間）の buckets.<id> に対応する識別子。
// bucketKey は "/" や "." を含み辞書キーに使えないため、camelCase の識別子へ対応づける。
const API_RATE_LIMIT_BUCKET_IDS = {
  // 実測済みのoperationName
  UserTweets: "userTweets",
  UserByScreenName: "userByScreenName",
  ProfileSpotlightsQuery: "profileSpotlightsQuery",
  isEligibleForVoButtonUpsellQuery: "voButtonEligibility",
  "flow/viewer.json": "flowViewer",
  "graphql/viewer_context.json": "viewerContext",
  // 一般的に知られる主要operationName（フォールバック用の代表例、完全網羅は不要）
  HomeTimeline: "homeTimeline",
  HomeLatestTimeline: "homeLatestTimeline",
  SearchTimeline: "searchTimeline",
  Followers: "followers",
  Following: "following",
  Likes: "likes",
  CreateTweet: "createTweet",
  DeleteTweet: "deleteTweet",
  NotificationsTimeline: "notificationsTimeline",
} as const;

type ApiRateLimitBucketId =
  (typeof API_RATE_LIMIT_BUCKET_IDS)[keyof typeof API_RATE_LIMIT_BUCKET_IDS];

function findBucketId(bucketKey: string): ApiRateLimitBucketId | undefined {
  return Object.prototype.hasOwnProperty.call(
    API_RATE_LIMIT_BUCKET_IDS,
    bucketKey,
  )
    ? API_RATE_LIMIT_BUCKET_IDS[
        bucketKey as keyof typeof API_RATE_LIMIT_BUCKET_IDS
      ]
    : undefined;
}

/** 辞書に登録されている bucketKey を定義順で返す（辞書との整合性検査用） */
export function getKnownApiRateLimitBucketKeys(): string[] {
  return Object.keys(API_RATE_LIMIT_BUCKET_IDS);
}

/**
 * bucketKey（GraphQLのOperationNameやv1.1パス）を表示言語のラベルに変換する。
 * 辞書に無い場合はbucketKeyをそのままフォールバック表示する
 * （X側の内部API仕様変更に強くするため、完全網羅を目指さない）。
 */
export function getApiRateLimitLabel(
  bucketKey: string,
  t: AppTFunction,
): string {
  const id = findBucketId(bucketKey);
  return id ? t(`rateLimit:buckets.${id}.label`) : bucketKey;
}

/**
 * bucketKey（GraphQLのOperationNameやv1.1パス）の説明文を返す。
 * 辞書に無い場合はundefinedを返す。
 */
export function getApiRateLimitDescription(
  bucketKey: string,
  t: AppTFunction,
): string | undefined {
  const id = findBucketId(bucketKey);
  return id ? t(`rateLimit:buckets.${id}.description`) : undefined;
}

// カラムとして追加できる項目（PageType）が実際に使用するoperationName。
// home→HomeTimeline/HomeLatestTimeline、notifications→NotificationsTimeline、
// search→SearchTimeline、compose（投稿カラム）→CreateTweet。
// list/custom/externalに対応する既知のoperationNameは無い。
const COLUMN_RELATED_BUCKET_KEYS: ReadonlySet<string> = new Set([
  "HomeTimeline",
  "HomeLatestTimeline",
  "SearchTimeline",
  "NotificationsTimeline",
  "CreateTweet",
]);

/**
 * bucketKeyがカラム追加可能な項目（PageType）に対応するAPIかどうかを判定する。
 * 辞書に無い未知のbucketKeyもfalseになる。
 */
export function isColumnRelatedApiBucket(bucketKey: string): boolean {
  return COLUMN_RELATED_BUCKET_KEYS.has(bucketKey);
}

/**
 * カラム追加可能な項目に対応するbucketKeyを定義順（表示順）で返す。
 */
export function getColumnRelatedBucketKeys(): string[] {
  return Array.from(COLUMN_RELATED_BUCKET_KEYS);
}
