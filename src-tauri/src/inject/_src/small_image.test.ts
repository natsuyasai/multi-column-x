// small_image.ts は IIFE のため import 時に実行される。
// window.__multiColumnXConfig はモジュールのトップレベルで一度だけ読み取られるため、
// 設定値ごとに vi.resetModules で再 import して検証する（ng_word.ts のように
// 実行のたびに再評価される API 呼び出し方式ではない点に注意）。
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// small_image.ts は DOM 変化を監視し続ける MutationObserver を import のたびに
// 新規登録し、自身を disconnect する手段を公開しない（ページ常駐前提）。
// vi.resetModules で再 import するテストでは前のテストの observer が残り、
// 後続テストの DOM 変更にも反応してしまう（例: 無効化テストなのに前のテストの
// 有効設定で幅が適用される）ため、生成された observer を追跡し各テスト後に
// 確実に disconnect する。
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

function addTweetPhoto(): { root: HTMLElement; photo: HTMLElement } {
  const root = document.createElement("div");
  root.setAttribute("aria-labelledby", "tweet-1");
  const photo = document.createElement("div");
  photo.dataset.testid = "tweetPhoto";
  root.appendChild(photo);
  document.body.appendChild(root);
  return { root, photo };
}

async function importSmallImage(): Promise<void> {
  vi.resetModules();
  await import("./small_image");
}

describe("inject/small_image", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    delete window.__multiColumnXConfig;
  });

  afterEach(() => {
    createdObservers.forEach((observer) => observer.disconnect());
    createdObservers.clear();
  });

  it("設定幅がCSSとして適用される", async () => {
    setConfig({ smallImageEnabled: true, smallImageWidth: "30%" });
    const { root } = addTweetPhoto();

    await importSmallImage();

    expect(root.style.width).toBe("30%");
  });

  it("幅未指定の場合はデフォルトの50%を適用する", async () => {
    setConfig({ smallImageEnabled: true, smallImageWidth: "" });
    const { root } = addTweetPhoto();

    await importSmallImage();

    expect(root.style.width).toBe("50%");
  });

  it("無効時はスタイルを注入しない", async () => {
    setConfig({ smallImageEnabled: false });
    const { root } = addTweetPhoto();

    await importSmallImage();

    expect(root.style.width).toBe("");
  });

  it("設定が無い場合はスタイルを注入しない", async () => {
    const { root } = addTweetPhoto();

    await importSmallImage();

    expect(root.style.width).toBe("");
  });

  it("有効時はDOM追加後の画像にも幅を適用する", async () => {
    setConfig({ smallImageEnabled: true, smallImageWidth: "40%" });

    await importSmallImage();

    const { root } = addTweetPhoto();

    await vi.waitFor(() => {
      expect(root.style.width).toBe("40%");
    });
  });
});
