// APIレート制限モニターが表示するbucketKey（GraphQLのOperationNameやv1.1パス）と
// 日本語ラベルの対応表。
export const API_RATE_LIMIT_LABELS: Record<string, string> = {
  // 実測済みのoperationName
  UserTweets: "ユーザーのツイート取得",
  UserByScreenName: "ユーザー情報取得",
  ProfileSpotlightsQuery: "プロフィールスポットライト",
  isEligibleForVoButtonUpsellQuery: "VoButton表示判定",
  "flow/viewer.json": "ログインフロー",
  "graphql/viewer_context.json": "ビューワーコンテキスト",
  // 一般的に知られる主要operationName（フォールバック用の代表例、完全網羅は不要）
  HomeTimeline: "ホームタイムライン",
  HomeLatestTimeline: "ホームタイムライン（最新）",
  SearchTimeline: "検索",
  Followers: "フォロワー一覧",
  Following: "フォロー中一覧",
  Likes: "いいね一覧",
  CreateTweet: "ツイート投稿",
  DeleteTweet: "ツイート削除",
  NotificationsTimeline: "通知",
};

/**
 * bucketKey（GraphQLのOperationNameやv1.1パス）を日本語ラベルに変換する。
 * 辞書に無い場合はbucketKeyをそのままフォールバック表示する
 * （X側の内部API仕様変更に強くするため、完全網羅を目指さない）。
 */
export function getApiRateLimitLabel(bucketKey: string): string {
  return API_RATE_LIMIT_LABELS[bucketKey] ?? bucketKey;
}
