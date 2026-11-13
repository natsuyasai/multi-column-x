// hide_ad.ts は IIFE のため import 時に実行されるが、実際の広告検出処理は
// import から1秒後（setTimeout）に main[role="main"] を見つけてから開始される。
// window.__multiColumnXConfig はトップレベルで一度だけ読まれるため、
// 設定値ごとに vi.resetModules で再 import して検証する。
//
// 対象4モジュール（hide_ad / sidebar_hide / mobile_area_hide / context_menu）のうち、
// 実際に window.__multiColumnXConfig の有効/無効フラグを参照するのは hide_ad.ts のみ。
// sidebar_hide.ts / mobile_area_hide.ts / context_menu.ts はスクリプト内に
// 有効/無効の分岐を持たず、注入するかどうか自体を Rust 側 InitScriptParams
// （is_mobile 等）で制御している（scroll_pos_restore.ts と同様の構成）。
// そのため「フラグ無効時に何もしない」を検証できるのは hide_ad.ts のみであり、
// 他の3モジュールに同種のテストを追加することは実装に存在しない分岐を
// テストすることになるため見送った（詳細はタスク報告を参照）。
import { describe, it, expect, vi, beforeEach } from "vitest";

function setConfig(config: Partial<MultiColumnXConfig>): void {
  window.__multiColumnXConfig = config as MultiColumnXConfig;
}

function addAdArticle(): HTMLElement {
  const main = document.createElement("main");
  main.setAttribute("role", "main");
  const article = document.createElement("article");
  article.setAttribute("role", "article");
  const adMarker = document.createElement("div");
  adMarker.dataset.testid = "placementTracking";
  article.appendChild(adMarker);
  main.appendChild(article);
  document.body.appendChild(main);
  return article;
}

// jsdom は offsetParent が常に null のため、可視状態を再現する
function makeVisible(el: HTMLElement): void {
  Object.defineProperty(el, "offsetParent", { get: () => document.body });
}

function addArticleWith(build: (article: HTMLElement) => void): HTMLElement {
  const main = document.createElement("main");
  main.setAttribute("role", "main");
  const article = document.createElement("article");
  article.setAttribute("role", "article");
  build(article);
  main.appendChild(article);
  document.body.appendChild(main);
  return article;
}

function addLabel(article: HTMLElement, tag: "span" | "a", text: string): void {
  const label = document.createElement(tag);
  if (tag === "a") label.setAttribute("role", "link");
  label.textContent = text;
  makeVisible(label);
  article.appendChild(label);
}

function addLink(article: HTMLElement, href: string): void {
  const a = document.createElement("a");
  a.setAttribute("href", href);
  a.textContent = "リンク";
  article.appendChild(a);
}

async function runHideAd(enabled = true): Promise<void> {
  vi.useFakeTimers();
  try {
    setConfig({ hideAdEnabled: enabled });
    await importHideAd();
    vi.advanceTimersByTime(1000);
  } finally {
    vi.useRealTimers();
  }
}

async function importHideAd(): Promise<void> {
  vi.resetModules();
  await import("./hide_ad");
}

describe("inject/hide_ad", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    delete window.__multiColumnXConfig;
  });

  it("設定が無効なら何もしない", async () => {
    vi.useFakeTimers();
    try {
      setConfig({ hideAdEnabled: false });
      const article = addAdArticle();

      await importHideAd();
      vi.advanceTimersByTime(1000);

      expect(article.style.display).not.toBe("none");
    } finally {
      vi.useRealTimers();
    }
  });

  it("設定が無い場合は何もしない", async () => {
    vi.useFakeTimers();
    try {
      const article = addAdArticle();

      await importHideAd();
      vi.advanceTimersByTime(1000);

      expect(article.style.display).not.toBe("none");
    } finally {
      vi.useRealTimers();
    }
  });

  it("設定が有効なら広告ツイートを非表示にする", async () => {
    vi.useFakeTimers();
    try {
      setConfig({ hideAdEnabled: true });
      const article = addAdArticle();

      await importHideAd();
      vi.advanceTimersByTime(1000);

      expect(article.style.display).toBe("none");
    } finally {
      vi.useRealTimers();
    }
  });

  it("ポスト下部に「Ad from starlink.com」と表示された広告は非表示になる", async () => {
    const article = addArticleWith((a) =>
      addLabel(a, "a", "Ad from starlink.com"),
    );
    await runHideAd();
    expect(article.style.display).toBe("none");
  });

  it("広告ラベルが無くても twclid 付き外部リンクを持つポストは非表示になる", async () => {
    const article = addArticleWith((a) =>
      addLink(a, "https://www.starlink.com/?utm_medium=paid&twclid=xxx"),
    );
    await runHideAd();
    expect(article.style.display).toBe("none");
  });

  it.each(["Ad", "Promoted", "広告"])(
    "従来の「%s」ラベルのポストも引き続き非表示になる",
    async (label) => {
      const article = addArticleWith((a) => addLabel(a, "span", label));
      await runHideAd();
      expect(article.style.display).toBe("none");
    },
  );

  it("本文に「Ad from」を含むだけの通常のポストは非表示にならない", async () => {
    const article = addArticleWith((a) =>
      addLabel(a, "span", "I got Ad from my boss"),
    );
    await runHideAd();
    expect(article.style.display).not.toBe("none");
  });

  it("twclid の付かない外部リンクのポストは非表示にならない", async () => {
    const article = addArticleWith((a) =>
      addLink(a, "https://example.com/?utm_medium=social"),
    );
    await runHideAd();
    expect(article.style.display).not.toBe("none");
  });

  it("設定が無効のとき「Ad from」広告は表示されたままである", async () => {
    const article = addArticleWith((a) =>
      addLabel(a, "a", "Ad from starlink.com"),
    );
    await runHideAd(false);
    expect(article.style.display).not.toBe("none");
  });
});
