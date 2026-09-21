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

function setRepostConfig(
  repostHiddenUserIds: string[],
  globalRepostHiddenUserIds: string[] = [],
): void {
  window.__multiColumnXConfig = {
    ngWords: [],
    globalNgWords: [],
    whitelistEnabled: false,
    whitelistWords: [],
    repostHiddenUserIds,
    globalRepostHiddenUserIds,
  } as MultiColumnXConfig;
}

// 実DOMと同じ構造: リポストした人への <a> が socialContext の親、元投稿者への <a> は別に存在する
function addRepostTweet(
  reposterHref: string,
  contextLinkPosition: "parent" | "child" | "none" = "parent",
): HTMLElement {
  const article = document.createElement("article");
  article.setAttribute("role", "article");
  const context = document.createElement("span");
  context.dataset.testid = "socialContext";
  context.textContent = "清水朔さんがリポスト";
  if (contextLinkPosition === "parent") {
    const link = document.createElement("a");
    link.setAttribute("href", reposterHref);
    link.appendChild(context);
    article.appendChild(link);
  } else if (contextLinkPosition === "child") {
    const link = document.createElement("a");
    link.setAttribute("href", reposterHref);
    context.appendChild(link);
    article.appendChild(context);
  } else {
    context.textContent = "固定";
    article.appendChild(context);
  }
  const authorLink = document.createElement("a");
  authorLink.setAttribute("href", "/N_t447");
  authorLink.textContent = "元投稿者";
  article.appendChild(authorLink);
  document.body.appendChild(article);
  return article;
}

// socialContext を持たない通常の投稿（投稿者リンクのみ）
function addOwnTweet(authorHref: string): HTMLElement {
  const article = document.createElement("article");
  article.setAttribute("role", "article");
  const authorLink = document.createElement("a");
  authorLink.setAttribute("href", authorHref);
  authorLink.textContent = "投稿者";
  article.appendChild(authorLink);
  document.body.appendChild(article);
  return article;
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

  describe("指定ユーザーのリポスト非表示", () => {
    it("指定ユーザーがリポストした投稿は非表示になる", () => {
      setRepostConfig(["HAJIME_2001"]);
      const hit = addRepostTweet("/HAJIME_2001");

      recheck();

      expect(hit.style.display).toBe("none");
    });

    it("指定ユーザー自身の投稿は非表示にならない", () => {
      setRepostConfig(["HAJIME_2001"]);
      const own = addOwnTweet("/HAJIME_2001");

      recheck();

      expect(own.style.display).not.toBe("none");
    });

    it("別のユーザーがリポストした投稿は非表示にならない", () => {
      setRepostConfig(["HAJIME_2001"]);
      const other = addRepostTweet("/someone_else");

      recheck();

      expect(other.style.display).not.toBe("none");
    });

    it("大文字小文字と先頭の@の違いは同じIDとして扱う", () => {
      setRepostConfig(["@hajime_2001"]);
      const hit = addRepostTweet("/HAJIME_2001");

      recheck();

      expect(hit.style.display).toBe("none");
    });

    it("IDを前方一致で含むだけの別IDやステータスURLは一致しない", () => {
      setRepostConfig(["HAJIME_2001"]);
      const prefix = addRepostTweet("/HAJIME_20012");
      const status = addRepostTweet("/HAJIME_2001/status/1");

      recheck();

      expect(prefix.style.display).not.toBe("none");
      expect(status.style.display).not.toBe("none");
    });

    it("リンクを持たないsocialContext（固定テキストのみ）は非表示にならない", () => {
      setRepostConfig(["HAJIME_2001"]);
      const pinned = addRepostTweet("/HAJIME_2001", "none");

      recheck();

      expect(pinned.style.display).not.toBe("none");
    });

    it("リンクがsocialContextの親でも子でも検出できる", () => {
      setRepostConfig(["HAJIME_2001"]);
      const parentLinked = addRepostTweet("/HAJIME_2001", "parent");
      const childLinked = addRepostTweet("/HAJIME_2001", "child");

      recheck();

      expect(parentLinked.style.display).toBe("none");
      expect(childLinked.style.display).toBe("none");
    });

    it("全体設定とカラム個別の両方のIDが有効になる", () => {
      setRepostConfig(["column_user"], ["global_user"]);
      const columnHit = addRepostTweet("/column_user");
      const globalHit = addRepostTweet("/global_user");
      const miss = addRepostTweet("/nobody");

      recheck();

      expect(columnHit.style.display).toBe("none");
      expect(globalHit.style.display).toBe("none");
      expect(miss.style.display).not.toBe("none");
    });

    it("IDが1件も設定されていなければ何も非表示にならない", () => {
      setRepostConfig([], []);
      const tweet = addRepostTweet("/HAJIME_2001");

      recheck();

      expect(tweet.style.display).not.toBe("none");
    });

    it("リポスト非表示の対象はcellInnerDivごとDOMから削除される", () => {
      setRepostConfig(["HAJIME_2001"]);
      const article = addRepostTweet("/HAJIME_2001");
      const cell = document.createElement("div");
      cell.dataset.testid = "cellInnerDiv";
      cell.style.transform = "translateY(100px)";
      cell.style.position = "absolute";
      document.body.appendChild(cell);
      cell.appendChild(article);

      recheck();

      expect(document.body.contains(cell)).toBe(false);
    });

    it("article の外側にある a 要素は判定対象にしない", () => {
      setRepostConfig(["HAJIME_2001"]);
      const outer = document.createElement("a");
      outer.setAttribute("href", "/HAJIME_2001");
      document.body.appendChild(outer);
      const article = document.createElement("article");
      article.setAttribute("role", "article");
      const context = document.createElement("span");
      context.dataset.testid = "socialContext";
      context.textContent = "固定";
      article.appendChild(context);
      outer.appendChild(article);

      recheck();

      expect(article.style.display).not.toBe("none");
    });
  });
});
