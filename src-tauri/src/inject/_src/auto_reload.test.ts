// auto_reload.ts は IIFE のため、import 時に実行されて window.__multiColumnX に
// triggerReload が公開される。
// 新仕様: トリガー前後で先頭 tweetText を比較し、差異があれば count=1 固定で報告する。
// 一定間隔でのリロード実行自体は src/hooks/useAutoReload.ts（呼び出し元）の責務であり、
// この inject スクリプトは triggerReload() の 1 回分の振る舞いのみを担う。
import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
} from "vitest";
import { extractStatusId, collectKnownStatusIds } from "./auto_reload";

const invokeMock = vi.fn((_cmd: string, _args?: Record<string, unknown>) =>
  Promise.resolve<unknown>(undefined),
);

// jsdom はレイアウトエンジンを持たず document.scrollingElement が常に null を返すため、
// scrollTop を持つダミー要素で差し替えて isScrolling() / scrollToTop 分岐を検証する。
const scrollingElementStub: { scrollTop: number } = { scrollTop: 0 };

function setScrolling(scrollTop: number): void {
  scrollingElementStub.scrollTop = scrollTop;
  Object.defineProperty(document, "scrollingElement", {
    value: scrollingElementStub,
    configurable: true,
  });
}

function addTab(selected: boolean, expanded: boolean): HTMLElement {
  const tab = document.createElement("div");
  tab.setAttribute("role", "tab");
  tab.setAttribute("aria-selected", String(selected));
  if (expanded) {
    tab.setAttribute("aria-expanded", "true");
  }
  document.body.appendChild(tab);
  return tab;
}

function addNewPostsButton(
  section: HTMLElement,
  label: string,
): HTMLButtonElement {
  const cell = document.createElement("div");
  cell.dataset.testid = "cellInnerDiv";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = label;
  cell.appendChild(btn);
  section.appendChild(cell);
  return btn;
}

function addSection(): HTMLElement {
  const section = document.createElement("section");
  section.setAttribute("aria-labelledby", "timeline");
  document.body.appendChild(section);
  return section;
}

function addTweetTextElement(section: HTMLElement, text: string): HTMLElement {
  const article = document.createElement("article");
  section.appendChild(article);

  const tweetText = document.createElement("div");
  tweetText.dataset.testid = "tweetText";
  tweetText.innerHTML = text;
  article.appendChild(tweetText);

  return tweetText;
}

function triggerReload(scrollToTop?: boolean): void {
  window.__multiColumnX.triggerReload(scrollToTop);
}

/** timestamp リンク（time 子要素を持つ a）を備えた article を生成する。 */
function buildArticleWithStatusLink(statusHref: string): HTMLElement {
  const article = document.createElement("article");
  const timeLink = document.createElement("a");
  timeLink.setAttribute("href", statusHref);
  timeLink.appendChild(document.createElement("time"));
  article.appendChild(timeLink);
  return article;
}

describe("inject/auto_reload の純粋関数", () => {
  describe("extractStatusId", () => {
    it("time子要素を持つstatusリンクからIDを抽出できる", () => {
      const article = buildArticleWithStatusLink(
        "/username/status/123456789",
      );

      expect(extractStatusId(article)).toBe("123456789");
    });

    it("該当するリンクが無い場合はnullを返す", () => {
      const article = document.createElement("article");
      const otherLink = document.createElement("a");
      otherLink.setAttribute("href", "/username");
      article.appendChild(otherLink);

      expect(extractStatusId(article)).toBeNull();
    });

    it("time子要素を持たないstatusリンクは対象外となる（いいねボタン等の誤検出防止）", () => {
      const article = document.createElement("article");
      const likeLink = document.createElement("a");
      likeLink.setAttribute(
        "href",
        "/username/status/123456789/likes",
      );
      article.appendChild(likeLink);

      expect(extractStatusId(article)).toBeNull();
    });
  });

  describe("collectKnownStatusIds", () => {
    it("複数articleから複数のstatus IDを収集できる", () => {
      const section = document.createElement("section");
      section.appendChild(
        buildArticleWithStatusLink("/username/status/111"),
      );
      section.appendChild(
        buildArticleWithStatusLink("/username/status/222"),
      );

      const ids = collectKnownStatusIds(section);

      expect(ids).toEqual(new Set(["111", "222"]));
    });

    it("articleが無い場合は空のSetを返す", () => {
      const section = document.createElement("section");

      expect(collectKnownStatusIds(section)).toEqual(new Set());
    });

    it("同一IDが複数articleに存在する場合は重複排除される", () => {
      const section = document.createElement("section");
      section.appendChild(
        buildArticleWithStatusLink("/username/status/111"),
      );
      section.appendChild(
        buildArticleWithStatusLink("/username/status/111"),
      );

      const ids = collectKnownStatusIds(section);

      expect(ids).toEqual(new Set(["111"]));
    });
  });
});

describe("inject/auto_reload", () => {
  beforeAll(async () => {
    await import("./auto_reload");
  });

  beforeEach(() => {
    document.body.innerHTML = "";
    invokeMock.mockClear();
    setScrolling(0);
    window.__TAURI_INTERNALS__ = {
      metadata: { currentWebview: { label: "column-1" } },
    };
    window.__TAURI__ = { core: { invoke: invokeMock } };
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("スクロール中は監視自体を開始しない", () => {
    setScrolling(100);
    const tab = addTab(true, false);
    const clickSpy = vi.fn();
    tab.addEventListener("click", clickSpy);

    triggerReload();

    expect(clickSpy).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("フォロー中タブがアクティブで新着ボタンクリック後に tweetText が変化すると報告される", async () => {
    addTab(true, true);
    const section = addSection();
    const tweetText = addTweetTextElement(section, "初期ツイート");
    const btn = addNewPostsButton(section, "新しいポストを見る");
    const clickSpy = vi.fn();
    btn.addEventListener("click", clickSpy);

    triggerReload();

    // ボタンクリック後に tweetText を変更
    tweetText.innerHTML = "新しいツイート";

    // MutationObserver の callback 実行を待つ
    await vi.runAllTimersAsync();

    expect(invokeMock).toHaveBeenCalledWith("report_new_posts_count", {
      label: "column-1",
      count: 1,
    });
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("フォロー中タブがアクティブで新着ボタンクリック後に tweetText が変化しない場合は報告されない", async () => {
    addTab(true, true);
    const section = addSection();
    addTweetTextElement(section, "初期ツイート");
    const btn = addNewPostsButton(section, "新しいポストを見る");
    const clickSpy = vi.fn();
    btn.addEventListener("click", clickSpy);

    triggerReload();

    // tweetText を変更しない
    await vi.runAllTimersAsync();

    expect(invokeMock).not.toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("通常タブ再選択後に tweetText が変化すると報告される", async () => {
    const tab = addTab(true, false);
    const section = addSection();
    const tweetText = addTweetTextElement(section, "初期ツイート");
    const clickSpy = vi.fn();
    tab.addEventListener("click", clickSpy);

    triggerReload();

    // タブ再選択後に tweetText を変更
    tweetText.innerHTML = "新しいツイート";

    // MutationObserver の callback 実行を待つ
    await vi.runAllTimersAsync();

    expect(invokeMock).toHaveBeenCalledWith("report_new_posts_count", {
      label: "column-1",
      count: 1,
    });
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("通常タブ再選択後に tweetText が変化しない場合は報告されない", async () => {
    const tab = addTab(true, false);
    const section = addSection();
    addTweetTextElement(section, "初期ツイート");
    const clickSpy = vi.fn();
    tab.addEventListener("click", clickSpy);

    triggerReload();

    // tweetText を変更しない
    await vi.runAllTimersAsync();

    expect(invokeMock).not.toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("更新前に tweetText が存在しない場合更新後に出現すると報告される", async () => {
    addTab(true, false);
    const section = addSection();
    // 最初は tweetText が無い
    const clickSpy = vi.fn();
    const tabs = document.querySelectorAll<HTMLElement>("div[role='tab']");
    tabs.forEach((t) => t.addEventListener("click", clickSpy));

    triggerReload();

    // 更新後に tweetText が出現
    const article = document.createElement("article");
    section.appendChild(article);
    const tweetText = document.createElement("div");
    tweetText.dataset.testid = "tweetText";
    tweetText.innerHTML = "新規ツイート";
    article.appendChild(tweetText);

    // MutationObserver の callback 実行を待つ
    await vi.runAllTimersAsync();

    expect(invokeMock).toHaveBeenCalledWith("report_new_posts_count", {
      label: "column-1",
      count: 1,
    });
  });

  it("MutationObserver がタイムアウト（30秒）で打ち切られるとその後の変化は報告されない", async () => {
    addTab(true, false);
    const section = addSection();
    const tweetText = addTweetTextElement(section, "初期ツイート");
    const clickSpy = vi.fn();
    const tabs = document.querySelectorAll<HTMLElement>("div[role='tab']");
    tabs.forEach((t) => t.addEventListener("click", clickSpy));

    triggerReload();

    // 30秒経過（タイムアウト）
    vi.advanceTimersByTime(30000);

    // タイムアウト後に tweetText を変更
    tweetText.innerHTML = "新しいツイート";

    // これ以上時間を進めても報告されない
    await vi.runAllTimersAsync();

    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("scrollToTop 指定時はスクロール位置を先頭に戻してから before を取得する", async () => {
    setScrolling(300);
    addTab(true, false);
    const section = addSection();
    const tweetText = addTweetTextElement(section, "初期ツイート");
    const clickSpy = vi.fn();
    const tabs = document.querySelectorAll<HTMLElement>("div[role='tab']");
    tabs.forEach((t) => t.addEventListener("click", clickSpy));

    triggerReload(true);

    expect(scrollingElementStub.scrollTop).toBe(0);

    // 更新後に tweetText を変更
    tweetText.innerHTML = "新しいツイート";
    await vi.runAllTimersAsync();

    expect(invokeMock).toHaveBeenCalledWith("report_new_posts_count", {
      label: "column-1",
      count: 1,
    });
  });

  it("フォロー中タブがアクティブで新着ボタンが即座には存在せず後から非同期に追加された場合ボタン出現後クリックされtweetText変化で報告される", async () => {
    // ボタン待ちobserverとtweetText差分監視observerが同じ変数を共有していると、
    // triggerReload内でtriggerFollowingRefresh直後に呼ばれるwaitForTweetTextChangeが
    // ボタン待ちobserverをdisconnectしてしまい、非同期出現ボタンを検知できなくなる回帰を防ぐ。
    addTab(true, true);
    const section = addSection();
    const tweetText = addTweetTextElement(section, "初期ツイート");
    const clickSpy = vi.fn();

    triggerReload();
    expect(invokeMock).not.toHaveBeenCalled();

    // ボタンが即座には存在せず、後から非同期に追加される
    const btn = addNewPostsButton(section, "新しいポストを見る");
    btn.addEventListener("click", clickSpy);

    // ボタン出現検知のMutationObserverコールバック（マイクロタスク）のみをフラッシュする。
    // ここで vi.runAllTimersAsync() を使うと 30秒のタイムアウトまで一気に進んでしまい、
    // まだ役目を終えていない tweetText 差分監視observer側のタイムアウトも
    // 巻き込んで disconnect されてしまうため、advanceTimersByTimeAsync(0) を使う。
    await vi.advanceTimersByTimeAsync(0);

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(invokeMock).not.toHaveBeenCalled();

    // ボタンクリック後に tweetText を変更
    tweetText.innerHTML = "新しいツイート";

    await vi.runAllTimersAsync();

    expect(invokeMock).toHaveBeenCalledWith("report_new_posts_count", {
      label: "column-1",
      count: 1,
    });
  });

  it("複数回 triggerReload が呼ばれても前回の MutationObserver が disconnect される", async () => {
    addTab(true, false);
    const section = addSection();
    const tweetText = addTweetTextElement(section, "初期ツイート");
    const clickSpy = vi.fn();
    const tabs = document.querySelectorAll<HTMLElement>("div[role='tab']");
    tabs.forEach((t) => t.addEventListener("click", clickSpy));

    // 1回目
    triggerReload();

    // 2回目（前回の observer が disconnect される）
    triggerReload();

    // 最初のツイートを変更
    tweetText.innerHTML = "新しいツイート";
    await vi.runAllTimersAsync();

    // 最新の observer のみが報告する（重複報告なし）
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });
});
