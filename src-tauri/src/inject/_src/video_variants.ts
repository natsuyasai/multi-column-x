// src-tauri/src/inject/_src/video_variants.ts
//
// React Fiber を辿り、ツイートDOM要素から動画/GIFメディアの video_info.variants を
// 抽出する共通の純粋関数群。デスクトップの動画ポップアップツールバー（popup_toolbar.ts）と
// Androidの動画長押しメニュー（video_long_press_menu.ts）の両方から使われる想定。
//
// image_popup.ts と同じ React Fiber 解析パターンを使うが、image_popup.ts はデスクトップのみ
// ビルドされる別エントリのため依存させず、getReactFiber / ReactFiberNode をこのファイル内に
// 独立して実装する（多少の重複は許容する）。

export interface VideoVariant {
  contentType: string; // "video/mp4" | "application/x-mpegURL" など
  bitrate?: number;
  url: string;
}

interface ReactFiberNode {
  memoizedProps?: { tweet?: unknown } | null;
  return?: ReactFiberNode | null;
}

function getReactFiber(el: Element): ReactFiberNode | null {
  const key = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
  return key
    ? ((el as unknown as Record<string, unknown>)[key] as ReactFiberNode)
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * 指定要素から React Fiber を遡り、id_str を持つ最寄りの tweet オブジェクトを返す。
 * extractQuotedTweetId（image_popup.ts）と同じ探索パターン（親方向へ最大50段）。
 */
function findTweet(el: Element): Record<string, unknown> | null {
  let fiber = getReactFiber(el);
  let depth = 0;
  while (fiber && depth < 50) {
    const tweet = fiber.memoizedProps?.tweet;
    if (
      isRecord(tweet) &&
      typeof tweet.id_str === "string" &&
      /^\d+$/.test(tweet.id_str)
    ) {
      return tweet;
    }
    fiber = fiber.return ?? null;
    depth++;
  }
  return null;
}

/** tweet.extended_entities.media から動画/GIFメディアのみを抽出する。 */
function getVideoLikeMedia(
  tweet: Record<string, unknown>,
): Record<string, unknown>[] {
  const extendedEntities = tweet.extended_entities;
  if (!isRecord(extendedEntities) || !Array.isArray(extendedEntities.media)) {
    return [];
  }
  return extendedEntities.media.filter(
    (item): item is Record<string, unknown> =>
      isRecord(item) && (item.type === "video" || item.type === "animated_gif"),
  );
}

/** video_info.variants を VideoVariant[] へ変換する。不正な要素は除外する。 */
function toVideoVariants(media: Record<string, unknown>): VideoVariant[] {
  const videoInfo = media.video_info;
  if (!isRecord(videoInfo) || !Array.isArray(videoInfo.variants)) {
    return [];
  }
  const variants: VideoVariant[] = [];
  for (const raw of videoInfo.variants) {
    if (!isRecord(raw)) continue;
    const { content_type: contentType, url, bitrate } = raw;
    if (typeof contentType !== "string" || typeof url !== "string") continue;
    const variant: VideoVariant = { contentType, url };
    if (typeof bitrate === "number") variant.bitrate = bitrate;
    variants.push(variant);
  }
  return variants;
}

/**
 * 指定要素からReact Fiberを遡り、最寄りの tweet オブジェクトから動画/GIFメディアの
 * variants一覧を抽出する。tweetが見つからない、または動画/GIFメディアが無ければ null。
 * mediaIndex は 1-based（省略時は最初に見つかった動画/GIFメディア）。
 * extended_entities.media 配列全体の中でのインデックスではなく、
 * type が "video" または "animated_gif" のメディアだけを数えた中でのインデックスとして扱う
 * （画像と動画が混在するツイートで「n番目の動画」を指定できるようにするため）。
 */
export function extractVideoVariants(
  el: Element,
  mediaIndex?: number,
): VideoVariant[] | null {
  const tweet = findTweet(el);
  if (!tweet) return null;

  const videoLikeMedia = getVideoLikeMedia(tweet);
  if (videoLikeMedia.length === 0) return null;

  const index = (mediaIndex ?? 1) - 1;
  const media = videoLikeMedia[index];
  if (!media) return null;

  const variants = toVideoVariants(media);
  return variants.length > 0 ? variants : null;
}

/**
 * ツイートの本文冒頭など、ファイル名の候補として使える短い文字列を提案する。
 * tweetオブジェクトから user.screen_name と id_str を使い "{screen_name}_{id_str}" 形式の
 * 文字列を組み立てる。tweetが見つからない場合は null。screen_name が取得できない場合は
 * id_str のみを返す（実際のファイル名サニタイズはRust側の video::sanitize_filename の責務）。
 */
export function suggestVideoFileName(el: Element): string | null {
  const tweet = findTweet(el);
  if (!tweet) return null;

  const idStr = tweet.id_str as string;
  const user = tweet.user;
  const screenName =
    isRecord(user) &&
    typeof user.screen_name === "string" &&
    user.screen_name.length > 0
      ? user.screen_name
      : null;

  return screenName ? `${screenName}_${idStr}` : idStr;
}
