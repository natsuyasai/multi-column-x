// auto_reload.ts は IIFE のため、import 時に実行されて window.__multiColumnX に
// triggerReload が公開される。
// 新着判定: ページ読み込みから見たことのある最新（status ID の最大値。通知ページは通知時刻の
// 最大値）を保持し、監視期間中にそれより新しいものが出現したら count=1 固定で報告する
// （DOM順先頭要素のinnerHTML比較や ID 集合の比較では、仮想化リストの入れ替えや
// 表示範囲の変化を誤検出するため）。
// 一定間隔でのリロード実行自体は src/hooks/useAutoReload.ts（呼び出し元）の責務であり、
// この inject スクリプトは triggerReload() の 1 回分の振る舞いのみを担う。
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  extractStatusId,
  compareStatusIds,
  maxStatusId,
  collectMaxStatusId,
  extractNotificationTimeMs,
  collectMaxNotificationTimeMs,
} from "./auto_reload";

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

/** section 配下に status ID 付きの article を追加する。 */
function addArticleWithStatusId(
  section: HTMLElement,
  statusId: string,
): HTMLElement {
  const article = buildArticleWithStatusLink(`/username/status/${statusId}`);
  section.appendChild(article);
  return article;
}

/** time[datetime] を持つ要素を生成する。datetime が null のときは属性を付けない。 */
function buildTimeElement(datetime: string | null): HTMLElement {
  const time = document.createElement("time");
  if (datetime !== null) time.setAttribute("datetime", datetime);
  return time;
}

/** 通知ページの notification 型 article（status リンク無し・time あり）を生成する。 */
function buildNotificationArticle(
  ...datetimes: (string | null)[]
): HTMLElement {
  const article = document.createElement("article");
  article.dataset.testid = "notification";
  for (const datetime of datetimes) {
    article.appendChild(buildTimeElement(datetime));
  }
  return article;
}

describe("inject/auto_reload の純粋関数", () => {
  describe("extractStatusId", () => {
    it("time子要素を持つstatusリンクからIDを抽出できる", () => {
      const article = buildArticleWithStatusLink("/username/status/123456789");

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
      likeLink.setAttribute("href", "/username/status/123456789/likes");
      article.appendChild(likeLink);

      expect(extractStatusId(article)).toBeNull();
    });
  });

  describe("compareStatusIds", () => {
    it("桁数の異なる番号でも新旧が正しく比べられる", () => {
      expect(compareStatusIds("999", "1000")).toBe(-1);
      expect(compareStatusIds("1000", "999")).toBe(1);
    });

    it("番号が19桁の実際のポスト番号でも新旧が正しく比べられる", () => {
      expect(
        compareStatusIds("1836000000000000000", "1836000000000000001"),
      ).toBe(-1);
      expect(
        compareStatusIds("1836000000000000001", "1836000000000000000"),
      ).toBe(1);
    });

    it("同じ値は0を返す", () => {
      expect(compareStatusIds("12345", "12345")).toBe(0);
    });

    it("同じ桁数のときは文字列の辞書順で比べる", () => {
      expect(compareStatusIds("123", "124")).toBe(-1);
      expect(compareStatusIds("900", "899")).toBe(1);
    });
  });

  describe("maxStatusId", () => {
    it("大きい方の番号を返す", () => {
      expect(maxStatusId("999", "1000")).toBe("1000");
      expect(maxStatusId("1000", "999")).toBe("1000");
    });

    it("片方がnullならもう片方を返す", () => {
      expect(maxStatusId(null, "123")).toBe("123");
      expect(maxStatusId("123", null)).toBe("123");
    });

    it("両方nullならnullを返す", () => {
      expect(maxStatusId(null, null)).toBeNull();
    });
  });

  describe("collectMaxStatusId", () => {
    it("複数articleのstatus IDのうち最大のものを返す", () => {
      const section = document.createElement("section");
      section.appendChild(buildArticleWithStatusLink("/username/status/999"));
      section.appendChild(buildArticleWithStatusLink("/username/status/1000"));
      section.appendChild(buildArticleWithStatusLink("/username/status/500"));

      expect(collectMaxStatusId(section)).toBe("1000");
    });

    it("IDの取れないarticleは無視される", () => {
      const section = document.createElement("section");
      section.appendChild(document.createElement("article"));
      section.appendChild(buildArticleWithStatusLink("/username/status/222"));

      expect(collectMaxStatusId(section)).toBe("222");
    });

    it("articleが0件ならnullを返す", () => {
      const section = document.createElement("section");

      expect(collectMaxStatusId(section)).toBeNull();
    });
  });

  describe("extractNotificationTimeMs", () => {
    it("通知ページでポストの識別番号がないいいね通知でも時刻が読み取れる", () => {
      const article = buildNotificationArticle("2026-09-19T00:45:55.510Z");

      expect(extractNotificationTimeMs(article)).toBe(
        Date.parse("2026-09-19T00:45:55.510Z"),
      );
    });

    it("statusリンクとtimeを持つtweet型のarticleからも時刻が読み取れる", () => {
      const article = buildArticleWithStatusLink("/username/status/123");
      article.dataset.testid = "tweet";
      article
        .querySelector("time")
        ?.setAttribute("datetime", "2026-09-19T01:00:00.000Z");

      expect(extractNotificationTimeMs(article)).toBe(
        Date.parse("2026-09-19T01:00:00.000Z"),
      );
    });

    it("timeが無いときはnullを返し例外にならない", () => {
      const article = document.createElement("article");
      article.dataset.testid = "notification";

      expect(extractNotificationTimeMs(article)).toBeNull();
    });

    it("datetime属性が無い、または不正なときはnullを返し例外にならない", () => {
      expect(
        extractNotificationTimeMs(buildNotificationArticle(null)),
      ).toBeNull();
      expect(
        extractNotificationTimeMs(buildNotificationArticle("not-a-date")),
      ).toBeNull();
    });

    it("複数のtimeがあれば最大の時刻を返す", () => {
      const article = buildNotificationArticle(
        "2026-09-19T00:00:00.000Z",
        "2026-09-19T02:00:00.000Z",
        "2026-09-19T01:00:00.000Z",
      );

      expect(extractNotificationTimeMs(article)).toBe(
        Date.parse("2026-09-19T02:00:00.000Z"),
      );
    });

    it("不正なdatetimeのtimeは無視して有効なtimeの最大を返す", () => {
      const article = buildNotificationArticle(
        "invalid",
        "2026-09-19T01:00:00.000Z",
      );

      expect(extractNotificationTimeMs(article)).toBe(
        Date.parse("2026-09-19T01:00:00.000Z"),
      );
    });
  });

  describe("collectMaxNotificationTimeMs", () => {
    it("複数articleの時刻のうち最大のものを返す", () => {
      const section = document.createElement("section");
      section.appendChild(buildNotificationArticle("2026-09-19T00:00:00.000Z"));
      section.appendChild(buildNotificationArticle("2026-09-19T03:00:00.000Z"));
      section.appendChild(buildNotificationArticle("2026-09-19T01:00:00.000Z"));

      expect(collectMaxNotificationTimeMs(section)).toBe(
        Date.parse("2026-09-19T03:00:00.000Z"),
      );
    });

    it("時刻の読み取れないarticleは無視される", () => {
      const section = document.createElement("section");
      section.appendChild(document.createElement("article"));
      section.appendChild(buildNotificationArticle("2026-09-19T01:00:00.000Z"));

      expect(collectMaxNotificationTimeMs(section)).toBe(
        Date.parse("2026-09-19T01:00:00.000Z"),
      );
    });

    it("articleが0件ならnullを返す", () => {
      const section = document.createElement("section");

      expect(collectMaxNotificationTimeMs(section)).toBeNull();
    });
  });
});

describe("inject/auto_reload", () => {
  beforeEach(async () => {
    // 新着判定の基準（見たことのある最新）はページ読み込みごとにリセットされるため、
    // テストごとにモジュールを読み込み直して IIFE を再実行する。
    vi.resetModules();
    await import("./auto_reload");
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

  it("フォロー中タブがアクティブで新着ボタンクリック後に未知のstatus IDのarticleが出現すると報告される", async () => {
    addTab(true, true);
    const section = addSection();
    addArticleWithStatusId(section, "111");
    const btn = addNewPostsButton(section, "新しいポストを見る");
    const clickSpy = vi.fn();
    btn.addEventListener("click", clickSpy);

    triggerReload();

    // ボタンクリック後に未知のstatus IDのarticleが出現
    addArticleWithStatusId(section, "222");

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

  it("通常タブ再選択後に未知のstatus IDのarticleが出現すると報告される", async () => {
    const tab = addTab(true, false);
    const section = addSection();
    addArticleWithStatusId(section, "111");
    const clickSpy = vi.fn();
    tab.addEventListener("click", clickSpy);

    triggerReload();

    // タブ再選択後に未知のstatus IDのarticleが出現
    addArticleWithStatusId(section, "222");

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

  it("更新前にarticleが存在しない場合更新後に新しいstatus IDのarticleが出現すると報告される", async () => {
    addTab(true, false);
    const section = addSection();
    // 最初は article が無い
    const clickSpy = vi.fn();
    const tabs = document.querySelectorAll<HTMLElement>("div[role='tab']");
    tabs.forEach((t) => t.addEventListener("click", clickSpy));

    triggerReload();

    // 更新後に新しいstatus IDのarticleが出現
    addArticleWithStatusId(section, "999");

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

  it("scrollToTop 指定時はスクロール位置を先頭に戻してから knownIds のスナップショットを取得する", async () => {
    setScrolling(300);
    addTab(true, false);
    const section = addSection();
    addArticleWithStatusId(section, "111");
    const clickSpy = vi.fn();
    const tabs = document.querySelectorAll<HTMLElement>("div[role='tab']");
    tabs.forEach((t) => t.addEventListener("click", clickSpy));

    triggerReload(true);

    // スクロール位置が先頭に戻っていること。
    // ここで scrollTop がリセットされないままだと、直後の isScrolling() チェックで
    // triggerReload が早期returnし監視自体が開始されないため、後続の report も発生しない。
    expect(scrollingElementStub.scrollTop).toBe(0);

    // knownIds スナップショット取得後に新しいstatus IDのarticleが出現
    addArticleWithStatusId(section, "222");
    await vi.runAllTimersAsync();

    expect(invokeMock).toHaveBeenCalledWith("report_new_posts_count", {
      label: "column-1",
      count: 1,
    });
  });

  it("フォロー中タブがアクティブで新着ボタンが即座には存在せず後から非同期に追加された場合ボタン出現後クリックされ未知status IDのarticle出現で報告される", async () => {
    // ボタン待ちobserverとstatus ID差分監視observer（currentTweetObserver）が同じ変数を
    // 共有していると、triggerReload内でtriggerFollowingRefresh直後に呼ばれる
    // waitForNewTweetがボタン待ちobserverをdisconnectしてしまい、非同期出現ボタンを
    // 検知できなくなる回帰を防ぐ。
    addTab(true, true);
    const section = addSection();
    addArticleWithStatusId(section, "111");
    const clickSpy = vi.fn();

    triggerReload();
    expect(invokeMock).not.toHaveBeenCalled();

    // ボタンが即座には存在せず、後から非同期に追加される
    const btn = addNewPostsButton(section, "新しいポストを見る");
    btn.addEventListener("click", clickSpy);

    // ボタン出現検知のMutationObserverコールバック（マイクロタスク）のみをフラッシュする。
    // ここで vi.runAllTimersAsync() を使うと 30秒のタイムアウトまで一気に進んでしまい、
    // まだ役目を終えていない status ID差分監視observer側のタイムアウトも
    // 巻き込んで disconnect されてしまうため、advanceTimersByTimeAsync(0) を使う。
    await vi.advanceTimersByTimeAsync(0);

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(invokeMock).not.toHaveBeenCalled();

    // ボタンクリック後に未知のstatus IDのarticleが出現
    addArticleWithStatusId(section, "222");

    await vi.runAllTimersAsync();

    expect(invokeMock).toHaveBeenCalledWith("report_new_posts_count", {
      label: "column-1",
      count: 1,
    });
  });

  it("複数回 triggerReload が呼ばれても前回の MutationObserver が disconnect される", async () => {
    addTab(true, false);
    const section = addSection();
    addArticleWithStatusId(section, "111");
    const clickSpy = vi.fn();
    const tabs = document.querySelectorAll<HTMLElement>("div[role='tab']");
    tabs.forEach((t) => t.addEventListener("click", clickSpy));

    // 1回目
    triggerReload();

    // 2回目（前回の observer が disconnect される）
    triggerReload();

    // 未知のstatus IDのarticleを追加
    addArticleWithStatusId(section, "222");
    await vi.runAllTimersAsync();

    // 最新の observer のみが報告する（重複報告なし）
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });
});

describe("inject/auto_reload の新着判定（見たことのある最新との比較）", () => {
  beforeEach(async () => {
    // 新着判定の基準（見たことのある最新）はページ読み込みごとにリセットされるため、
    // テストごとにモジュールを読み込み直して IIFE を再実行する。
    vi.resetModules();
    await import("./auto_reload");
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
    history.replaceState({}, "", "/");
  });

  it("監視開始後に未知のstatus IDを持つarticleが出現すると新着として報告される", async () => {
    addTab(true, false);
    const section = addSection();
    addArticleWithStatusId(section, "111");

    triggerReload();

    // 既知IDに含まれない新しいarticleが追加される
    addArticleWithStatusId(section, "222");

    await vi.runAllTimersAsync();

    expect(invokeMock).toHaveBeenCalledWith("report_new_posts_count", {
      label: "column-1",
      count: 1,
    });
  });

  it("監視中にスクロールを検知すると新着報告せず判定を打ち切る", async () => {
    addTab(true, false);
    const section = addSection();
    addArticleWithStatusId(section, "111");

    triggerReload();

    // 監視期間中にユーザーがスクロールする
    setScrolling(100);

    // 未知IDのarticleが追加され mutation が発火するが、スクロール中のため打ち切られる
    addArticleWithStatusId(section, "222");

    await vi.runAllTimersAsync();

    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("スクロール中のDOM再構成（recycle相当のarticle入れ替え、IDは同じ）では新着報告されない", async () => {
    // 仮想化リストはスクロールに伴いビューポート外のarticleをDOMから削除し、
    // 別のarticle要素として再追加する（recycle）。この際 status ID 自体は
    // 既知のままであるため、childList mutation が発生しても新着として
    // 報告してはならない（DOM順先頭要素のinnerHTML比較方式で誤検出していた
    // 回帰の再発防止テスト）。
    addTab(true, false);
    const section = addSection();
    const article = addArticleWithStatusId(section, "111");

    triggerReload();

    // recycle相当: 既存articleを削除し、同じstatus IDのarticleを再追加する
    article.remove();
    addArticleWithStatusId(section, "111");

    await vi.runAllTimersAsync();

    expect(invokeMock).not.toHaveBeenCalled();
  });

  /** 1 回分の triggerReload（通常タブの再選択経路）を実行する。 */
  function reloadOnNormalTab(): void {
    triggerReload();
  }

  function expectReportedOnce(): void {
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("report_new_posts_count", {
      label: "column-1",
      count: 1,
    });
  }

  it("見たことのある最も新しいポストより新しいポストが現れると新着として報告される", async () => {
    addTab(true, false);
    const section = addSection();
    addArticleWithStatusId(section, "1000");

    reloadOnNormalTab();
    addArticleWithStatusId(section, "1001");
    await vi.runAllTimersAsync();

    expectReportedOnce();
  });

  it("見たことのある最も新しいポストより古いポストだけが現れても新着として報告されない", async () => {
    addTab(true, false);
    const section = addSection();
    addArticleWithStatusId(section, "1000");

    reloadOnNormalTab();
    addArticleWithStatusId(section, "900");
    await vi.runAllTimersAsync();

    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("表示が入れ替わっても見たことのある最新より新しいポストがなければ新着として報告されない", async () => {
    addTab(true, false);
    const section = addSection();
    for (const id of ["700", "800", "900", "1000"]) {
      addArticleWithStatusId(section, id);
    }

    reloadOnNormalTab();
    section.innerHTML = "";
    for (const id of ["500", "600", "700", "950"]) {
      addArticleWithStatusId(section, id);
    }
    await vi.runAllTimersAsync();

    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("前回までに見たことのある最新の番号は更新をまたいで引き継がれる", async () => {
    addTab(true, false);
    const section = addSection();
    addArticleWithStatusId(section, "1200");

    // 1 回目の更新で 1200 を見たあと、表示が古いポストに入れ替わる
    reloadOnNormalTab();
    section.innerHTML = "";
    addArticleWithStatusId(section, "500");
    await vi.advanceTimersByTimeAsync(0);

    // 2 回目の更新で 1100 が現れても、1200 を見たことがあるので新着ではない
    reloadOnNormalTab();
    addArticleWithStatusId(section, "1100");
    await vi.runAllTimersAsync();

    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("前回までに見たことのある最新より新しいポストが次の更新で現れると新着として報告される", async () => {
    addTab(true, false);
    const section = addSection();
    addArticleWithStatusId(section, "1200");

    reloadOnNormalTab();
    section.innerHTML = "";
    addArticleWithStatusId(section, "500");
    await vi.advanceTimersByTimeAsync(0);

    reloadOnNormalTab();
    addArticleWithStatusId(section, "1201");
    await vi.runAllTimersAsync();

    expectReportedOnce();
  });

  it("同じ更新の中で新着は1回だけ報告される", async () => {
    addTab(true, false);
    const section = addSection();
    addArticleWithStatusId(section, "1000");

    reloadOnNormalTab();
    addArticleWithStatusId(section, "1001");
    await vi.advanceTimersByTimeAsync(0);
    addArticleWithStatusId(section, "1002");
    await vi.runAllTimersAsync();

    expectReportedOnce();
  });

  it("ユーザーがスクロールしているあいだは新着として報告されない", async () => {
    addTab(true, false);
    const section = addSection();
    addArticleWithStatusId(section, "1000");

    reloadOnNormalTab();
    setScrolling(100);
    section.innerHTML = "";
    addArticleWithStatusId(section, "500");
    addArticleWithStatusId(section, "1001");
    await vi.runAllTimersAsync();

    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("スクロール中に見えたポストも見たことのある最新として次の更新へ引き継がれる", async () => {
    addTab(true, false);
    const section = addSection();
    addArticleWithStatusId(section, "1000");

    reloadOnNormalTab();
    setScrolling(100);
    addArticleWithStatusId(section, "1001");
    await vi.advanceTimersByTimeAsync(0);

    // スクロールが戻ったあとの次の更新で、1001 は既に見たことがあるため新着ではない
    setScrolling(0);
    section.innerHTML = "";
    addArticleWithStatusId(section, "500");
    reloadOnNormalTab();
    addArticleWithStatusId(section, "1001");
    await vi.runAllTimersAsync();

    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("表示中のポストがないときは新着として報告されない", async () => {
    addTab(true, false);
    const section = addSection();

    reloadOnNormalTab();
    section.appendChild(document.createElement("div"));
    await vi.runAllTimersAsync();

    expect(invokeMock).not.toHaveBeenCalled();
  });

  describe("通知ページ", () => {
    beforeEach(() => {
      history.pushState({}, "", "/notifications");
    });

    it("見たことのある最新の通知時刻より新しい通知が現れると新着として報告される", async () => {
      addTab(true, false);
      const section = addSection();
      section.appendChild(buildNotificationArticle("2026-09-19T00:45:55Z"));

      reloadOnNormalTab();
      section.appendChild(buildNotificationArticle("2026-09-19T01:00:00Z"));
      await vi.runAllTimersAsync();

      expectReportedOnce();
    });

    it("ポストの識別番号がないいいね通知でも新着として検知される", async () => {
      addTab(true, false);
      const section = addSection();
      section.appendChild(buildNotificationArticle("2026-09-19T00:45:55Z"));

      reloadOnNormalTab();
      // status リンクを持たない通知（いいね通知）
      const likeNotification = buildNotificationArticle("2026-09-19T01:00:00Z");
      section.appendChild(likeNotification);
      await vi.runAllTimersAsync();

      expect(extractStatusId(likeNotification)).toBeNull();
      expectReportedOnce();
    });

    it("見たことのある最新の通知時刻より古い通知だけが現れても新着として報告されない", async () => {
      addTab(true, false);
      const section = addSection();
      section.appendChild(buildNotificationArticle("2026-09-19T00:45:55Z"));

      reloadOnNormalTab();
      section.appendChild(buildNotificationArticle("2026-09-18T23:00:00Z"));
      await vi.runAllTimersAsync();

      expect(invokeMock).not.toHaveBeenCalled();
    });

    it("通知の時刻が読み取れないときは新着として報告されない", async () => {
      addTab(true, false);
      const section = addSection();
      section.appendChild(buildNotificationArticle("2026-09-19T00:45:55Z"));

      reloadOnNormalTab();
      section.appendChild(buildNotificationArticle(null));
      section.appendChild(buildNotificationArticle("不正な日時"));
      await expect(vi.runAllTimersAsync()).resolves.not.toThrow();

      expect(invokeMock).not.toHaveBeenCalled();
    });
  });
});

describe("inject/auto_reload 検索ページの更新", () => {
  beforeEach(async () => {
    // 新着判定の基準（見たことのある最新）はページ読み込みごとにリセットされるため、
    // テストごとにモジュールを読み込み直して IIFE を再実行する。
    vi.resetModules();
    await import("./auto_reload");
    document.body.innerHTML = "";
    invokeMock.mockClear();
    setScrolling(0);
    window.__TAURI_INTERNALS__ = {
      metadata: { currentWebview: { label: "column-1" } },
    };
    window.__TAURI__ = { core: { invoke: invokeMock } };
    history.pushState({}, "", "/search?q=rust&f=live");
    vi.useFakeTimers();
  });

  afterEach(() => {
    // 途中のタブ切り替えが次のテストへ持ち越されないよう、保留中のタイマーを流し切る
    vi.runAllTimers();
    vi.useRealTimers();
    history.replaceState({}, "", "/");
  });

  /** 検索ページのタブ（a[role=tab]）を作る。クリックで選択状態が移る X の挙動を再現する。 */
  function addSearchTabs(
    names: string[],
    selectedIndex: number,
  ): HTMLAnchorElement[] {
    const tabs = names.map((name, i) => {
      const tab = document.createElement("a");
      tab.setAttribute("role", "tab");
      tab.setAttribute("href", `/search?q=rust&f=${name}`);
      tab.setAttribute("aria-selected", String(i === selectedIndex));
      document.body.appendChild(tab);
      return tab;
    });
    for (const tab of tabs) {
      tab.addEventListener("click", (event) => {
        // X の SPA 遷移を再現する（jsdom の実ナビゲーションを起こさない）
        event.preventDefault();
        for (const t of tabs)
          t.setAttribute("aria-selected", String(t === tab));
      });
    }
    return tabs;
  }

  /** 各タブのクリックを name の配列として記録する。 */
  function recordClicks(tabs: HTMLAnchorElement[], names: string[]): string[] {
    const clicks: string[] = [];
    tabs.forEach((tab, i) => {
      tab.addEventListener("click", () => clicks.push(names[i]));
    });
    return clicks;
  }

  const TAB_NAMES = ["top", "live", "user", "media", "list"];

  it("「最新」タブの検索カラムで自動更新が動くと検索結果が取得し直される", async () => {
    const tabs = addSearchTabs(TAB_NAMES, 1);
    const clicks = recordClicks(tabs, TAB_NAMES);
    addSection();

    triggerReload();
    await vi.advanceTimersByTimeAsync(5000);

    expect(clicks).toEqual(["top", "live"]);
  });

  it("「話題のポスト」タブの検索カラムでも自動更新が動くと元のタブへ戻る", async () => {
    const tabs = addSearchTabs(TAB_NAMES, 0);
    const clicks = recordClicks(tabs, TAB_NAMES);
    addSection();

    triggerReload();
    await vi.advanceTimersByTimeAsync(5000);

    expect(clicks).toEqual(["live", "top"]);
  });

  it("自動更新のあと選択中のタブは実行前と同じである", async () => {
    const tabs = addSearchTabs(TAB_NAMES, 1);
    addSection();

    triggerReload();
    await vi.advanceTimersByTimeAsync(5000 + 5000);

    expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual([
      "false",
      "true",
      "false",
      "false",
      "false",
    ]);
  });

  it("検索ページにタブが見つからないときは何もせずエラーにもならない", async () => {
    addSection();

    expect(() => triggerReload()).not.toThrow();
    await vi.advanceTimersByTimeAsync(5000 + 5000);

    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("検索ページのタブが選択中の1つしかないときは何もせずエラーにもならない", async () => {
    const tabs = addSearchTabs(["live"], 0);
    const clicks = recordClicks(tabs, ["live"]);
    addSection();

    expect(() => triggerReload()).not.toThrow();
    await vi.advanceTimersByTimeAsync(5000 + 5000);

    expect(clicks).toEqual([]);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("ホームのカラムの自動更新は従来どおりの手順で行われる", async () => {
    history.replaceState({}, "", "/");
    const searchTabs = addSearchTabs(TAB_NAMES, 1);
    const searchClicks = recordClicks(searchTabs, TAB_NAMES);
    const homeTab = addTab(true, false);
    const homeClickSpy = vi.fn();
    homeTab.addEventListener("click", homeClickSpy);
    addSection();

    triggerReload();
    await vi.advanceTimersByTimeAsync(5000 + 5000);

    expect(homeClickSpy).toHaveBeenCalledTimes(1);
    expect(searchClicks).toEqual([]);
  });

  it("検索以外のタブ付きページでも検索ページ専用の切り替えは行われない", async () => {
    history.replaceState({}, "", "/i/lists/123");
    const tabs = addSearchTabs(TAB_NAMES, 1);
    const clicks = recordClicks(tabs, TAB_NAMES);
    addSection();

    triggerReload();
    await vi.advanceTimersByTimeAsync(5000 + 5000);

    expect(clicks).toEqual([]);
  });

  it("ユーザーがスクロールしているときは検索カラムの自動更新を行わない", async () => {
    setScrolling(100);
    const tabs = addSearchTabs(TAB_NAMES, 1);
    const clicks = recordClicks(tabs, TAB_NAMES);
    addSection();

    triggerReload();
    await vi.advanceTimersByTimeAsync(5000 + 5000);

    expect(clicks).toEqual([]);
  });

  it("上端へスクロールする指定つきの自動更新は先頭へ戻してから更新する", async () => {
    setScrolling(100);
    const tabs = addSearchTabs(TAB_NAMES, 1);
    const clicks = recordClicks(tabs, TAB_NAMES);
    addSection();

    triggerReload(true);

    expect(scrollingElementStub.scrollTop).toBe(0);
    await vi.advanceTimersByTimeAsync(5000);
    expect(clicks).toEqual(["top", "live"]);
  });

  it("切り替えの途中でもう一度自動更新が実行されても二重に切り替えない", async () => {
    const tabs = addSearchTabs(TAB_NAMES, 1);
    const clicks = recordClicks(tabs, TAB_NAMES);
    addSection();

    triggerReload();
    triggerReload();
    await vi.advanceTimersByTimeAsync(5000);

    expect(clicks).toEqual(["top", "live"]);
  });

  it("切り替えの途中でカラムのページが検索ページでなくなっても元のタブへ戻そうとしない", async () => {
    const tabs = addSearchTabs(TAB_NAMES, 1);
    const clicks = recordClicks(tabs, TAB_NAMES);
    addSection();

    triggerReload();
    history.pushState({}, "", "/home");

    await expect(
      vi.advanceTimersByTimeAsync(5000 + 5000),
    ).resolves.not.toThrow();
    expect(clicks).toEqual(["top"]);
  });

  it("検索カラムでも見たことのある最新より新しいポストが現れると新着として報告される", async () => {
    addSearchTabs(TAB_NAMES, 1);
    const section = addSection();
    addArticleWithStatusId(section, "1000");

    triggerReload();
    // 別タブ→元のタブの切り替えが終わって、新着の監視が始まるまで進める
    await vi.advanceTimersByTimeAsync(5000 + 5000);

    addArticleWithStatusId(section, "1001");
    await vi.advanceTimersByTimeAsync(0);

    expect(invokeMock).toHaveBeenCalledWith("report_new_posts_count", {
      label: "column-1",
      count: 1,
    });
  });

  it("検索結果が取得し直されても未表示のポストが現れなければ新着として報告されない", async () => {
    addSearchTabs(TAB_NAMES, 1);
    const section = addSection();
    const original = addArticleWithStatusId(section, "111");

    triggerReload();

    // 別タブ表示中は元のタブと異なるポストが並ぶ
    original.remove();
    addArticleWithStatusId(section, "999");
    await vi.advanceTimersByTimeAsync(5000);

    // 元のタブへ戻すと元と同じ結果に戻る
    section.innerHTML = "";
    addArticleWithStatusId(section, "111");
    await vi.runAllTimersAsync();

    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("元のタブへ戻した後の待機中にユーザーがスクロールしていたら新着として報告されない", async () => {
    addSearchTabs(TAB_NAMES, 1);
    const section = addSection();
    addArticleWithStatusId(section, "111");

    triggerReload();
    await vi.advanceTimersByTimeAsync(5000);

    // 元のタブへ戻した後の待機中に未知のポストが現れ、ユーザーがスクロールしている
    addArticleWithStatusId(section, "222");
    setScrolling(100);
    await vi.advanceTimersByTimeAsync(5000);

    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("別タブの描画が検知できないときは上限時間で元のタブへ戻す", async () => {
    const tabs = addSearchTabs(TAB_NAMES, 1);
    const clicks = recordClicks(tabs, TAB_NAMES);
    addSection();

    triggerReload();

    await vi.advanceTimersByTimeAsync(4999);
    expect(clicks).toEqual(["top"]);

    await vi.advanceTimersByTimeAsync(1);
    expect(clicks).toEqual(["top", "live"]);
  });

  it("別タブの描画が落ち着いたら上限時間を待たずに元のタブへ戻す", async () => {
    const tabs = addSearchTabs(TAB_NAMES, 1);
    const clicks = recordClicks(tabs, TAB_NAMES);
    const section = addSection();

    triggerReload();
    // 別タブがクリックされた直後に、別タブの結果が描画される
    expect(clicks).toEqual(["top"]);
    addArticleWithStatusId(section, "999");

    await vi.advanceTimersByTimeAsync(799);
    expect(clicks).toEqual(["top"]);

    await vi.advanceTimersByTimeAsync(1);
    expect(clicks).toEqual(["top", "live"]);
  });

  it("別タブの描画が続いて落ち着かないときも上限時間で元のタブへ戻す", async () => {
    const tabs = addSearchTabs(TAB_NAMES, 1);
    const clicks = recordClicks(tabs, TAB_NAMES);
    const section = addSection();

    triggerReload();
    // 500ms ごとに描画が続き、800ms の静止には届かない
    for (let elapsed = 0; elapsed < 4500; elapsed += 500) {
      section.appendChild(document.createElement("div"));
      await vi.advanceTimersByTimeAsync(500);
    }
    expect(clicks).toEqual(["top"]);

    await vi.advanceTimersByTimeAsync(500);
    expect(clicks).toEqual(["top", "live"]);
  });

  it("描画の落ち着きを待っている間に別タブの投稿が見えていても新着として報告されない", async () => {
    addSearchTabs(TAB_NAMES, 1);
    const section = addSection();
    addArticleWithStatusId(section, "111");

    triggerReload();
    // 別タブ表示中は元のタブと異なるポストが並ぶ
    section.innerHTML = "";
    addArticleWithStatusId(section, "999");
    await vi.advanceTimersByTimeAsync(800);

    // 元のタブへ戻した直後の待機中（800ms 未満）は別タブの投稿が見えたままでも報告しない
    await vi.advanceTimersByTimeAsync(700);
    expect(invokeMock).not.toHaveBeenCalled();

    // 元のタブの結果に戻って落ち着いても報告されない
    section.innerHTML = "";
    addArticleWithStatusId(section, "111");
    await vi.advanceTimersByTimeAsync(5000);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("描画の落ち着きを待っている間にページが検索ページでなくなったら待機を打ち切る", async () => {
    const tabs = addSearchTabs(TAB_NAMES, 1);
    const clicks = recordClicks(tabs, TAB_NAMES);
    const section = addSection();

    triggerReload();
    history.pushState({}, "", "/home");
    section.appendChild(document.createElement("div"));

    await expect(
      vi.advanceTimersByTimeAsync(5000 + 5000),
    ).resolves.not.toThrow();
    expect(clicks).toEqual(["top"]);
    expect(invokeMock).not.toHaveBeenCalled();

    // 検索ページへ戻ると、再び自動更新が実行できる（切り替え中フラグが戻っている）。
    // 途中で打ち切ったため選択中のタブは「話題のポスト」のままで、別タブとして「最新」がクリックされる。
    history.pushState({}, "", "/search?q=rust&f=live");
    triggerReload();
    expect(clicks).toEqual(["top", "live"]);
  });
});
