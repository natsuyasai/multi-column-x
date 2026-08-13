// blur_image.ts は IIFE のため import 時に実行される。
// window.__multiColumnXConfig はモジュールのトップレベルで一度だけ読み取られるため、
// 設定値ごとに vi.resetModules で再 import して検証する。
//
// ぼかし対象要素は「tweetPhoto / card.wrapper 内の div のうち background-image が
// url() を持ち、かつ同じ親の中に IMG 要素が兄弟として存在するもの」という特有の
// DOM 構造依存の判定（getBlurTargets）で決まる。X の実 DOM 構造そのものではなく、
// この判定ロジックを満たす最小限の合成 DOM を用意して検証する。
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// small_image.ts と同様に DOM 監視用 MutationObserver が import のたびに
// 新規登録され disconnect されないため、テスト間の汚染を防ぐために追跡・切断する。
const createdObservers = new Set<MutationObserver>();
const OriginalMutationObserver = globalThis.MutationObserver;

class TrackingMutationObserver extends OriginalMutationObserver {
  constructor(callback: MutationCallback) {
    super(callback);
    createdObservers.add(this);
  }
}
vi.stubGlobal("MutationObserver", TrackingMutationObserver);

function setConfig(config: Partial<MultiColumnXConfig>): void {
  window.__multiColumnXConfig = config as MultiColumnXConfig;
}

function addBlurCandidate(): { photoRoot: HTMLElement; bgDiv: HTMLElement } {
  const photoRoot = document.createElement("div");
  photoRoot.dataset.testid = "tweetPhoto";
  const wrapper = document.createElement("div");
  const bgDiv = document.createElement("div");
  bgDiv.style.backgroundImage = "url(https://example.com/photo.jpg)";
  const img = document.createElement("img");
  wrapper.appendChild(bgDiv);
  wrapper.appendChild(img);
  photoRoot.appendChild(wrapper);
  document.body.appendChild(photoRoot);
  return { photoRoot, bgDiv };
}

function addCardWrapperBlurCandidate(): {
  cardRoot: HTMLElement;
  bgDiv: HTMLElement;
} {
  const cardRoot = document.createElement("div");
  cardRoot.dataset.testid = "card.wrapper";
  const wrapper = document.createElement("div");
  const bgDiv = document.createElement("div");
  bgDiv.style.backgroundImage = "url(https://example.com/card-image.jpg)";
  const img = document.createElement("img");
  wrapper.appendChild(bgDiv);
  wrapper.appendChild(img);
  cardRoot.appendChild(wrapper);
  document.body.appendChild(cardRoot);
  return { cardRoot, bgDiv };
}

function addMultipleBlurCandidates(count: number): {
  photoRoot: HTMLElement;
  bgDivs: HTMLElement[];
} {
  const photoRoot = document.createElement("div");
  photoRoot.dataset.testid = "tweetPhoto";
  const bgDivs: HTMLElement[] = [];

  for (let i = 0; i < count; i++) {
    const wrapper = document.createElement("div");
    const bgDiv = document.createElement("div");
    bgDiv.style.backgroundImage = `url(https://example.com/photo${i}.jpg)`;
    const img = document.createElement("img");
    wrapper.appendChild(bgDiv);
    wrapper.appendChild(img);
    photoRoot.appendChild(wrapper);
    bgDivs.push(bgDiv);
  }

  document.body.appendChild(photoRoot);
  return { photoRoot, bgDivs };
}

async function importBlurImage(): Promise<void> {
  vi.resetModules();
  await import("./blur_image");
}

describe("inject/blur_image", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    delete window.__multiColumnXConfig;
  });

  afterEach(() => {
    createdObservers.forEach((observer) => observer.disconnect());
    createdObservers.clear();
  });

  it("設定幅がCSSとして適用される", async () => {
    setConfig({ blurImageEnabled: true, blurImageAmount: "20px" });
    const { bgDiv } = addBlurCandidate();

    await importBlurImage();

    expect(bgDiv.style.filter).toBe("blur(20px)");
  });

  it("ぼかし量未指定の場合はデフォルトの10pxを適用する", async () => {
    setConfig({ blurImageEnabled: true, blurImageAmount: "" });
    const { bgDiv } = addBlurCandidate();

    await importBlurImage();

    expect(bgDiv.style.filter).toBe("blur(10px)");
  });

  it("無効時はスタイルを注入しない", async () => {
    setConfig({ blurImageEnabled: false });
    const { bgDiv } = addBlurCandidate();

    await importBlurImage();

    expect(bgDiv.style.filter).toBe("");
  });

  it("設定が無い場合はスタイルを注入しない", async () => {
    const { bgDiv } = addBlurCandidate();

    await importBlurImage();

    expect(bgDiv.style.filter).toBe("");
  });

  it("card.wrapperの背景画像にもブラーが適用される", async () => {
    setConfig({ blurImageEnabled: true, blurImageAmount: "10px" });
    const { bgDiv } = addCardWrapperBlurCandidate();

    await importBlurImage();

    expect(bgDiv.style.filter).toBe("blur(10px)");
  });

  it("1つのルート内に複数の背景画像候補がある場合_全てにブラーが適用される", async () => {
    setConfig({ blurImageEnabled: true, blurImageAmount: "10px" });
    const { bgDivs } = addMultipleBlurCandidates(3);

    await importBlurImage();

    bgDivs.forEach((bgDiv) => {
      expect(bgDiv.style.filter).toBe("blur(10px)");
    });
  });

  it("既に同じブラー値が設定されている場合_2度目の処理ではstyle属性が変更されないこと", async () => {
    setConfig({ blurImageEnabled: true, blurImageAmount: "10px" });
    const { photoRoot, bgDiv } = addBlurCandidate();

    await importBlurImage();

    // 1度目の適用後、style.filter が "blur(10px)" になっているはず
    const expectedFilterValue = "blur(10px)";
    expect(bgDiv.style.filter).toBe(expectedFilterValue);

    // style.filter の setter 呼び出し回数をカウント
    let setterCallCount = 0;
    const originalStyle = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "style",
    );

    // HTMLElement の style オブジェクトの filter プロパティをスパイ
    const originalBgDivStyle = bgDiv.style;
    const styleProxy = new Proxy(originalBgDivStyle, {
      set: (target, prop, value) => {
        if (prop === "filter") {
          setterCallCount++;
        }
        (target as any)[prop] = value;
        return true;
      },
    });
    Object.defineProperty(bgDiv, "style", {
      get: () => styleProxy,
      configurable: true,
    });

    // 2度目のブラー処理を誘発: photoRoot に新しい子要素を追加して
    // blur_image.ts 内の MutationObserver のコールバック（observeDOMChanges）を発火させる
    const newChild = document.createElement("div");
    newChild.dataset.testid = "tweetPhoto";
    const wrapper = document.createElement("div");
    const newBgDiv = document.createElement("div");
    newBgDiv.style.backgroundImage = "url(https://example.com/photo2.jpg)";
    const img = document.createElement("img");
    wrapper.appendChild(newBgDiv);
    wrapper.appendChild(img);
    newChild.appendChild(wrapper);
    photoRoot.appendChild(newChild);

    // マイクロタスク待機（MutationObserver のコールバック実行待ち）
    await new Promise((resolve) => setTimeout(resolve, 0));

    // 実装前（guard なし）: setterCallCount は 2
    //   - 1度目: importBlurImage() で applyBlur() が呼ばれて filter をセット
    //   - 2度目: photoRoot.appendChild() で observeDOMChanges がトリガーされて applyBlur() が再度呼ばれて filter をセット
    // 実装後（guard あり）: setterCallCount は 0
    //   - 1度目: importBlurImage() で applyBlur() が呼ばれるが、まだ filter が「」なので代入
    //   - 2度目: photoRoot.appendChild() で setBlurImage() が呼ばれても、applyBlur() が現在値と同じを検知してスキップ
    // ただし、1回目の初期 import 時点では既に filter が "blur(10px)" になっているため、
    // スパイを設定するタイミングによって setterCallCount は 0 になる
    expect(setterCallCount).toBe(0);
  });
});
