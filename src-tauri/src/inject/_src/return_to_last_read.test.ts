// return_to_last_read.ts は IIFE のため import 時に実行される。
// 純粋ロジック（return_to_last_read_logic.ts）は logic.test.ts 側で検証済みのため、
// ここでは DOM グルー（triggerReload のラップ・スナップショット記録・ボタン/トースト表示・
// ユーザースクロール検知・探索のDOM接続）のみを検証する。
// jsdom はレイアウトを持たないため getBoundingClientRect は要素ごとにスタブする。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- テスト間の汚染防止 ---
// return_to_last_read.ts は import 時に window への addEventListener と
// （dom_observer ハブ不在時の）フォールバック MutationObserver を登録する。
// window / document は vitest のテスト間で使い回されるため、何もしなければ
// 前のテストで登録したリスナー・observer が残り続け、次のテストの DOM 変更にも
// （古いクロージャの state で）反応してテスト同士が干渉してしまう。
// mobile_area_hide.test.ts と同様に MutationObserver を追跡し、
// 加えて window.addEventListener も追跡して afterEach で確実に後片付けする。
const createdObservers = new Set<MutationObserver>();
const OriginalMutationObserver = globalThis.MutationObserver;

class TrackingMutationObserver extends OriginalMutationObserver {
  constructor(callback: MutationCallback) {
    super(callback);
    createdObservers.add(this);
  }
}
vi.stubGlobal("MutationObserver", TrackingMutationObserver);

type ListenerEntry = {
  type: string;
  listener: EventListenerOrEventListenerObject;
  options?: boolean | AddEventListenerOptions;
};
const addedListeners: ListenerEntry[] = [];
const originalAddEventListener = window.addEventListener.bind(window);
window.addEventListener = ((
  type: string,
  listener: EventListenerOrEventListenerObject,
  options?: boolean | AddEventListenerOptions,
) => {
  addedListeners.push({ type, listener, options });
  return originalAddEventListener(type, listener, options);
}) as typeof window.addEventListener;

// --- DOM構築ヘルパー ---

function setElementRect(el: Element, rect: Partial<DOMRect>): void {
  (el as HTMLElement).getBoundingClientRect = () =>
    ({
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON() {
        return {};
      },
      ...rect,
    }) as DOMRect;
}

function addTablist(bottom = 53): HTMLElement {
  const tablist = document.createElement("div");
  tablist.setAttribute("role", "tablist");
  document.body.appendChild(tablist);
  setElementRect(tablist, { bottom });
  return tablist;
}

function addTab(
  tablist: HTMLElement,
  name: string,
  selected: boolean,
): HTMLElement {
  const tab = document.createElement("div");
  tab.setAttribute("role", "tab");
  tab.setAttribute("aria-selected", String(selected));
  tab.textContent = name;
  tablist.appendChild(tab);
  return tab;
}

function selectOnlyTab(tablist: HTMLElement, name: string): void {
  tablist.innerHTML = "";
  addTab(tablist, name, true);
}

function addSection(): HTMLElement {
  const section = document.createElement("section");
  section.setAttribute("aria-labelledby", "timeline");
  document.body.appendChild(section);
  return section;
}

/** section 配下に id 列（上から順）のタイムラインcellを構築する。既存の中身は消す。 */
function setTimeline(
  section: HTMLElement,
  ids: string[],
  options: { topStep?: number } = {},
): void {
  section.innerHTML = "";
  const topStep = options.topStep ?? 100;
  ids.forEach((id, index) => {
    const cell = document.createElement("div");
    cell.dataset.testid = "cellInnerDiv";
    const article = document.createElement("article");
    const link = document.createElement("a");
    link.setAttribute("href", `/u/status/${id}`);
    link.appendChild(document.createElement("time"));
    article.appendChild(link);
    cell.appendChild(article);
    section.appendChild(cell);
    const top = index * topStep;
    setElementRect(cell, { top });
    setElementRect(article, { top });
  });
}

/** section 内のすべての cellInnerDiv に style.transform を設定する（仮想リストの描画位置の模擬）。 */
function setCellTransforms(section: HTMLElement, transform: string): void {
  section
    .querySelectorAll<HTMLElement>('[data-testid="cellInnerDiv"]')
    .forEach((cell) => {
      cell.style.transform = transform;
    });
}

// auto_reload.test.ts と同様に document.scrollingElement をダミー要素で差し替える。
const scrollingElementStub: {
  scrollTop: number;
  scrollHeight: number;
} = { scrollTop: 0, scrollHeight: 0 };

function setScrollTop(value: number): void {
  scrollingElementStub.scrollTop = value;
  Object.defineProperty(document, "scrollingElement", {
    value: scrollingElementStub,
    configurable: true,
  });
}

/** setScrollTop が上限でクランプされる（＝仮想リストの終端）スクロール要素スタブ。 */
function setClampedScrollingElement(
  initialAndMax: number,
  scrollHeight: number,
): void {
  let top = initialAndMax;
  const stub = {
    get scrollTop(): number {
      return top;
    },
    set scrollTop(value: number) {
      top = Math.min(value, initialAndMax);
    },
    scrollHeight,
  };
  Object.defineProperty(document, "scrollingElement", {
    value: stub,
    configurable: true,
  });
}

function getButton(): HTMLButtonElement | null {
  return document.getElementById(
    "mcx-return-to-last-read",
  ) as HTMLButtonElement | null;
}

function isButtonVisible(): boolean {
  const btn = getButton();
  const container = document.getElementById(
    "mcx-return-to-last-read-container",
  );
  return !!btn && !!container && container.style.display !== "none";
}

function getToast(): HTMLElement | null {
  return document.getElementById("mcx-return-to-last-read-toast");
}

function getContainer(): HTMLElement | null {
  return document.getElementById("mcx-return-to-last-read-container");
}

function getCloseButton(): HTMLButtonElement | null {
  return document.getElementById(
    "mcx-return-to-last-read-close",
  ) as HTMLButtonElement | null;
}

async function importReturnToLastRead(
  options: {
    enabled?: boolean;
    triggerReload?: ReturnType<typeof vi.fn> | null;
  } = {},
): Promise<{ triggerReloadMock: ReturnType<typeof vi.fn> | null }> {
  vi.resetModules();
  delete (window as unknown as { __mcxDomObserver?: unknown }).__mcxDomObserver;

  const triggerReloadMock =
    options.triggerReload === null ? null : (options.triggerReload ?? vi.fn());
  window.__multiColumnX = (
    triggerReloadMock ? { triggerReload: triggerReloadMock } : {}
  ) as MultiColumnXAPI;
  window.__multiColumnXConfig = {
    returnToLastReadEnabled: options.enabled ?? false,
  } as MultiColumnXConfig;

  await import("./return_to_last_read");
  return { triggerReloadMock };
}

describe("inject/return_to_last_read", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    history.replaceState(null, "", "/home");
    setScrollTop(0);
  });

  afterEach(() => {
    createdObservers.forEach((observer) => observer.disconnect());
    createdObservers.clear();
    addedListeners.forEach(({ type, listener, options }) => {
      window.removeEventListener(type, listener, options);
    });
    addedListeners.length = 0;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("設定の即時反映", () => {
    it("設定を切り替えて適用するとカラムを読み込み直さずに反映される", async () => {
      const tablist = addTablist();
      addTab(tablist, "おすすめ", true);
      const section = addSection();
      setTimeline(section, ["1", "2", "3", "4", "5", "6", "7"]);

      // 初期 OFF で読み込み
      await importReturnToLastRead({ enabled: false });
      expect(isButtonVisible()).toBe(false);

      // 有効化して適用（WebView を作り直さない = setReturnToLastReadEnabled を呼ぶだけ。
      // 有効化と同時に先頭スナップショットが即時取り込まれる）
      window.__multiColumnX.setReturnToLastReadEnabled?.(true);
      // 更新して基準を記録
      window.__multiColumnX.triggerReload?.();
      // 新着が入る
      setTimeline(section, ["100", "1", "2", "3", "4"]);
      window.dispatchEvent(new Event("scroll"));

      expect(isButtonVisible()).toBe(true);

      // 無効化すると消え、基準も破棄される
      window.__multiColumnX.setReturnToLastReadEnabled?.(false);
      expect(isButtonVisible()).toBe(false);

      // 再度有効化しても、破棄された旧基準（1〜5）に基づく新着表示は起きない
      window.__multiColumnX.setReturnToLastReadEnabled?.(true);
      setTimeline(section, ["200", "1", "2", "3", "4"]);
      window.dispatchEvent(new Event("scroll"));

      expect(isButtonVisible()).toBe(false);
    });

    it("有効化した直後に更新しても先頭の投稿が基準として記録される", async () => {
      const tablist = addTablist();
      addTab(tablist, "おすすめ", true);
      const section = addSection();
      setTimeline(section, ["11", "12", "13", "14", "15"]);

      // 初期 OFF で読み込み（初期状態では先頭スナップショットは取り込まれない）
      await importReturnToLastRead({ enabled: false });

      // 有効化直後、DOM変化が一度も起きないまま更新する
      window.__multiColumnX.setReturnToLastReadEnabled?.(true);
      window.__multiColumnX.triggerReload?.();

      // 新着が入る
      setTimeline(section, ["100", "11", "12", "13", "14"]);
      window.dispatchEvent(new Event("scroll"));

      expect(isButtonVisible()).toBe(true);
    });

    it("triggerReloadが存在しない状態で読み込んでも例外にならない", async () => {
      addTablist();
      addSection();

      await expect(
        importReturnToLastRead({ enabled: true, triggerReload: null }),
      ).resolves.not.toThrow();
      expect(() =>
        window.__multiColumnX.setReturnToLastReadEnabled?.(true),
      ).not.toThrow();
    });
  });

  describe("設定OFF時の表示", () => {
    it("設定がOFFのときは更新で新着が入っても戻るボタンが表示されない", async () => {
      const tablist = addTablist();
      addTab(tablist, "おすすめ", true);
      const section = addSection();
      setTimeline(section, ["1", "2", "3", "4", "5"]);

      await importReturnToLastRead({ enabled: false });

      window.__multiColumnX.triggerReload?.();
      setTimeline(section, ["100", "1", "2", "3", "4"]);
      window.dispatchEvent(new Event("scroll"));

      expect(isButtonVisible()).toBe(false);
    });
  });

  describe("基準の記録", () => {
    it("更新の直前に先頭から広告を除いた最大5件の投稿を基準として記録する", async () => {
      const tablist = addTablist();
      addTab(tablist, "おすすめ", true);
      const section = addSection();
      // 先頭にいる状態で 7 件表示（先頭5件が基準候補になる）
      setTimeline(section, ["1", "2", "3", "4", "5", "6", "7"]);

      const { triggerReloadMock } = await importReturnToLastRead({
        enabled: true,
      });

      // triggerReload(true) が実行される瞬間、DOM は仮想リストで深い位置の内容
      // （基準にならないはずの別の投稿群）しか表示していない状態を模す。
      setScrollTop(500);
      setTimeline(section, ["901", "902", "903"]);

      window.__multiColumnX.triggerReload?.(true);

      expect(triggerReloadMock).toHaveBeenCalledWith(true);

      // 更新後、先頭が「最後に先頭で見た並び」と完全一致するなら新着扱いにならない
      // （もし深い位置の内容 901/902/903 が誤って基準にされていたら、以下は新着扱いされ
      // 　ボタンが表示されてしまう）
      setScrollTop(0);
      setTimeline(section, ["1", "2", "3", "4", "5"]);
      window.dispatchEvent(new Event("scroll"));

      expect(isButtonVisible()).toBe(false);
    });

    it("先頭へ戻した直後に深い位置のセルしか描画されていないときは基準の候補を更新しない", async () => {
      const tablist = addTablist();
      addTab(tablist, "おすすめ", true);
      const section = addSection();
      setTimeline(section, ["11", "12", "13", "14", "15"]);

      await importReturnToLastRead({ enabled: true });
      window.__multiColumnX.triggerReload?.();
      // この時点で基準は [11..15]、先頭に新着も無いのでボタンは非表示のまま。
      expect(isButtonVisible()).toBe(false);

      // triggerReload(true) で scrollTop は 0 になった直後だが、仮想リストはまだ
      // 深い位置のセル（translateY が 0px でない）しか描画できていない状態を模す。
      setScrollTop(0);
      setTimeline(section, ["901", "902", "903"]);
      setCellTransforms(section, "translateY(1200px)");
      window.dispatchEvent(new Event("scroll"));

      // 先頭セル未描画のときに誤って [901,902,903] を先頭候補として取り込むと、
      // 基準 [11..15] と比較して新着扱い（hasNewPostsAbove）となりボタンが
      // 一瞬誤表示されてしまう。ここでは表示されないことを確認する。
      expect(isButtonVisible()).toBe(false);
    });

    it("自動更新がスクロール中に呼ばれても、基準が未消化なら基準は変わらない", async () => {
      const tablist = addTablist();
      addTab(tablist, "おすすめ", true);
      const section = addSection();
      setTimeline(section, ["1", "2", "3", "4", "5"]);

      await importReturnToLastRead({ enabled: true });

      window.__multiColumnX.triggerReload?.();

      // ユーザーがスクロールしている最中に自動更新の triggerReload() が再度呼ばれる。
      // この時点で先頭のスナップショットが（本来ありえないが）別の内容に変わっていても、
      // 基準が未消化（consumed=false）なので上書きされてはならない。
      setScrollTop(0);
      setTimeline(section, ["901", "902", "903", "904", "905"]);
      window.dispatchEvent(new Event("scroll")); // topSnapshot を 901... に更新させる
      setScrollTop(300); // スクロール中
      window.__multiColumnX.triggerReload?.();

      // 基準が元の 1〜5 のまま保たれていれば、先頭が 1〜5 のままの更新では新着扱いされない
      setScrollTop(0);
      setTimeline(section, ["1", "2", "3", "4", "5"]);
      window.dispatchEvent(new Event("scroll"));

      expect(isButtonVisible()).toBe(false);
    });

    it("ラップ後も元のtriggerReloadが同じ引数で1回ずつ呼ばれる", async () => {
      addTablist();
      addSection();
      const { triggerReloadMock } = await importReturnToLastRead({
        enabled: true,
      });

      window.__multiColumnX.triggerReload?.();
      window.__multiColumnX.triggerReload?.(true);

      expect(triggerReloadMock).toHaveBeenCalledTimes(2);
      expect(triggerReloadMock).toHaveBeenNthCalledWith(1, undefined);
      expect(triggerReloadMock).toHaveBeenNthCalledWith(2, true);
    });
  });

  describe("タブ切り替え", () => {
    it("別のタブに切り替えると基準が破棄される", async () => {
      const tablist = addTablist();
      addTab(tablist, "おすすめ", true);
      const section = addSection();
      setTimeline(section, ["1", "2", "3", "4", "5"]);

      await importReturnToLastRead({ enabled: true });
      window.__multiColumnX.triggerReload?.();

      // 新着が入れば表示されることを一度確認しておく
      setTimeline(section, ["100", "1", "2", "3", "4"]);
      window.dispatchEvent(new Event("scroll"));
      expect(isButtonVisible()).toBe(true);

      // 別タブへ切り替え
      selectOnlyTab(tablist, "フォロー中");
      setTimeline(section, ["200", "300"]);
      window.dispatchEvent(new Event("scroll"));

      expect(isButtonVisible()).toBe(false);

      // 破棄後は、旧基準に対して新着扱いになるはずだった並びを戻しても表示されない
      setTimeline(section, ["100", "1", "2", "3", "4"]);
      window.dispatchEvent(new Event("scroll"));
      expect(isButtonVisible()).toBe(false);
    });

    it("タブバーが一時的に見つからないときは基準を破棄しない", async () => {
      const tablist = addTablist();
      addTab(tablist, "おすすめ", true);
      const section = addSection();
      setTimeline(section, ["11", "12", "13", "14", "15"]);

      await importReturnToLastRead({ enabled: true });
      window.__multiColumnX.triggerReload?.();

      // タブバーが再描画中で一時的に見つからない（currentTabName() が null になる）状態を模す。
      tablist.innerHTML = "";
      window.dispatchEvent(new Event("scroll"));

      // タブが復帰する
      addTab(tablist, "おすすめ", true);

      // 基準が破棄されていなければ、基準に無い内容が先頭に来たとき新着扱いされ
      // ボタンが表示される（基準が破棄されていた場合は anchorIds が null のため
      // topUpdated が無視され、ボタンは表示されないままになる）。
      setTimeline(section, ["21", "22", "23", "24", "25"]);
      window.dispatchEvent(new Event("scroll"));

      expect(isButtonVisible()).toBe(true);
    });
  });

  describe("新着検知でのボタン表示", () => {
    it("更新で基準より上に新しい投稿が入ったとき戻るボタンが表示される", async () => {
      const tablist = addTablist();
      addTab(tablist, "おすすめ", true);
      const section = addSection();
      setTimeline(section, ["1", "2", "3", "4", "5"]);

      await importReturnToLastRead({ enabled: true });
      window.__multiColumnX.triggerReload?.();

      setTimeline(section, ["100", "1", "2", "3", "4"]);
      window.dispatchEvent(new Event("scroll"));

      const btn = getButton();
      expect(btn).not.toBeNull();
      expect(btn?.style.display).not.toBe("none");
      expect(btn?.textContent).toBe("↓ 前回の続きへ");
      expect(btn?.getAttribute("aria-label")).toBe("前回の続きへ戻る");
    });
  });

  describe("閉じるボタン", () => {
    it("戻るボタンが表示されているときはその隣に閉じるボタンが表示される", async () => {
      const tablist = addTablist();
      addTab(tablist, "おすすめ", true);
      const section = addSection();
      setTimeline(section, ["1", "2", "3", "4", "5"]);

      await importReturnToLastRead({ enabled: true });
      window.__multiColumnX.triggerReload?.();

      setTimeline(section, ["100", "1", "2", "3", "4"]);
      window.dispatchEvent(new Event("scroll"));

      expect(isButtonVisible()).toBe(true);
      const container = getContainer();
      const btn = getButton();
      const closeBtn = getCloseButton();
      expect(container).not.toBeNull();
      expect(closeBtn).not.toBeNull();
      expect(container?.contains(btn as Node)).toBe(true);
      expect(container?.contains(closeBtn as Node)).toBe(true);
      expect(btn?.nextElementSibling).toBe(closeBtn);
      expect(closeBtn?.style.display).not.toBe("none");
      expect(closeBtn?.getAttribute("aria-label")).toBe(
        "前回の続きへ戻るボタンを閉じる",
      );
    });

    it("閉じるボタンを押すと戻らずにボタンが消える", async () => {
      const tablist = addTablist();
      addTab(tablist, "おすすめ", true);
      const section = addSection();
      setTimeline(section, ["1", "2", "3", "4", "5"]);

      await importReturnToLastRead({ enabled: true });
      window.__multiColumnX.triggerReload?.();

      setTimeline(section, ["100", "1", "2", "3", "4"]);
      window.dispatchEvent(new Event("scroll"));
      expect(isButtonVisible()).toBe(true);

      setScrollTop(42);
      const closeBtn = getCloseButton();
      closeBtn?.click();

      expect(document.scrollingElement?.scrollTop).toBe(42);
      expect(isButtonVisible()).toBe(false);
    });

    it("閉じるボタンで閉じた後の更新では新しい基準を記録する", async () => {
      const tablist = addTablist();
      addTab(tablist, "おすすめ", true);
      const section = addSection();
      setTimeline(section, ["1", "2", "3", "4", "5"]);

      await importReturnToLastRead({ enabled: true });
      window.__multiColumnX.triggerReload?.();

      setTimeline(section, ["100", "1", "2", "3", "4"]);
      window.dispatchEvent(new Event("scroll"));
      expect(isButtonVisible()).toBe(true);

      getCloseButton()?.click();
      expect(isButtonVisible()).toBe(false);

      // 先頭が N1, N2, A, B, C の順になっている状態で更新する
      setScrollTop(0);
      setTimeline(section, ["n1", "n2", "1", "2", "3"]);
      window.dispatchEvent(new Event("scroll"));
      window.__multiColumnX.triggerReload?.();

      // 新しい基準（N1, N2, A, B, C）と完全一致する並びでは新着扱いされない
      // （もし基準が更新されておらず旧基準のままなら新着扱いされてしまう）
      setTimeline(section, ["n1", "n2", "1", "2", "3"]);
      window.dispatchEvent(new Event("scroll"));
      expect(isButtonVisible()).toBe(false);
    });

    it("戻る位置を探している間は閉じるボタンを押せない", async () => {
      const tablist = addTablist(53);
      addTab(tablist, "おすすめ", true);
      const section = addSection();
      setTimeline(section, ["11", "12", "13", "14", "15"]);

      await importReturnToLastRead({ enabled: true });
      window.__multiColumnX.triggerReload?.();

      setTimeline(section, ["101", "11", "12", "13", "14"]);
      window.dispatchEvent(new Event("scroll"));
      expect(isButtonVisible()).toBe(true);
      expect(getCloseButton()?.disabled).toBe(false);

      // 探索対象がどこにもヒットしないタイムラインへ変え、これ以上スクロールできない
      // 状態（仮想リスト終端）を模す。探索中は打ち切りまで待たずに disabled を確認する。
      setTimeline(section, ["901"]);
      setClampedScrollingElement(300, 300);

      vi.useFakeTimers();
      const btn = getButton();
      btn?.click();
      await vi.advanceTimersByTimeAsync(0);

      // 探索中は閉じるボタンを押せない
      expect(getCloseButton()?.disabled).toBe(true);

      // クリックしても消化されない（無効化されているため、実際のブラウザでは
      // クリックイベント自体が発火しないが、ここでは disabled 状態のみ検証する）
      await vi.advanceTimersByTimeAsync(3300);
    }, 15000);
  });

  describe("/home以外のパス", () => {
    it("/home以外のpathnameではボタンが表示されない", async () => {
      const tablist = addTablist();
      addTab(tablist, "おすすめ", true);
      const section = addSection();
      setTimeline(section, ["1", "2", "3", "4", "5"]);

      await importReturnToLastRead({ enabled: true });
      window.__multiColumnX.triggerReload?.();

      history.replaceState(null, "", "/notifications");
      setTimeline(section, ["100", "1", "2", "3", "4"]);
      window.dispatchEvent(new Event("scroll"));

      expect(isButtonVisible()).toBe(false);
    });
  });

  describe("ユーザースクロールによる消化", () => {
    // extractArticleStatusId は href の数字部分しか status ID として拾わないため
    // （auto_reload.ts と同じ規則）、ここでは基準・新着とも数字文字列の ID を使う。
    // 基準: 11(A)〜16(F)、新着: 101(N1)。
    it("自分でスクロールして基準投稿を画面に表示すると戻るボタンが消える", async () => {
      const tablist = addTablist(53);
      addTab(tablist, "おすすめ", true);
      const section = addSection();
      setTimeline(section, ["11", "12", "13", "14", "15", "16"]);

      await importReturnToLastRead({ enabled: true });
      window.__multiColumnX.triggerReload?.();

      // 新着が先頭に入る
      setTimeline(section, ["101", "11", "12", "13", "14"]);
      window.dispatchEvent(new Event("scroll"));
      expect(isButtonVisible()).toBe(true);

      // ユーザーがキー操作でスクロールし、基準内で連続する2件 "11","12"（scanReturnTarget が
      // run と判定するための最小構成）が画面内（headerOffset=53 <= top < innerHeight）に入る。
      // "11" 単独では scanReturnTarget は "run" ではなく "none"（singles）を返し、
      // targetSeenByUser は run のときしか dispatch されない仕様のため、隣接する "12" も必要。
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
      setScrollTop(200);
      setTimeline(section, ["101", "11", "12", "13", "14"], { topStep: 200 });
      const articles = section.querySelectorAll("article");
      setElementRect(articles[0], { top: -100 }); // 101: 画面外（上）
      setElementRect(articles[1], { top: 100 }); // 11: 画面内
      setElementRect(articles[2], { top: 300 }); // 12: 画面内

      window.dispatchEvent(new Event("scroll"));

      expect(isButtonVisible()).toBe(false);
    });

    it("ユーザー入力の無いスクロール（自前のscrollTop代入）では消化されない", async () => {
      const tablist = addTablist(53);
      addTab(tablist, "おすすめ", true);
      const section = addSection();
      setTimeline(section, ["11", "12", "13", "14", "15"]);

      await importReturnToLastRead({ enabled: true });
      window.__multiColumnX.triggerReload?.();

      setTimeline(section, ["101", "11", "12", "13", "14"]);
      window.dispatchEvent(new Event("scroll"));
      expect(isButtonVisible()).toBe(true);

      // ユーザー入力を発火させずに scrollTop だけ変え、基準先頭 "11" を画面内に置く
      setScrollTop(200);
      section.innerHTML = "";
      setTimeline(section, ["101", "11", "12", "13", "14"], { topStep: 200 });
      // "11" (index1) の top を viewport 内に上書き
      const articleA = section.querySelectorAll("article")[1];
      setElementRect(articleA, { top: 100 });
      window.dispatchEvent(new Event("scroll"));

      // ユーザー入力が無いため消化されず、ボタンは表示されたまま
      expect(isButtonVisible()).toBe(true);
    });

    it("自分でスクロールして基準投稿を画面に表示した後の更新では新しい基準を記録する", async () => {
      const tablist = addTablist(53);
      addTab(tablist, "おすすめ", true);
      const section = addSection();
      setTimeline(section, ["11", "12", "13", "14", "15"]);

      await importReturnToLastRead({ enabled: true });
      window.__multiColumnX.triggerReload?.();

      setTimeline(section, ["101", "11", "12", "13", "14"]);
      window.dispatchEvent(new Event("scroll"));
      expect(isButtonVisible()).toBe(true);

      // ユーザー操作で "11" を画面内に表示 → 消化される
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
      setScrollTop(200);
      section.innerHTML = "";
      setTimeline(section, ["101", "11", "12", "13", "14"], { topStep: 200 });
      const articleA = section.querySelectorAll("article")[1];
      setElementRect(articleA, { top: 100 });
      window.dispatchEvent(new Event("scroll"));
      expect(isButtonVisible()).toBe(false);

      // 先頭に戻って更新すると、新しい基準（21〜25）が記録される
      setScrollTop(0);
      setTimeline(section, ["21", "22", "23", "24", "25"]);
      window.dispatchEvent(new Event("scroll"));
      window.__multiColumnX.triggerReload?.();

      // 新しい基準と完全一致する並びでは新着扱いされない
      // （もし基準が更新されておらず旧基準 11〜15 のままなら、21〜25 は新着扱いされてしまう）
      setTimeline(section, ["21", "22", "23", "24", "25"]);
      window.dispatchEvent(new Event("scroll"));
      expect(isButtonVisible()).toBe(false);
    });
  });

  describe("探索: 見つからない場合", () => {
    it("基準の投稿がすべて見つからないときは元の位置に戻して見つからなかったことを表示する", async () => {
      // vi.useFakeTimers() は import（vite-node の動的 import 解決）を巻き込むと
      // 内部の実タイマー待ちがフェイク化されて解決しなくなるため、
      // import・DOM構築等の実時間処理を終えたあと、クリック直前で切り替える。
      const tablist = addTablist(53);
      addTab(tablist, "おすすめ", true);
      const section = addSection();
      setTimeline(section, ["11", "12", "13", "14", "15"]);

      await importReturnToLastRead({ enabled: true });
      window.__multiColumnX.triggerReload?.();

      // 新着が入りボタンが表示される
      setTimeline(section, ["101", "11", "12", "13", "14"]);
      window.dispatchEvent(new Event("scroll"));
      expect(isButtonVisible()).toBe(true);

      // 探索対象（11〜15）がどこにもヒットしないタイムラインに変え、
      // スクロール可能範囲を現在位置（300）でクランプする（＝これ以上進めない仮想リスト終端）
      setTimeline(section, ["901"]);
      setClampedScrollingElement(300, 300);

      vi.useFakeTimers();
      const btn = getButton();
      btn?.click();

      // クリック直後は探索中表示になる
      await vi.advanceTimersByTimeAsync(0);
      expect(btn?.textContent).toBe("探しています…");
      expect(btn?.disabled).toBe(true);

      // 探索の所要時間（初回待ち80ms + ステップ80ms×2 + 末尾での追加読み込み待ち上限3000ms）
      // だけ進める。vi.runAllTimersAsync() だとトースト非表示用の3000msタイマーまで
      // 一緒に消化してしまい、「見つからない表示」の検証ができなくなるため使わない。
      await vi.advanceTimersByTimeAsync(3300);

      // 元の位置（300）に戻っている
      expect(document.scrollingElement?.scrollTop).toBe(300);
      // トーストが表示される
      const toast = getToast();
      expect(toast).not.toBeNull();
      expect(toast?.getAttribute("role")).toBe("status");
      expect(toast?.textContent).toBe("前回の位置が見つかりませんでした");
      expect(toast?.style.display).not.toBe("none");
      // ボタンは消える
      expect(isButtonVisible()).toBe(false);

      // 3000ms 経過するとトーストも消える
      await vi.advanceTimersByTimeAsync(3000);
      expect(toast?.style.display).toBe("none");
    }, 15000);
  });
});
