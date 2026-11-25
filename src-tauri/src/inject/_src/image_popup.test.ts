// image_popup.ts は IIFE のため、import 時に document へ capture phase の click リスナーが
// 登録される。設定ゲートとメディア分類はクリック時に毎回読まれるため、import は一度だけ行い、
// テスト毎に window.__multiColumnXConfig と DOM を差し替えて振る舞いを検証する。
import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
} from "vitest";
import {
  classifyMediaHref,
  isMediaLink,
  buildVideoUrl,
  buildIStatusVideoUrl,
  findStatusPermalink,
  findMediaIndex,
  isMediaPopupEnabled,
  chooseMediaPopupTransport,
  findPlayButtonForMediaTap,
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
      url: "https://x.com/carol/status/555/video/1",
    });
  });
});

describe("inject/image_popup の isMediaPopupEnabled", () => {
  const multi = { hasBridge: true, multiColumnActive: true };

  it("デスクトップでは画像・動画ポップアップ設定がどちらもONなら両方有効になる", () => {
    const config = { imagePopupEnabled: true, videoPopupEnabled: true };
    expect(isMediaPopupEnabled("image", config, multi)).toBe(true);
    expect(isMediaPopupEnabled("video", config, multi)).toBe(true);
  });

  it("デスクトップでも種別ごとの設定がOFFならその種別は無効になる", () => {
    const config = { imagePopupEnabled: false, videoPopupEnabled: true };
    expect(isMediaPopupEnabled("image", config, multi)).toBe(false);
    expect(isMediaPopupEnabled("video", config, multi)).toBe(true);
  });

  it("Androidではブリッジが無ければ設定がONでも無効になる（インライン表示へフォールバック）", () => {
    const config = {
      imagePopupEnabled: true,
      videoPopupEnabled: true,
      mediaPopupRequiresMultiColumn: true,
    };
    const noBridge = { hasBridge: false, multiColumnActive: true };
    expect(isMediaPopupEnabled("image", config, noBridge)).toBe(false);
    expect(isMediaPopupEnabled("video", config, noBridge)).toBe(false);
  });

  it.each([
    { multiColumn: false, image: true, video: true, ei: false, ev: false },
    { multiColumn: true, image: true, video: true, ei: true, ev: true },
    { multiColumn: true, image: true, video: false, ei: true, ev: false },
    { multiColumn: true, image: false, video: true, ei: false, ev: true },
    { multiColumn: true, image: false, video: false, ei: false, ev: false },
  ])(
    "Androidでは複数カラム表示=$multiColumn・画像設定=$image・動画設定=$video のとき画像=$ei・動画=$ev になる",
    ({ multiColumn, image, video, ei, ev }) => {
      const config = {
        imagePopupEnabled: image,
        videoPopupEnabled: video,
        mediaPopupRequiresMultiColumn: true,
      };
      const env = { hasBridge: true, multiColumnActive: multiColumn };
      expect(isMediaPopupEnabled("image", config, env)).toBe(ei);
      expect(isMediaPopupEnabled("video", config, env)).toBe(ev);
    },
  );

  it("Androidで複数カラム表示フラグが未設定の間は無効になる", () => {
    const config = {
      imagePopupEnabled: true,
      videoPopupEnabled: true,
      mediaPopupRequiresMultiColumn: true,
    };
    const env = { hasBridge: true, multiColumnActive: undefined };
    expect(isMediaPopupEnabled("image", config, env)).toBe(false);
  });

  it("デスクトップでは複数カラム表示フラグやブリッジの有無に関わらず設定だけで決まる", () => {
    const config = { imagePopupEnabled: true, videoPopupEnabled: true };
    const env = { hasBridge: false, multiColumnActive: false };
    expect(isMediaPopupEnabled("image", config, env)).toBe(true);
    expect(isMediaPopupEnabled("video", config, env)).toBe(true);
    expect(isMediaPopupEnabled("video", undefined, env)).toBe(true);
  });
});

describe("inject/image_popup の chooseMediaPopupTransport", () => {
  it("Androidブリッジがあれば invoke の有無に関わらずブリッジを選ぶ", () => {
    expect(
      chooseMediaPopupTransport({ hasBridge: true, hasInvoke: true }),
    ).toBe("bridge");
  });

  it("ブリッジが無く invoke があれば invoke を選ぶ", () => {
    expect(
      chooseMediaPopupTransport({ hasBridge: false, hasInvoke: true }),
    ).toBe("invoke");
  });

  it("ブリッジも invoke も無ければ何も選ばない", () => {
    expect(
      chooseMediaPopupTransport({ hasBridge: false, hasInvoke: false }),
    ).toBe("none");
  });
});

/**
 * Android 実測 DOM（タイムラインの動画）: サムネイル img と
 * div[previewInterstitial] > button[playButton] が兄弟で、<a> に包まれない。
 */
function addTimelineVideo(container: Element): {
  wrapper: HTMLElement;
  img: HTMLImageElement;
  button: HTMLButtonElement;
  path: SVGPathElement;
} {
  const wrapper = document.createElement("div");
  const img = document.createElement("img");
  const interstitial = document.createElement("div");
  interstitial.dataset.testid = "previewInterstitial";
  const button = document.createElement("button");
  button.setAttribute("role", "button");
  button.dataset.testid = "playButton";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  svg.appendChild(path);
  button.appendChild(svg);
  interstitial.appendChild(button);
  wrapper.appendChild(img);
  wrapper.appendChild(interstitial);
  container.appendChild(wrapper);
  return { wrapper, img, button, path };
}

describe("inject/image_popup の findPlayButtonForMediaTap", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("サムネイル画像（再生ボタン外）をタップすると同じプレビュー領域の再生ボタンを返す", () => {
    const article = buildArticle("/alice/status/123");
    const { img, button } = addTimelineVideo(article);
    expect(findPlayButtonForMediaTap(img)).toBe(button);
  });

  it("ツイート本文など動画と無関係な場所のタップでは再生ボタンを返さない", () => {
    const article = buildArticle("/alice/status/123");
    const wrapper = document.createElement("div");
    const text = document.createElement("div");
    text.dataset.testid = "tweetText";
    const span = document.createElement("span");
    text.appendChild(span);
    wrapper.appendChild(text);
    article.appendChild(wrapper);
    addTimelineVideo(wrapper);
    expect(findPlayButtonForMediaTap(span)).toBeNull();
  });

  it("再生ボタン内のsvgをタップしても同じ再生ボタンを返す", () => {
    const article = buildArticle("/alice/status/123");
    const { path, button } = addTimelineVideo(article);
    expect(findPlayButtonForMediaTap(path)).toBe(button);
  });

  it("複数の動画があるツイートではタップしたサムネイルの動画の再生ボタンを返す", () => {
    const article = buildArticle("/alice/status/123");
    const first = addTimelineVideo(article);
    const second = addTimelineVideo(article);
    expect(findPlayButtonForMediaTap(first.img)).toBe(first.button);
    expect(findPlayButtonForMediaTap(second.img)).toBe(second.button);
  });

  it("複数の動画を含む共通領域そのもののタップでは別の動画に誤マッチしないよう再生ボタンを返さない", () => {
    const article = buildArticle("/alice/status/123");
    const group = document.createElement("div");
    article.appendChild(group);
    addTimelineVideo(group);
    addTimelineVideo(group);
    expect(findPlayButtonForMediaTap(group)).toBeNull();
  });

  it("リンク（a）内の画像タップでは再生ボタンを返さない", () => {
    const article = buildArticle("/alice/status/123");
    const link = document.createElement("a");
    link.setAttribute("href", "/alice/status/123/photo/1");
    const img = document.createElement("img");
    link.appendChild(img);
    article.appendChild(link);
    addTimelineVideo(article);
    expect(findPlayButtonForMediaTap(img)).toBeNull();
  });

  it("再生ボタンが存在しないデスクトップ相当のDOMでは null を返す", () => {
    const article = buildArticle("/alice/status/123");
    const photo = addTweetPhoto(article, false);
    const img = document.createElement("img");
    photo.appendChild(img);
    expect(findPlayButtonForMediaTap(img)).toBeNull();
  });

  it("引用ツイートの動画サムネイルをタップするとその引用内の再生ボタンを返す", () => {
    const article = buildArticle("/alice/status/123");
    const quoted = document.createElement("div");
    quoted.setAttribute("role", "link");
    quoted.setAttribute("tabindex", "0");
    article.appendChild(quoted);
    const { img, button } = addTimelineVideo(quoted);
    expect(findPlayButtonForMediaTap(img)).toBe(button);
  });
});

describe("inject/image_popup の findMediaIndex（タイムライン動画の番号）", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("tweetPhoto に包まれない動画ツイートでは1を返す", () => {
    const article = buildArticle("/alice/status/123");
    const { button } = addTimelineVideo(article);
    expect(findMediaIndex(button)).toBe(1);
  });

  it("tweetPhoto に包まれない動画が複数あるときは文書順の番号を返す", () => {
    const article = buildArticle("/alice/status/123");
    addTimelineVideo(article);
    const second = addTimelineVideo(article);
    expect(findMediaIndex(second.button)).toBe(2);
  });

  it("画像（tweetPhoto）の後ろにある動画は画像を含めた文書順の番号を返す", () => {
    const article = buildArticle("/alice/status/123");
    addTweetPhoto(article, false);
    const video = addTimelineVideo(article);
    expect(findMediaIndex(video.button)).toBe(2);
  });

  it("tweetPhoto の内側に previewInterstitial がある場合は二重に数えない", () => {
    const article = buildArticle("/alice/status/123");
    const photo = addTweetPhoto(article, false);
    const video = addTimelineVideo(photo);
    addTweetPhoto(article, true);
    expect(findMediaIndex(video.button)).toBe(1);
    const second = article.querySelectorAll("button")[1];
    expect(findMediaIndex(second)).toBe(2);
  });
});

describe("inject/image_popup のAndroidでのクリック傍受", () => {
  const bridgePostMessage = vi.fn();

  function setAndroid(
    multiColumnActive: boolean | undefined,
    overrides: Partial<MultiColumnXConfig> = {},
  ): void {
    setConfig({
      imagePopupEnabled: true,
      videoPopupEnabled: true,
      mediaPopupRequiresMultiColumn: true,
      ...overrides,
    });
    window.__mcxMultiColumnActive = multiColumnActive;
  }

  function lastBridgeMessage(): unknown {
    const raw = bridgePostMessage.mock.calls.at(-1)?.[0];
    return typeof raw === "string" ? JSON.parse(raw) : undefined;
  }

  beforeEach(() => {
    bridgePostMessage.mockClear();
    invokeMock.mockClear();
    document.body.innerHTML = "";
    window.__TAURI__ = { core: { invoke: invokeMock } };
    window.__mcxMediaPopupBridge = { postMessage: bridgePostMessage };
  });

  afterEach(() => {
    delete window.__mcxMediaPopupBridge;
    delete window.__mcxMultiColumnActive;
    setConfig({});
  });

  it("ポップアップ表示が有効なとき画像をタップするとカラム内で開かずポップアップを要求する", () => {
    setAndroid(true);
    const link = buildMediaLink("/alice/status/123/photo/1");

    const event = click(link.firstElementChild!);

    expect(event.defaultPrevented).toBe(true);
    expect(bridgePostMessage).toHaveBeenCalledTimes(1);
    expect(lastBridgeMessage()).toEqual({
      type: "openMediaPopup",
      url: "https://x.com/alice/status/123/photo/1",
    });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("ポップアップ表示が有効なとき動画の再生ボタンをタップするとポップアップを要求する", () => {
    setAndroid(true);
    const article = buildArticle("/carol/status/555");
    const { path } = addTimelineVideo(article);

    const event = click(path);

    expect(event.defaultPrevented).toBe(true);
    expect(lastBridgeMessage()).toEqual({
      type: "openMediaPopup",
      url: "https://x.com/carol/status/555/video/1",
    });
  });

  it("ポップアップ表示が有効なとき動画のサムネイル（再生ボタン外）をタップしてもポップアップを要求する", () => {
    setAndroid(true);
    const article = buildArticle("/carol/status/555");
    addTimelineVideo(article);
    const second = addTimelineVideo(article);

    const event = click(second.img);

    expect(event.defaultPrevented).toBe(true);
    expect(lastBridgeMessage()).toEqual({
      type: "openMediaPopup",
      url: "https://x.com/carol/status/555/video/2",
    });
  });

  it("引用RT内の動画をタップすると引用元ツイートの動画でポップアップを要求する", () => {
    setAndroid(true);
    const button = buildQuotedTweetWithVideo(
      "/sankims/status/2070347996856996068",
      "2069216779545751868",
    );

    const event = click(button);

    expect(event.defaultPrevented).toBe(true);
    expect(lastBridgeMessage()).toEqual({
      type: "openMediaPopup",
      url: "https://x.com/i/status/2069216779545751868/video/1",
    });
  });

  it("ポップアップ表示が無効なとき画像・動画をタップすると従来どおりカラム内で表示される", () => {
    setAndroid(false);
    const link = buildMediaLink("/alice/status/123/photo/1");
    const article = buildArticle("/carol/status/555");
    const { img, button } = addTimelineVideo(article);

    const events = [click(link.firstElementChild!), click(img), click(button)];

    for (const event of events) expect(event.defaultPrevented).toBe(false);
    expect(bridgePostMessage).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("設定がOFFの種別だけカラム内で表示され、ONの種別はポップアップを要求する", () => {
    setAndroid(true, { imagePopupEnabled: false });
    const link = buildMediaLink("/alice/status/123/photo/1");
    const article = buildArticle("/carol/status/555");
    const { img } = addTimelineVideo(article);

    const imageEvent = click(link.firstElementChild!);
    const videoEvent = click(img);

    expect(imageEvent.defaultPrevented).toBe(false);
    expect(videoEvent.defaultPrevented).toBe(true);
    expect(bridgePostMessage).toHaveBeenCalledTimes(1);
  });

  it("複数カラム表示フラグが変わると次のタップから傍受の有無が追従する", () => {
    setAndroid(true);
    const link = buildMediaLink("/alice/status/123/photo/1");
    expect(click(link.firstElementChild!).defaultPrevented).toBe(true);

    window.__mcxMultiColumnActive = false;
    expect(click(link.firstElementChild!).defaultPrevented).toBe(false);

    window.__mcxMultiColumnActive = true;
    expect(click(link.firstElementChild!).defaultPrevented).toBe(true);
    expect(bridgePostMessage).toHaveBeenCalledTimes(2);
  });

  it("Androidでブリッジが無いときは横取りせずインライン表示にフォールバックする", () => {
    setAndroid(true);
    delete window.__mcxMediaPopupBridge;
    const link = buildMediaLink("/alice/status/123/photo/1");
    const article = buildArticle("/carol/status/555");
    const { img } = addTimelineVideo(article);

    const events = [click(link.firstElementChild!), click(img)];

    for (const event of events) expect(event.defaultPrevented).toBe(false);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("デスクトップでは表示列数に関わらず従来どおり設定だけで決まりtauri invokeでポップアップを開く", () => {
    setConfig({ imagePopupEnabled: true, videoPopupEnabled: true });
    delete window.__mcxMediaPopupBridge;
    window.__mcxMultiColumnActive = false;
    const link = buildMediaLink("/alice/status/123/photo/1");

    const event = click(link.firstElementChild!);

    expect(event.defaultPrevented).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith("open_popup_window", {
      url: "https://x.com/alice/status/123/photo/1",
    });
    expect(bridgePostMessage).not.toHaveBeenCalled();
  });

  it("デスクトップでは動画サムネイル（再生ボタン外）をタップしても横取りしない", () => {
    setConfig({ imagePopupEnabled: true, videoPopupEnabled: true });
    delete window.__mcxMediaPopupBridge;
    const article = buildArticle("/carol/status/555");
    const { img } = addTimelineVideo(article);

    const event = click(img);

    expect(event.defaultPrevented).toBe(false);
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
