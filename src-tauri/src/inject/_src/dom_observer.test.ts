// dom_observer.ts は IIFE のため import 時に実行され、window.__mcxDomObserver を公開する。
// MutationObserver 通知は「マイクロタスク → requestAnimationFrame」を経て購読者へ届くため、
// 実際に rAF の発火を待ってから検証する（blur_image.test.ts と同じ方式）。
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// small_image.test.ts / blur_image.test.ts と同様に、生成された MutationObserver を
// 追跡して各テスト後に確実に disconnect する（dom_observer.ts 自身は disconnect 手段を
// 公開しない常駐前提のため）。
const createdObservers = new Set<MutationObserver>();
const OriginalMutationObserver = globalThis.MutationObserver;

class TrackingMutationObserver extends OriginalMutationObserver {
  constructor(callback: MutationCallback) {
    super(callback);
    createdObservers.add(this);
  }
}
vi.stubGlobal("MutationObserver", TrackingMutationObserver);

async function importDomObserver(): Promise<void> {
  await import("./dom_observer");
}

/** requestAnimationFrame の発火を待つ。 */
function waitForAnimationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

describe("inject/dom_observer", () => {
  beforeEach(() => {
    vi.resetModules();
    delete (window as unknown as { __mcxDomObserver?: unknown })
      .__mcxDomObserver;
    document.body.innerHTML = "";
  });

  afterEach(() => {
    createdObservers.forEach((observer) => observer.disconnect());
    createdObservers.clear();
  });

  it("同一フレーム内の複数のDOM変化は購読者へ1回にまとめて通知される", async () => {
    await importDomObserver();
    const callback = vi.fn();
    window.__mcxDomObserver!.subscribe(callback);

    document.body.appendChild(document.createElement("div"));
    document.body.appendChild(document.createElement("span"));

    await waitForAnimationFrame();

    expect(callback).toHaveBeenCalledTimes(1);
    const mutations = callback.mock.calls[0][0] as MutationRecord[];
    expect(mutations.length).toBeGreaterThanOrEqual(2);
  });

  it("購読解除した購読者には通知されない", async () => {
    await importDomObserver();
    const callback = vi.fn();
    const unsubscribe = window.__mcxDomObserver!.subscribe(callback);
    unsubscribe();

    document.body.appendChild(document.createElement("div"));

    await waitForAnimationFrame();

    expect(callback).not.toHaveBeenCalled();
  });

  it("購読者が例外を投げても他の購読者には通知される", async () => {
    await importDomObserver();
    const throwingCallback = vi.fn(() => {
      throw new Error("boom");
    });
    const normalCallback = vi.fn();
    window.__mcxDomObserver!.subscribe(throwingCallback);
    window.__mcxDomObserver!.subscribe(normalCallback);

    document.body.appendChild(document.createElement("div"));

    await waitForAnimationFrame();

    expect(throwingCallback).toHaveBeenCalledTimes(1);
    expect(normalCallback).toHaveBeenCalledTimes(1);
  });

  it("二重に初期化しても監視は1本だけ作られる", async () => {
    await importDomObserver();
    const firstHub = window.__mcxDomObserver;

    // 多重注入を模して同じグローバルが残った状態で再度 import する
    vi.resetModules();
    await importDomObserver();

    expect(window.__mcxDomObserver).toBe(firstHub);
    expect(createdObservers.size).toBe(1);
  });
});
