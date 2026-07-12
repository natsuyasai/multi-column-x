// @vitest-environment-options { "url": "https://x.com/" }
//
// tab_selector.ts は IIFE のため import 時に実行され、URL のクエリ（例:
// https://x.com/home?Following）からタブ名を読み取ってタブをクリックする。
// 公開 API は無く、実際の選択処理は import 時の initializeTab() と
// URL 変化検知（MutationObserver）が担う。そのため各テストは
// 「特定の URL で import したときの副作用」として検証する（vi.resetModules）。
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// tab_selector.ts は「URL 変更を検知し続ける」ための MutationObserver を
// import のたびに新規登録し、それ自身を disconnect する手段を公開しない
// （ページに常駐する前提の設計）。vi.resetModules で再 import するテストでは
// 前のテストの observer が残り続け、後続テストの DOM 操作をきっかけに
// テスト終了後まで発火してエラーになる。そのため生成された observer を
// 追跡し、各テスト後に確実に disconnect する。
const createdObservers = new Set<MutationObserver>();
const OriginalMutationObserver = globalThis.MutationObserver;

class TrackingMutationObserver extends OriginalMutationObserver {
  constructor(callback: MutationCallback) {
    super(callback);
    createdObservers.add(this);
  }
}
vi.stubGlobal("MutationObserver", TrackingMutationObserver);

function buildTabs(names: string[]): HTMLElement[] {
  const tablist = document.createElement("div");
  tablist.setAttribute("role", "tablist");
  document.body.appendChild(tablist);
  return names.map((name) => {
    const tab = document.createElement("div");
    tab.setAttribute("role", "tab");
    const span = document.createElement("span");
    span.textContent = name;
    tab.appendChild(span);
    tablist.appendChild(tab);
    return tab;
  });
}

async function importTabSelector(): Promise<void> {
  vi.resetModules();
  await import("./tab_selector");
}

describe("inject/tab_selector", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    createdObservers.forEach((observer) => observer.disconnect());
    createdObservers.clear();
  });

  it("指定タブ名に一致するタブをクリックする", async () => {
    history.pushState({}, "", "/home?Following");
    const [followingTab, forYouTab] = buildTabs(["Following", "For you"]);
    const followingClick = vi.fn();
    const forYouClick = vi.fn();
    followingTab.addEventListener("click", followingClick);
    forYouTab.addEventListener("click", forYouClick);

    await importTabSelector();

    expect(followingClick).toHaveBeenCalledTimes(1);
    expect(forYouClick).not.toHaveBeenCalled();
  });

  it("一致するタブがなければ何もしない", async () => {
    vi.useFakeTimers();
    try {
      history.pushState({}, "", "/home?Following");
      const [forYouTab] = buildTabs(["For you"]);
      const clickSpy = vi.fn();
      forYouTab.addEventListener("click", clickSpy);

      await importTabSelector();
      expect(clickSpy).not.toHaveBeenCalled();

      // ポーリング（300ms間隔）・10秒タイムアウトを経過しても一致しないため発火しない
      vi.advanceTimersByTime(10_000);

      expect(clickSpy).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("ホームURL以外では何もしない", async () => {
    history.pushState({}, "", "/bob?Following");
    const [followingTab] = buildTabs(["Following"]);
    const clickSpy = vi.fn();
    followingTab.addEventListener("click", clickSpy);

    await importTabSelector();

    expect(clickSpy).not.toHaveBeenCalled();
  });
});
