// image_popup.ts は IIFE のため、import 時に document へ capture phase の click リスナーが
// 登録される。設定ゲートとメディア分類はクリック時に毎回読まれるため、import は一度だけ行い、
// テスト毎に window.__multiColumnXConfig と DOM を差し替えて振る舞いを検証する。
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import {
  classifyMediaHref,
  isMediaLink,
  buildVideoUrl,
  buildIStatusVideoUrl,
  findStatusPermalink,
  findMediaIndex,
} from "./image_popup";

const invokeMock = vi.fn((_cmd: string, _args?: Record<string, unknown>) =>
  Promise.resolve<unknown>(undefined),
);

const WEBVIEW_LABEL = "col-1";

function setConfig(config: Partial<MultiColumnXConfig>): void {
  window.__multiColumnXConfig = config as MultiColumnXConfig;
}

function click(element: Element): MouseEvent {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true });
  element.dispatchEvent(event);
  return event;
}

/** timestamp リンク（time 子要素を持つ a）を備えた article を生成する。 */
function buildArticle(statusHref: string): HTMLElement {
  const article = document.createElement("article");
  const timeLink = document.createElement("a");
  timeLink.setAttribute("href", statusHref);
  timeLink.appendChild(document.createElement("time"));
  article.appendChild(timeLink);
  document.body.appendChild(article);
  return article;
}

/** article に tweetPhoto を追加し、playButton 付きなら再生ボタンを内包させる。 */
function addTweetPhoto(
  article: HTMLElement,
  withPlayButton: boolean,
): HTMLElement {
  const photo = document.createElement("div");
  photo.dataset.testid = "tweetPhoto";
  if (withPlayButton) {
    const button = document.createElement("button");
    button.dataset.testid = "playButton";
    photo.appendChild(button);
  }
  article.appendChild(photo);
  return photo;
}

/** メディアリンク（<a>）を持つ単純なツイート風 DOM を生成する。 */
function buildMediaLink(href: string, navlink = false): HTMLAnchorElement {
  const link = document.createElement("a");
  link.setAttribute("href", href);
  if (navlink) link.setAttribute("data-tv-navlink", "");
  const inner = document.createElement("span");
  inner.textContent = "media";
  link.appendChild(inner);
  document.body.appendChild(link);
  return link;
}

describe("inject/image_popup の純粋関数", () => {
  describe("classifyMediaHref", () => {
    it("photo URL は image に分類される", () => {
      expect(classifyMediaHref("/alice/status/123/photo/1")).toBe("image");
    });

    it("/i/status/ 形式は image に分類される", () => {
      expect(classifyMediaHref("/i/status/456")).toBe("image");
    });

    it("video URL は video に分類される", () => {
      expect(classifyMediaHref("/bob/status/789/video/1")).toBe("video");
    });

    it("メディアでない href は null になる", () => {
      expect(classifyMediaHref("/alice/status/123")).toBeNull();
      expect(classifyMediaHref("/home")).toBeNull();
    });

    it("video URL は image と排他的に video のみへ分類される", () => {
      const result = classifyMediaHref("/bob/status/789/video/2");
      expect(result).toBe("video");
      expect(result).not.toBe("image");
    });
  });

  describe("isMediaLink", () => {
    it("メディアリンクでは true を返す", () => {
      expect(isMediaLink("/alice/status/123/photo/1")).toBe(true);
      expect(isMediaLink("/bob/status/789/video/1")).toBe(true);
      expect(isMediaLink("/i/status/456")).toBe(true);
    });

    it("非メディアリンクでは false を返す", () => {
      expect(isMediaLink("/alice/status/123")).toBe(false);
      expect(isMediaLink("/explore")).toBe(false);
    });
  });

  describe("buildVideoUrl", () => {
    it("相対 permalink から /video/<index> の絶対 URL を組み立てる", () => {
      expect(buildVideoUrl("/alice/status/123", 1)).toBe(
        "https://x.com/alice/status/123/video/1",
      );
    });

    it("末尾に余分なセグメントがあっても status id までを使う", () => {
      expect(buildVideoUrl("/alice/status/123/photo/1", 2)).toBe(
        "https://x.com/alice/status/123/video/2",
      );
    });

    it("http 始まりの絶対 URL はそのまま使う", () => {
      expect(buildVideoUrl("https://x.com/alice/status/123", 3)).toBe(
        "https://x.com/alice/status/123/video/3",
      );
    });
  });

  describe("buildIStatusVideoUrl", () => {
    it("status id から /i/status/<id>/video/<index> の絶対 URL を組み立てる", () => {
      expect(buildIStatusVideoUrl("2069216779545751868", 1)).toBe(
        "https://x.com/i/status/2069216779545751868/video/1",
      );
    });

    it("index を反映する", () => {
      expect(buildIStatusVideoUrl("123", 2)).toBe(
        "https://x.com/i/status/123/video/2",
      );
    });
  });

  describe("findStatusPermalink", () => {
    it("time 子要素を持つ status リンクの href を返す", () => {
      const article = buildArticle("/alice/status/123");
      expect(findStatusPermalink(article)).toBe("/alice/status/123");
    });

    it("time を持たない status リンクしかなければ null を返す", () => {
      const article = document.createElement("article");
      const link = document.createElement("a");
      link.setAttribute("href", "/alice/status/123");
      article.appendChild(link);
      expect(findStatusPermalink(article)).toBeNull();
    });
  });

  describe("findMediaIndex", () => {
    it("article 内の tweetPhoto 群における 1-based インデックスを返す", () => {
      const article = buildArticle("/alice/status/123");
      addTweetPhoto(article, true);
      const second = addTweetPhoto(article, true);
      const button = second.querySelector("button")!;
      expect(findMediaIndex(button)).toBe(2);
    });

    it("tweetPhoto に内包されていなければ 1 を返す", () => {
      const orphan = document.createElement("button");
      document.body.appendChild(orphan);
      expect(findMediaIndex(orphan)).toBe(1);
    });
  });
});

/**
 * 引用RT 風 DOM を生成する。外側ツイートの timestamp リンクを持つ article の中に、
 * 引用ツイートコンテナ（div[role="link"][tabindex="0"]）→ tweetPhoto → playButton を配置する。
 * quotedTweetId を渡すと引用コンテナに疑似 React fiber を付与し、最寄りの tweet.id_str として返す。
 */
function buildQuotedTweetWithVideo(
  outerStatusHref: string,
  quotedTweetId: string | null,
): HTMLButtonElement {
  const article = buildArticle(outerStatusHref);
  const quoted = document.createElement("div");
  quoted.setAttribute("role", "link");
  quoted.setAttribute("tabindex", "0");
  const photo = document.createElement("div");
  photo.dataset.testid = "tweetPhoto";
  const button = document.createElement("button");
  button.dataset.testid = "playButton";
  photo.appendChild(button);
  quoted.appendChild(photo);
  article.appendChild(quoted);
  if (quotedTweetId !== null) {
    (quoted as unknown as Record<string, unknown>)["__reactFiber$test"] = {
      memoizedProps: { tweet: { id_str: quotedTweetId } },
      return: null,
    };
  }
  return button;
}

describe("inject/image_popup のクリック傍受", () => {
  beforeAll(async () => {
    window.__TAURI__ = { core: { invoke: invokeMock } };
    window.__TAURI_INTERNALS__ = {
      metadata: { currentWebview: { label: WEBVIEW_LABEL } },
    };
    await import("./image_popup");
  });

  beforeEach(() => {
    invokeMock.mockClear();
    document.body.innerHTML = "";
    setConfig({ imagePopupEnabled: true, videoPopupEnabled: true });
  });

  it("画像リンククリックは imagePopupEnabled=true で photo URL の open_popup_window を呼ぶ", () => {
    const link = buildMediaLink("/alice/status/123/photo/1");

    click(link.firstElementChild!);

    expect(invokeMock).toHaveBeenCalledWith("open_popup_window", {
      webviewLabelCaller: WEBVIEW_LABEL,
      url: "https://x.com/alice/status/123/photo/1",
    });
  });

  it("画像リンククリックは imagePopupEnabled=false では呼ばれない", () => {
    setConfig({ imagePopupEnabled: false, videoPopupEnabled: true });
    const link = buildMediaLink("/alice/status/123/photo/1");

    click(link.firstElementChild!);

    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("動画リンククリックは videoPopupEnabled=true で video URL の open_popup_window を呼ぶ", () => {
    const link = buildMediaLink("/bob/status/789/video/1");

    click(link.firstElementChild!);

    expect(invokeMock).toHaveBeenCalledWith("open_popup_window", {
      webviewLabelCaller: WEBVIEW_LABEL,
      url: "https://x.com/bob/status/789/video/1",
    });
  });

  it("動画リンククリックは videoPopupEnabled=false では呼ばれない", () => {
    setConfig({ imagePopupEnabled: true, videoPopupEnabled: false });
    const link = buildMediaLink("/bob/status/789/video/1");

    click(link.firstElementChild!);

    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("フラグが undefined のときは既定で有効扱いとなり呼ばれる", () => {
    setConfig({});
    const link = buildMediaLink("/alice/status/123/photo/1");

    click(link.firstElementChild!);

    expect(invokeMock).toHaveBeenCalledWith("open_popup_window", {
      webviewLabelCaller: WEBVIEW_LABEL,
      url: "https://x.com/alice/status/123/photo/1",
    });
  });

  it("data-tv-navlink 付きリンクは無視される", () => {
    const link = buildMediaLink("/alice/status/123/photo/1", true);

    click(link.firstElementChild!);

    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("playButton クリックは videoPopupEnabled=true で /video/<idx> の open_popup_window を呼ぶ", () => {
    const article = buildArticle("/carol/status/555");
    addTweetPhoto(article, true);
    const second = addTweetPhoto(article, true);
    const button = second.querySelector("button")!;

    const event = click(button);

    expect(invokeMock).toHaveBeenCalledWith("open_popup_window", {
      webviewLabelCaller: WEBVIEW_LABEL,
      url: "https://x.com/carol/status/555/video/2",
    });
    expect(event.defaultPrevented).toBe(true);
  });

  it("playButton クリックは videoPopupEnabled=false では傍受せずフォールバックする", () => {
    setConfig({ imagePopupEnabled: true, videoPopupEnabled: false });
    const article = buildArticle("/carol/status/555");
    const photo = addTweetPhoto(article, true);
    const button = photo.querySelector("button")!;

    const event = click(button);

    expect(invokeMock).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("引用ツイート内の playButton は fiber の tweet.id_str から /i/status/<id>/video/1 を開く", () => {
    const button = buildQuotedTweetWithVideo(
      "/sankims/status/2070347996856996068",
      "2069216779545751868",
    );

    const event = click(button);

    expect(invokeMock).toHaveBeenCalledWith("open_popup_window", {
      webviewLabelCaller: WEBVIEW_LABEL,
      url: "https://x.com/i/status/2069216779545751868/video/1",
    });
    expect(event.defaultPrevented).toBe(true);
  });

  it("引用ツイート内の playButton は ID を取得できなければ傍受せずインライン再生にフォールバックする", () => {
    const button = buildQuotedTweetWithVideo(
      "/sankims/status/2070347996856996068",
      null,
    );

    const event = click(button);

    expect(invokeMock).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("playButton は単一 tweetPhoto なら /video/1 を組み立てる", () => {
    const article = buildArticle("/carol/status/555");
    const photo = addTweetPhoto(article, true);
    const button = photo.querySelector("button")!;

    click(button);

    expect(invokeMock).toHaveBeenCalledWith("open_popup_window", {
      webviewLabelCaller: WEBVIEW_LABEL,
      url: "https://x.com/carol/status/555/video/1",
    });
  });
});
