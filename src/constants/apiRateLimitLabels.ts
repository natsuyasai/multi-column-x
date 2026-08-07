// APIレート制限モニターが表示するbucketKey（GraphQLのOperationNameやv1.1パス）と
// 日本語ラベル・説明文の対応表。
// 説明文の出典: X公式 https://docs.x.com/x-api/fundamentals/rate-limits 、
// 非公式リバースエンジニアリングドキュメント apidance.pro (https://doc.apidance.pro/)、
// trevorhobenshield/twitter-api-client (https://github.com/trevorhobenshield/twitter-api-client) 等。
interface ApiRateLimitLabelEntry {
  label: string;
  description: string;
}

export const API_RATE_LIMIT_LABELS: Record<string, ApiRateLimitLabelEntry> = {
  // 実測済みのoperationName
  UserTweets: {
    label: "ユーザーのツイート取得",
    description: "指定ユーザーのツイート一覧を取得するAPI。",
  },
  UserByScreenName: {
    label: "ユーザー情報取得",
    description:
      "screen_name（@ID）からユーザープロフィール（rest_id・bio・フォロワー数・認証状態等）を取得するAPI。",
  },
  ProfileSpotlightsQuery: {
    label: "プロフィールスポットライト",
    description:
      "プロフィールページの補助情報を取得するAPIと推測されるが、詳細仕様は非公開で未確認。",
  },
  isEligibleForVoButtonUpsellQuery: {
    label: "VoButton表示判定",
    description:
      "特定ボタン（Vo Button）の表示可否を判定するAPIと推測されるが、詳細仕様は非公開で未確認。",
  },
  "flow/viewer.json": {
    label: "ログインフロー",
    description: "ログイン処理シーケンス（flow）の進行状況を扱うAPI。",
  },
  "graphql/viewer_context.json": {
    label: "ビューワーコンテキスト",
    description: "ログイン中ユーザーのコンテキスト情報を取得するAPI。",
  },
  // 一般的に知られる主要operationName（フォールバック用の代表例、完全網羅は不要）
  HomeTimeline: {
    label: "ホームタイムライン",
    description:
      "フォロー中ユーザーのツイートをアルゴリズム順で並べたタイムラインを取得するAPI。",
  },
  HomeLatestTimeline: {
    label: "ホームタイムライン（最新）",
    description:
      "フォロー中ユーザーのツイートを投稿日時順（最新順）で並べたタイムラインを取得するAPI。",
  },
  SearchTimeline: {
    label: "検索",
    description:
      "検索クエリに一致するツイート・ユーザー等の検索結果を取得するAPI。",
  },
  Followers: {
    label: "フォロワー一覧",
    description: "指定ユーザーのフォロワー一覧を取得するAPI。",
  },
  Following: {
    label: "フォロー中一覧",
    description: "指定ユーザーのフォロー中一覧を取得するAPI。",
  },
  Likes: {
    label: "いいね一覧",
    description: "指定ユーザーがいいねしたツイート一覧を取得するAPI。",
  },
  CreateTweet: {
    label: "ツイート投稿",
    description: "新規ツイートを投稿するAPI。",
  },
  DeleteTweet: {
    label: "ツイート削除",
    description: "既存ツイートを削除するAPI。",
  },
  NotificationsTimeline: {
    label: "通知",
    description: "通知一覧を取得するAPI。",
  },
};

/**
 * bucketKey（GraphQLのOperationNameやv1.1パス）を日本語ラベルに変換する。
 * 辞書に無い場合はbucketKeyをそのままフォールバック表示する
 * （X側の内部API仕様変更に強くするため、完全網羅を目指さない）。
 */
export function getApiRateLimitLabel(bucketKey: string): string {
  return API_RATE_LIMIT_LABELS[bucketKey]?.label ?? bucketKey;
}

/**
 * bucketKey（GraphQLのOperationNameやv1.1パス）の説明文を返す。
 * 辞書に無い場合はundefinedを返す。
 */
export function getApiRateLimitDescription(
  bucketKey: string,
): string | undefined {
  return API_RATE_LIMIT_LABELS[bucketKey]?.description;
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
