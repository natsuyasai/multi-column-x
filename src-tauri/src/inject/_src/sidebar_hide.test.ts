// sidebar_hide.ts は IIFE のため import 時に実行される。
// apply() は import 時（setup() 内）に即時実行される他、MutationObserver 経由の
// DOM 変化検知（100ms デバウンス）でも再適用される。公開 API が無いため、
// 各テストは「import した／DOM を変化させた結果の副作用」として検証する。
//
// このテストは dom_observer ハブへの移行前の現状挙動を固定する特性テストとして
// 追加した（移行後もこのテストがグリーンのまま保たれることを確認する）。
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// mobile_area_hide.test.ts と同様に、MutationObserver が import のたびに新規登録され
// disconnect されないため、テスト間の汚染を防ぐために追跡・切断する。
const createdObservers = new Set<MutationObserver>();
const OriginalMutationObserver = globalThis.MutationObserver;

class TrackingMutationObserver extends OriginalMutationObserver {
  constructor(callback: MutationCallback) {
    super(callback);
    createdObservers.add(this);
  }
}
vi.stubGlobal("MutationObserver", TrackingMutationObserver);

const SIDEBAR_SELECTOR = 'div[data-testid="sidebarColumn"]';
const PRIMARY_SELECTOR = 'div[data-testid="primaryColumn"]';

function addSidebar(): HTMLElement {
  const sidebar = document.createElement("div");
  sidebar.dataset.testid = "sidebarColumn";
  document.body.appendChild(sidebar);
  return sidebar;
}

function addPrimary(): HTMLElement {
  const primary = document.createElement("div");
  primary.dataset.testid = "primaryColumn";
  document.body.appendChild(primary);
  return primary;
}

async function importSidebarHide(): Promise<void> {
  vi.resetModules();
  await import("./sidebar_hide");
}

// apply() の再実行は MutationObserver 通知（マイクロタスク）→ 100ms デバウンスを
// 経るため、実タイマーで十分に待ってから検証する（mobile_area_hide.test.ts と同じ方式）。
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("inject/sidebar_hide のapply", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    createdObservers.forEach((observer) => observer.disconnect());
    createdObservers.clear();
  });

  it("sidebarColumnをdisplay:noneで非表示にする", async () => {
    const sidebar = addSidebar();
    addPrimary();

    await importSidebarHide();

    expect(sidebar.style.display).toBe("none");
    expect(sidebar.style.getPropertyPriority("display")).toBe("important");
  });

  it("primaryColumnが存在しない場合でもsidebarColumnは非表示にする", async () => {
    const sidebar = addSidebar();

    await importSidebarHide();

    expect(sidebar.style.display).toBe("none");
  });

  it("sidebarColumnが存在しない場合は何もしない", async () => {
    addPrimary();

    await expect(importSidebarHide()).resolves.not.toThrow();
    expect(document.querySelector(SIDEBAR_SELECTOR)).toBeNull();
  });

  it("primaryColumnのmaxWidthを100%にする", async () => {
    addSidebar();
    const primary = addPrimary();

    await importSidebarHide();

    expect(primary.style.maxWidth).toBe("100%");
  });

  it("primaryColumnが存在しない場合はmaxWidthの拡張を行わない（早期return）", async () => {
    addSidebar();

    await expect(importSidebarHide()).resolves.not.toThrow();
  });

  it("primaryColumn配下のmaxWidthがpx指定のdiv要素をmaxWidth100%に広げる", async () => {
    addSidebar();
    const primary = addPrimary();
    const child = document.createElement("div");
    Object.defineProperty(child, "style", {
      value: { maxWidth: "600px" },
      configurable: true,
    });
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      (el: Element) =>
        ({
          maxWidth: (el as HTMLElement).style.maxWidth,
          width: "",
        }) as CSSStyleDeclaration,
    );
    primary.appendChild(child);

    await importSidebarHide();

    expect((child as HTMLElement).style.maxWidth).toBe("100%");
    vi.restoreAllMocks();
  });

  it("primaryColumn配下にSECTION要素があればそこで子孫探索を打ち切る", async () => {
    addSidebar();
    const primary = addPrimary();
    const section = document.createElement("section");
    const insideDiv = document.createElement("div");
    section.appendChild(insideDiv);
    primary.appendChild(section);
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      () => ({ maxWidth: "600px", width: "" }) as CSSStyleDeclaration,
    );

    await expect(importSidebarHide()).resolves.not.toThrow();
    // SECTION 配下は探索対象外のため、insideDiv の maxWidth は変更されない
    expect((insideDiv as HTMLElement).style.maxWidth).toBe("");
    vi.restoreAllMocks();
  });

  it("primaryColumnの祖先でwidthがpx指定のdiv要素をwidth100%に広げる", async () => {
    addSidebar();
    const main = document.createElement("main");
    const ancestorDiv = document.createElement("div");
    const primary = document.createElement("div");
    primary.dataset.testid = "primaryColumn";
    ancestorDiv.appendChild(primary);
    main.appendChild(ancestorDiv);
    document.body.appendChild(main);
    vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element) => {
      if (el === ancestorDiv) {
        return { width: "800px", maxWidth: "" } as CSSStyleDeclaration;
      }
      return { width: "", maxWidth: "" } as CSSStyleDeclaration;
    });

    await importSidebarHide();

    expect(ancestorDiv.style.width).toBe("100%");
    vi.restoreAllMocks();
  });

  it("祖先探索はMAIN要素に到達したら打ち切る", async () => {
    addSidebar();
    const outerDiv = document.createElement("div");
    const main = document.createElement("main");
    const primary = document.createElement("div");
    primary.dataset.testid = "primaryColumn";
    main.appendChild(primary);
    outerDiv.appendChild(main);
    document.body.appendChild(outerDiv);
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      () => ({ width: "800px", maxWidth: "" }) as CSSStyleDeclaration,
    );

    await importSidebarHide();

    // MAIN の外側にある outerDiv は祖先探索の対象外（MAIN で打ち切られる）
    expect(outerDiv.style.width).toBe("");
    vi.restoreAllMocks();
  });

  it("setup経由でMutationObserverによるDOM変化時にも再適用される", async () => {
    const sidebar = addSidebar();
    addPrimary();

    await importSidebarHide();
    expect(sidebar.style.display).toBe("none");

    // 一旦手動で表示に戻し、DOM に変化を起こして再適用（apply() の再実行）を確認する
    sidebar.style.display = "";
    document.body.appendChild(document.createElement("div"));

    await vi.waitFor(() => {
      expect(sidebar.style.display).toBe("none");
    });
  });

  it("短時間に複数回DOM変化が起きても100ms内なら1回のデバウンスにまとめられる", async () => {
    const sidebar = addSidebar();
    addPrimary();

    await importSidebarHide();
    sidebar.style.display = "";

    document.body.appendChild(document.createElement("div"));
    await wait(30);
    document.body.appendChild(document.createElement("div"));

    // まだデバウンス時間(100ms)未満なら再適用されていないはず
    expect(sidebar.style.display).toBe("");

    await vi.waitFor(() => {
      expect(sidebar.style.display).toBe("none");
    });
  });
});
