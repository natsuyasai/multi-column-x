// src-tauri/src/inject/_src/video_variants.test.ts
import { describe, it, expect } from "vitest";
import { extractVideoVariants, suggestVideoFileName } from "./video_variants";

/** 要素に疑似 React fiber（__reactFiber$test）を直接セットする。 */
function attachFiber(el: Element, memoizedProps: unknown): void {
  (el as unknown as Record<string, unknown>)["__reactFiber$test"] = {
    memoizedProps,
    return: null,
  };
}

/**
 * 要素に疑似 React fiber チェーンをセットする。propsChain は起点(自身)から祖先方向への
 * memoizedProps の配列。extractQuotedTweetId 同様、直接の要素に tweet を含む fiber が無く
 * return を複数段遡って見つかるケースを再現するために使う。
 */
function attachFiberChain(el: Element, propsChain: unknown[]): void {
  let node: { memoizedProps: unknown; return: unknown } | null = null;
  for (let i = propsChain.length - 1; i >= 0; i--) {
    node = { memoizedProps: propsChain[i], return: node };
  }
  (el as unknown as Record<string, unknown>)["__reactFiber$test"] = node;
}

const VIDEO_MEDIA = {
  type: "video",
  video_info: {
    aspect_ratio: [16, 9],
    duration_millis: 15706,
    variants: [
      {
        content_type: "application/x-mpegURL",
        url: "https://video.twimg.com/amplify_video/1/pl/xxx.m3u8?tag=29",
      },
      {
        bitrate: 256000,
        content_type: "video/mp4",
        url: "https://video.twimg.com/amplify_video/1/vid/avc1/480x270/xxx.mp4?tag=29",
      },
      {
        bitrate: 832000,
        content_type: "video/mp4",
        url: "https://video.twimg.com/amplify_video/1/vid/avc1/640x360/xxx.mp4?tag=29",
      },
      {
        bitrate: 2176000,
        content_type: "video/mp4",
        url: "https://video.twimg.com/amplify_video/1/vid/avc1/1280x720/xxx.mp4?tag=29",
      },
    ],
  },
};

const GIF_MEDIA = {
  type: "animated_gif",
  video_info: {
    aspect_ratio: [1, 1],
    variants: [
      {
        content_type: "video/mp4",
        url: "https://video.twimg.com/tweet_video/xxx.mp4",
      },
    ],
  },
};

const PHOTO_MEDIA = { type: "photo" };

function buildTweet(media: unknown[], overrides: Record<string, unknown> = {}) {
  return {
    id_str: "2069216779545751868",
    user: { screen_name: "alice" },
    extended_entities: { media },
    ...overrides,
  };
}

describe("extractVideoVariants", () => {
  it("video 1件のみのツイートでvariants一覧を取得できる", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    attachFiber(el, { tweet: buildTweet([VIDEO_MEDIA]) });

    const result = extractVideoVariants(el);

    expect(result).toEqual([
      {
        contentType: "application/x-mpegURL",
        url: "https://video.twimg.com/amplify_video/1/pl/xxx.m3u8?tag=29",
      },
      {
        contentType: "video/mp4",
        bitrate: 256000,
        url: "https://video.twimg.com/amplify_video/1/vid/avc1/480x270/xxx.mp4?tag=29",
      },
      {
        contentType: "video/mp4",
        bitrate: 832000,
        url: "https://video.twimg.com/amplify_video/1/vid/avc1/640x360/xxx.mp4?tag=29",
      },
      {
        contentType: "video/mp4",
        bitrate: 2176000,
        url: "https://video.twimg.com/amplify_video/1/vid/avc1/1280x720/xxx.mp4?tag=29",
      },
    ]);
  });

  it("photo+video混在で、video側のみvariantsが取れる", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    attachFiber(el, { tweet: buildTweet([PHOTO_MEDIA, VIDEO_MEDIA]) });

    const result = extractVideoVariants(el);

    expect(result).not.toBeNull();
    expect(result).toHaveLength(4);
    expect(result?.[0].contentType).toBe("application/x-mpegURL");
  });

  it("animated_gifでもvariantsが取れる", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    attachFiber(el, { tweet: buildTweet([GIF_MEDIA]) });

    const result = extractVideoVariants(el);

    expect(result).toEqual([
      {
        contentType: "video/mp4",
        url: "https://video.twimg.com/tweet_video/xxx.mp4",
      },
    ]);
  });

  it("mediaIndex省略時は最初の動画/GIFを返す", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    attachFiber(el, { tweet: buildTweet([VIDEO_MEDIA, GIF_MEDIA]) });

    const result = extractVideoVariants(el);

    expect(result).toHaveLength(4); // VIDEO_MEDIA 側
  });

  it("mediaIndex指定時は対応する動画/GIFを返す（動画だけ数えた2番目）", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    // photo, video(1番目の動画), photo, animated_gif(2番目の動画)
    attachFiber(el, {
      tweet: buildTweet([PHOTO_MEDIA, VIDEO_MEDIA, PHOTO_MEDIA, GIF_MEDIA]),
    });

    const result = extractVideoVariants(el, 2);

    expect(result).toEqual([
      {
        contentType: "video/mp4",
        url: "https://video.twimg.com/tweet_video/xxx.mp4",
      },
    ]);
  });

  it("tweetが見つからない（Fiberが無い等）場合はnull", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);

    expect(extractVideoVariants(el)).toBeNull();
  });

  it("動画/GIFメディアが無い（photoのみ）場合はnull", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    attachFiber(el, { tweet: buildTweet([PHOTO_MEDIA]) });

    expect(extractVideoVariants(el)).toBeNull();
  });

  it("mediaIndexが範囲外の場合はnull", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    attachFiber(el, { tweet: buildTweet([VIDEO_MEDIA]) });

    expect(extractVideoVariants(el, 2)).toBeNull();
  });

  it("React Fiberの return チェーンを複数段遡って見つかる", () => {
    const leaf = document.createElement("button");
    document.body.appendChild(leaf);
    attachFiberChain(leaf, [
      { tweet: undefined },
      { tweet: undefined },
      { tweet: buildTweet([VIDEO_MEDIA]) },
    ]);

    const result = extractVideoVariants(leaf);

    expect(result).toHaveLength(4);
  });
});

describe("suggestVideoFileName", () => {
  it("screen_nameとid_strから期待通りの文字列を組み立てる", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    attachFiber(el, { tweet: buildTweet([VIDEO_MEDIA]) });

    expect(suggestVideoFileName(el)).toBe("alice_2069216779545751868");
  });

  it("tweetが見つからない場合はnull", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);

    expect(suggestVideoFileName(el)).toBeNull();
  });

  it("screen_nameが取れない場合はid_strのみを返す", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    attachFiber(el, {
      tweet: {
        id_str: "123456789",
        extended_entities: { media: [VIDEO_MEDIA] },
      },
    });

    expect(suggestVideoFileName(el)).toBe("123456789");
  });

  it("React Fiberの return チェーンを複数段遡って見つかる", () => {
    const leaf = document.createElement("button");
    document.body.appendChild(leaf);
    attachFiberChain(leaf, [
      { tweet: undefined },
      { tweet: undefined },
      { tweet: buildTweet([VIDEO_MEDIA]) },
    ]);

    expect(suggestVideoFileName(leaf)).toBe("alice_2069216779545751868");
  });
});
