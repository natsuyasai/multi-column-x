// mobile_area_hide.ts は IIFE のため import 時に実行される。
// applyHeaderHeightSync() は import 時（setup() 内の apply()）に即時実行される他、
// MutationObserver 経由の DOM 変化検知（100ms デバウンス）でも再適用される。
// 公開 API が無いため、各テストは「import した／DOM を変化させた結果の副作用」として検証する。
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// mobile_area_hide.ts は DOM 変化を監視し続ける MutationObserver を import のたびに
// 新規登録し、自身を disconnect する手段を公開しない（ページ常駐前提）。
// vi.resetModules で再 import するテストでは前のテストの observer が残り、
// 後続テストの DOM 変更にも反応してしまうため、生成された observer を追跡し
// 各テスト後に確実に disconnect する（small_image.test.ts / tab_selector.test.ts と同じ対策）。
const createdObservers = new Set<MutationObserver>();
const OriginalMutationObserver = globalThis.MutationObserver;

class TrackingMutationObserver extends OriginalMutationObserver {
  constructor(callback: MutationCallback) {
    super(callback);
    createdObservers.add(this);
  }
}
vi.stubGlobal("MutationObserver", TrackingMutationObserver);

function addHeader(): HTMLElement {
  const header = document.createElement("header");
  header.setAttribute("role", "banner");
  document.body.appendChild(header);
  return header;
}

function addTablist(height: number): HTMLElement {
  const tablist = document.createElement("div");
  tablist.setAttribute("role", "tablist");
  Object.defineProperty(tablist, "offsetHeight", {
    value: height,
    configurable: true,
  });
  document.body.appendChild(tablist);
  return tablist;
}

function setConfig(config: Partial<MultiColumnXConfig>): void {
  window.__multiColumnXConfig = config as MultiColumnXConfig;
}

// #layers > (position:absolute な子2つを持つ div) という、applyLayersHide が
// 検出対象とする実DOM相当の最小構成を組み立てる。
// composeButton は投稿ボタン（a[href="/compose/post"]を子孫に持つ）、
// bottomBar はそれ以外のヘッダー要素（Home等のナビリンク）を模している。
function addLayersTarget(): {
  composeButton: HTMLElement;
  bottomBar: HTMLElement;
} {
  const layers = document.createElement("div");
  layers.id = "layers";
  document.body.appendChild(layers);

  const target = document.createElement("div");
  target.id = "target";
  layers.appendChild(target);

  const composeButton = document.createElement("div");
  composeButton.id = "composeButton";
  composeButton.style.position = "absolute";
  composeButton.innerHTML = '<a href="/compose/post">ポストを作成</a>';
  target.appendChild(composeButton);

  const bottomBar = document.createElement("div");
  bottomBar.id = "bottomBar";
  bottomBar.style.position = "absolute";
  bottomBar.innerHTML = '<a href="/home">ホーム</a>';
  target.appendChild(bottomBar);

  return { composeButton, bottomBar };
}

async function importMobileAreaHide(): Promise<void> {
  vi.resetModules();
  await import("./mobile_area_hide");
}

// apply() の再実行は MutationObserver 通知（マイクロタスク）→ 100ms デバウンス
// を経るため、実タイマーで十分に待ってから検証する。
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("inject/mobile_area_hide のapplyHeaderHeightSync", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    createdObservers.forEach((observer) => observer.disconnect());
    createdObservers.clear();
  });

  it("headerが存在しない場合は何もしない", async () => {
    addTablist(40);

    await importMobileAreaHide();

    const header = document.querySelector("header[role='banner']");
    expect(header).toBeNull();
  });

  it("tablistが存在しない場合は何もしない", async () => {
    const header = addHeader();

    await importMobileAreaHide();

    expect(header.style.height).toBe("");
  });

  it("tablistのoffsetheightが0の場合は何もしない", async () => {
    const header = addHeader();
    addTablist(0);

    await importMobileAreaHide();

    expect(header.style.height).toBe("");
  });

  it("tablistのoffsetheightがheaderのstyle.heightにimportant付きで反映される", async () => {
    const header = addHeader();
    addTablist(40);

    await importMobileAreaHide();

    expect(header.style.height).toBe("40px");
    expect(header.style.getPropertyPriority("height")).toBe("important");
  });

  it("既に同じ高さが設定されている場合はsetpropertyを再度呼ばない", async () => {
    const header = addHeader();
    addTablist(40);

    await importMobileAreaHide();
    expect(header.style.height).toBe("40px");

    const setPropertySpy = vi.spyOn(header.style, "setProperty");

    // DOM に変化を起こし MutationObserver 経由の再適用をトリガーするが、
    // tablist の高さは変わっていないため setProperty は呼ばれないはず
    document.body.appendChild(document.createElement("div"));
    await wait(150);

    expect(setPropertySpy).not.toHaveBeenCalled();
    expect(header.style.height).toBe("40px");
  });

  it("setup経由でMutationObserverによるDOM変化時にも再適用される", async () => {
    const header = addHeader();
    const tablist = addTablist(40);

    await importMobileAreaHide();
    expect(header.style.height).toBe("40px");

    // tablist の高さを変更してから DOM に変化を起こし、再適用をトリガーする
    Object.defineProperty(tablist, "offsetHeight", {
      value: 60,
      configurable: true,
    });
    document.body.appendChild(document.createElement("div"));

    await vi.waitFor(() => {
      expect(header.style.height).toBe("60px");
    });
  });
});

describe("inject/mobile_area_hide のapplyLayersHide", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    delete window.__multiColumnXConfig;
  });

  afterEach(() => {
    createdObservers.forEach((observer) => observer.disconnect());
    createdObservers.clear();
  });

  it("hideTweetInputEnabledがtrueのとき投稿ボタン要素を非表示にする", async () => {
    setConfig({ hideTweetInputEnabled: true, hideHeaderEnabled: false });
    const { composeButton } = addLayersTarget();

    await importMobileAreaHide();

    expect(composeButton.style.display).toBe("none");
    expect(composeButton.style.getPropertyPriority("display")).toBe(
      "important",
    );
  });

  it("hideTweetInputEnabledがfalseのとき投稿ボタン要素を非表示にしない", async () => {
    setConfig({ hideTweetInputEnabled: false, hideHeaderEnabled: false });
    const { composeButton } = addLayersTarget();

    await importMobileAreaHide();

    expect(composeButton.style.display).toBe("");
  });

  it("hideHeaderEnabledがtrueのとき投稿ボタン以外の要素を非表示にする", async () => {
    setConfig({ hideTweetInputEnabled: false, hideHeaderEnabled: true });
    const { bottomBar } = addLayersTarget();

    await importMobileAreaHide();

    expect(bottomBar.style.display).toBe("none");
    expect(bottomBar.style.getPropertyPriority("display")).toBe("important");
  });

  it("hideHeaderEnabledがfalseのとき投稿ボタン以外の要素を非表示にしない", async () => {
    setConfig({ hideTweetInputEnabled: false, hideHeaderEnabled: false });
    const { bottomBar } = addLayersTarget();

    await importMobileAreaHide();

    expect(bottomBar.style.display).toBe("");
  });

  it("両方falseのときどちらも非表示にしない", async () => {
    setConfig({ hideTweetInputEnabled: false, hideHeaderEnabled: false });
    const { composeButton, bottomBar } = addLayersTarget();

    await importMobileAreaHide();

    expect(composeButton.style.display).toBe("");
    expect(bottomBar.style.display).toBe("");
  });

  it("設定が未指定のときデフォルトで両方非表示にする", async () => {
    const { composeButton, bottomBar } = addLayersTarget();

    await importMobileAreaHide();

    expect(composeButton.style.display).toBe("none");
    expect(bottomBar.style.display).toBe("none");
  });

  it("position:absoluteな子要素が1つ以下のdivは対象外のまま", async () => {
    setConfig({ hideTweetInputEnabled: true, hideHeaderEnabled: true });

    const layers = document.createElement("div");
    layers.id = "layers";
    document.body.appendChild(layers);

    const target = document.createElement("div");
    target.id = "target";
    layers.appendChild(target);

    const onlyChild = document.createElement("div");
    onlyChild.id = "onlyChild";
    onlyChild.style.position = "absolute";
    onlyChild.innerHTML = '<a href="/compose/post">ポストを作成</a>';
    target.appendChild(onlyChild);

    await importMobileAreaHide();

    expect(onlyChild.style.display).toBe("");
  });
});
