// ng_word.ts は IIFE のため、import 時に実行されて window.__multiColumnX に
// recheckNgWords が公開される。これを通じて NG ワード非表示の振る舞いを検証する。
import { describe, it, expect, beforeAll, beforeEach } from "vitest";

function setConfig(
  ngWords: string[],
  globalNgWords: string[] = [],
  whitelistEnabled = false,
  whitelistWords: string[] = [],
): void {
  window.__multiColumnXConfig = {
    ngWords,
    globalNgWords,
    whitelistEnabled,
    whitelistWords,
  } as MultiColumnXConfig;
}

function addTweet(text: string): HTMLElement {
  const article = document.createElement("article");
  article.setAttribute("role", "article");
  article.textContent = text;
  document.body.appendChild(article);
  return article;
}

function addTweetInCell(text: string): {
  cell: HTMLElement;
  article: HTMLElement;
} {
  const cell = document.createElement("div");
  cell.dataset.testid = "cellInnerDiv";
  cell.style.transform = "translateY(100px)";
  cell.style.position = "absolute";
  const article = document.createElement("article");
  article.setAttribute("role", "article");
  article.textContent = text;
  cell.appendChild(article);
  document.body.appendChild(cell);
  return { cell, article };
}

function recheck(): void {
  window.__multiColumnX.recheckNgWords();
}

describe("inject/ng_word", () => {
  beforeAll(async () => {
    await import("./ng_word");
  });

  beforeEach(() => {
    document.body.innerHTML = "";
    setConfig([]);
  });

  it("NGワードを含むツイートが非表示になる", () => {
    setConfig(["spam"]);
    const hit = addTweet("this is spam content");
    const miss = addTweet("normal tweet");

    recheck();

    expect(hit.style.display).toBe("none");
    expect(miss.style.display).not.toBe("none");
  });

  it("大文字小文字を区別せずに一致する", () => {
    setConfig(["spam"]);
    const tweet = addTweet("THIS IS SPAM");

    recheck();

    expect(tweet.style.display).toBe("none");
  });

  it("グローバルNGワードも適用される", () => {
    setConfig([], ["広告"]);
    const tweet = addTweet("これは広告ツイートです");

    recheck();

    expect(tweet.style.display).toBe("none");
  });

  it("NGワードが空なら何も非表示にしない", () => {
    setConfig([], []);
    const tweet = addTweet("anything goes");

    recheck();

    expect(tweet.style.display).not.toBe("none");
  });

  it("cellInnerDiv祖先がある場合はセルごとDOMから削除される", () => {
    setConfig(["spam"]);
    const { cell } = addTweetInCell("spam in cell");

    recheck();

    expect(document.body.contains(cell)).toBe(false);
  });

  it("正規表現形式のNGワードにマッチするツイートが非表示になる", () => {
    setConfig(["/spam|広告/"]);
    const hit = addTweet("this is spam content");

    recheck();

    expect(hit.style.display).toBe("none");
  });

  it("正規表現形式のNGワードにマッチしないツイートは非表示にならない", () => {
    setConfig(["/spam|広告/"]);
    const miss = addTweet("normal tweet");

    recheck();

    expect(miss.style.display).not.toBe("none");
  });

  it("グローバルNGワードでも正規表現形式が動作する", () => {
    setConfig([], ["/広告|宣伝/"]);
    const hit = addTweet("これは宣伝ツイートです");

    recheck();

    expect(hit.style.display).toBe("none");
  });

  it("ホワイトリスト有効・一致しないツイートは非表示になる", () => {
    setConfig([], [], true, ["keep"]);
    const miss = addTweet("this should be hidden");

    recheck();

    expect(miss.style.display).toBe("none");
  });

  it("ホワイトリスト有効・一致するツイートは非表示にならない", () => {
    setConfig([], [], true, ["keep"]);
    const hit = addTweet("please keep this tweet");

    recheck();

    expect(hit.style.display).not.toBe("none");
  });

  it("ホワイトリスト無効の場合はワードが設定されていても非表示にならない", () => {
    setConfig([], [], false, ["keep"]);
    const tweet = addTweet("this does not match keep");

    recheck();

    expect(tweet.style.display).not.toBe("none");
  });

  it("ホワイトリスト有効・ワード未指定の場合は全ツイート表示される", () => {
    setConfig([], [], true, []);
    const tweet = addTweet("anything goes here");

    recheck();

    expect(tweet.style.display).not.toBe("none");
  });

  it("NGワードとホワイトリストを両方有効にした場合、NGワードに一致すれば非表示になる", () => {
    setConfig(["spam"], [], true, ["spam"]);
    const tweet = addTweet("this is spam content");

    recheck();

    expect(tweet.style.display).toBe("none");
  });

  it("NGワードとホワイトリストを両方有効にした場合、NGワード不一致・ホワイトリスト一致なら非表示にならない", () => {
    setConfig(["spam"], [], true, ["keep"]);
    const tweet = addTweet("please keep this tweet");

    recheck();

    expect(tweet.style.display).not.toBe("none");
  });

  it("ホワイトリストの正規表現形式のワードも動作する", () => {
    setConfig([], [], true, ["/keep|保持/"]);
    const hit = addTweet("これは保持すべきツイートです");
    const miss = addTweet("this should be hidden");

    recheck();

    expect(hit.style.display).not.toBe("none");
    expect(miss.style.display).toBe("none");
  });
});
