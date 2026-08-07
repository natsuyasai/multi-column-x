# API レート制限モニター 開発ノート

X内部API（GraphQL / v1.1）のレスポンスヘッダから読むレート制限情報、ツールバーのポップオーバーに出す機能の記録。仕様の背景、ここにまとめる。

## 対象ファイル

- `src/constants/apiRateLimitLabels.ts` — bucketKey（operationName・v1.1パス）→日本語ラベル・説明文の対応表
- `src/components/ApiRateLimitIndicator/ApiRateLimitIndicator.tsx` — ツールバーのポップオーバー表示コンポーネント
- `src/lib/apiRateLimit.ts` — severity（warning/critical）判定ロジック

## レート制限ヘッダ3種

出典: X公式 https://docs.x.com/x-api/fundamentals/rate-limits

X内部APIのレスポンスヘッダ、以下3種を見る:

- `x-rate-limit-limit`: 現在のウィンドウで許可されるリクエスト総数
- `x-rate-limit-remaining`: ウィンドウ内で残り実行可能なリクエスト数
- `x-rate-limit-reset`: ウィンドウがリセットされるUnixタイムスタンプ

ウィンドウの長さ、通常15分。ただし一部エンドポイントは24時間、あるいは秒単位のものもある。一律とは限らぬ、注意必要。

## severity判定ロジック

判定は `src/lib/apiRateLimit.ts` の `getRateLimitSeverity` が担当。remaining/limitの比率で決まる:

- 比率 5% 未満 → `critical`（赤表示）
- 比率 20% 以下 → `warning`（黄表示）
- それ以外 → `normal`

`limit` が0以下（不正値・未取得）の場合はゼロ除算回避のため `normal` 扱い。判定不能というだけで、正常を意味するわけではない。誤読注意。

## bucketKey（operationName）一覧

出典: 非公式リバースエンジニアリングドキュメント apidance.pro（https://doc.apidance.pro/）、trevorhobenshield/twitter-api-client（https://github.com/trevorhobenshield/twitter-api-client）。X公式の完全な仕様書は無く、コミュニティ調査ベースの情報である点、留意すること。

| bucketKey                          | ラベル                     | 説明                                                                                              |
| ---------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------- |
| `UserTweets`                       | ユーザーのツイート取得     | 指定ユーザーのツイート一覧を取得するAPI                                                           |
| `UserByScreenName`                 | ユーザー情報取得           | screen_name（@ID）からユーザープロフィール（rest_id・bio・フォロワー数・認証状態等）を取得するAPI |
| `ProfileSpotlightsQuery`           | プロフィールスポットライト | 詳細不明（後述）                                                                                  |
| `isEligibleForVoButtonUpsellQuery` | VoButton表示判定           | 詳細不明（後述）                                                                                  |
| `flow/viewer.json`                 | ログインフロー             | ログイン処理シーケンス（flow）の進行状況を扱うAPI                                                 |
| `graphql/viewer_context.json`      | ビューワーコンテキスト     | ログイン中ユーザーのコンテキスト情報を取得するAPI                                                 |
| `HomeTimeline`                     | ホームタイムライン         | フォロー中ユーザーのツイートをアルゴリズム順で並べたタイムラインを取得するAPI                     |
| `HomeLatestTimeline`               | ホームタイムライン（最新） | フォロー中ユーザーのツイートを投稿日時順（最新順）で並べたタイムラインを取得するAPI               |
| `SearchTimeline`                   | 検索                       | 検索クエリに一致するツイート・ユーザー等の検索結果を取得するAPI                                   |
| `Followers`                        | フォロワー一覧             | 指定ユーザーのフォロワー一覧を取得するAPI                                                         |
| `Following`                        | フォロー中一覧             | 指定ユーザーのフォロー中一覧を取得するAPI                                                         |
| `Likes`                            | いいね一覧                 | 指定ユーザーがいいねしたツイート一覧を取得するAPI                                                 |
| `CreateTweet`                      | ツイート投稿               | 新規ツイートを投稿するAPI                                                                         |
| `DeleteTweet`                      | ツイート削除               | 既存ツイートを削除するAPI                                                                         |
| `NotificationsTimeline`            | 通知                       | 通知一覧を取得するAPI                                                                             |

## 非公開・未確認のoperationName

`ProfileSpotlightsQuery` と `isEligibleForVoButtonUpsellQuery`、X社内部API非公開仕様のため詳細不明。実測でoperationNameとレート制限ヘッダの存在は確認できるが、用途は名称からの推測に留まる。断定は避けること。

## 未知operationNameへの対応方針

未知のbucketKeyが来た場合、`getApiRateLimitLabel` はbucketKeyをそのままフォールバック表示する設計（`getApiRateLimitDescription` は `undefined` を返し、`ApiRateLimitIndicator` 側は説明文の要素自体を出さない）。X側の内部API仕様変更に強くするため、辞書の完全網羅は目指さない方針（`src/constants/apiRateLimitLabels.ts` 冒頭コメント参照）。新しいoperationNameを実測したら随時追加すればよい、必須作業ではない。
