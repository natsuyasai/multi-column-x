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
});
