// auto_reload.ts は IIFE のため、import 時に実行されて window.__multiColumnX に
// triggerReload が公開される。スクロール中スキップ・フォロー中タブの新着報告・
// 通常タブの再選択という 3 つの分岐を検証する。
// 一定間隔でのリロード実行自体は src/hooks/useAutoReload.ts（呼び出し元）の責務であり、
// この inject スクリプトは triggerReload() の 1 回分の振る舞いのみを担う。
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

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

function triggerReload(scrollToTop?: boolean): void {
  window.__multiColumnX.triggerReload(scrollToTop);
}

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
  });

  it("スクロール中は自動リロードをスキップする", () => {
    setScrolling(100);
    const tab = addTab(true, false);
    const clickSpy = vi.fn();
    tab.addEventListener("click", clickSpy);

    triggerReload();

    expect(clickSpy).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("フォロー中タブがアクティブな場合は新着ボタンをクリックし新着数をreport_new_posts_countで報告する", () => {
    addTab(true, true);
    const section = document.createElement("section");
    section.setAttribute("aria-labelledby", "timeline");
    document.body.appendChild(section);
    const btn = addNewPostsButton(section, "5 posts");
    const clickSpy = vi.fn();
    btn.addEventListener("click", clickSpy);

    triggerReload();

    expect(invokeMock).toHaveBeenCalledWith("report_new_posts_count", {
      label: "column-1",
      count: 5,
    });
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("新着数が数字なしの場合は1件として報告する", () => {
    addTab(true, true);
    const section = document.createElement("section");
    section.setAttribute("aria-labelledby", "timeline");
    document.body.appendChild(section);
    addNewPostsButton(section, "新しいポストを見る");

    triggerReload();

    expect(invokeMock).toHaveBeenCalledWith("report_new_posts_count", {
      label: "column-1",
      count: 1,
    });
  });

  it("フォロー中タブでない場合は選択中タブを再選択する", () => {
    const tab = addTab(true, false);
    const clickSpy = vi.fn();
    tab.addEventListener("click", clickSpy);

    triggerReload();

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("フォロー中タブがアクティブで新着ボタンが無い場合は何もしない", () => {
    // aria-selected かつ aria-expanded を持つタブがあると isFollowingTabActive が true になり、
    // reselectTab（通常タブの再選択）ではなく新着ボタン探索の分岐に進む。
    // section が無く新着ボタンも見つからないため、クリックも report も発生しない。
    const tab = addTab(true, true);
    const clickSpy = vi.fn();
    tab.addEventListener("click", clickSpy);

    triggerReload();

    expect(clickSpy).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("scrollToTopを指定するとスクロール位置を先頭に戻してから判定する", () => {
    setScrolling(300);
    const tab = addTab(true, false);
    const clickSpy = vi.fn();
    tab.addEventListener("click", clickSpy);

    triggerReload(true);

    expect(document.documentElement.scrollTop).toBe(0);
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("新着ボタンが後から追加された場合はMutationObserverで検知して報告する", async () => {
    addTab(true, true);
    const section = document.createElement("section");
    section.setAttribute("aria-labelledby", "timeline");
    document.body.appendChild(section);

    triggerReload();
    expect(invokeMock).not.toHaveBeenCalled();

    const btn = addNewPostsButton(section, "3 posts");
    const clickSpy = vi.fn();
    btn.addEventListener("click", clickSpy);

    await vi.waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("report_new_posts_count", {
        label: "column-1",
        count: 3,
      });
    });
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });
});
