// auto_reload.ts は IIFE のため、import 時に実行されて window.__multiColumnX に
// triggerReload が公開されると同時に、新着ポスト検知（マーカー消費・比較・
// report_new_posts_count 報告）が初期化処理として走る。
//
// 新設計（2026-07-04 実DOM調査に基づく）: 「新しいポストを表示」ピルは合成イベントを
// 受け付けず選択中タブの再クリックもリフレッシュ効果が無いため、確実に最新タイムラインを
// 取得できる location.reload() 方式に書き換えた。triggerReload() は
// (1) スクロール中はスキップ (2) リロード前に視覚的先頭ポストのマーカーを sessionStorage
// に保存して location.reload() する、の 2 責務のみを持つ。
// 新着数の算出は import 時（＝リロード後の再読み込み時）に自動実行されるため、
// ng_word.ts 等と同様に「特定の DOM/sessionStorage 状態で import したときの副作用」として
// vi.resetModules で都度再 import して検証する（tab_selector.test.ts のパターンを踏襲）。
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const invokeMock = vi.fn((_cmd: string, _args?: Record<string, unknown>) =>
  Promise.resolve<unknown>(undefined),
);

const MARKER_KEY = "mcx_prevTopMarker";

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

function stubGetBoundingClientRect(el: HTMLElement, top: number): void {
  el.getBoundingClientRect = vi.fn(
    () =>
      ({
        top,
        left: 0,
        right: 0,
        bottom: top,
        width: 0,
        height: 0,
        x: 0,
        y: top,
        toJSON: () => ({}),
      }) as DOMRect,
  );
}

function addSection(): HTMLElement {
  const section = document.createElement("section");
  section.setAttribute("aria-labelledby", "timeline");
  document.body.appendChild(section);
  return section;
}

function addArticle(
  section: HTMLElement,
  statusId: string | null,
  top: number,
  isoTime?: string,
): HTMLElement {
  const article = document.createElement("article");
  if (statusId) {
    const link = document.createElement("a");
    link.setAttribute("href", `/someone/status/${statusId}`);
    article.appendChild(link);
  }
  if (isoTime) {
    const time = document.createElement("time");
    time.setAttribute("datetime", isoTime);
    article.appendChild(time);
  }
  stubGetBoundingClientRect(article, top);
  section.appendChild(article);
  return article;
}

function addCell(section: HTMLElement, text: string, top: number): HTMLElement {
  const cell = document.createElement("div");
  cell.dataset.testid = "cellInnerDiv";
  cell.textContent = text;
  stubGetBoundingClientRect(cell, top);
  section.appendChild(cell);
  return cell;
}

// DOM/sessionStorage のセットアップ後に呼び、init 時の副作用を発火させる。
async function importAutoReload(): Promise<void> {
  vi.resetModules();
  await import("./auto_reload");
}

describe("inject/auto_reload", () => {
  let reloadMock: ReturnType<typeof vi.fn>;
  const originalLocation = window.location;

  beforeEach(() => {
    document.body.innerHTML = "";
    sessionStorage.clear();
    invokeMock.mockClear();
    setScrolling(0);
    window.__TAURI_INTERNALS__ = {
      metadata: { currentWebview: { label: "column-1" } },
    };
    window.__TAURI__ = { core: { invoke: invokeMock } };

    reloadMock = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...originalLocation, reload: reloadMock },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });

  describe("triggerReload", () => {
    it("スクロール中は自動リロードをスキップする", async () => {
      await importAutoReload();
      setScrolling(100);

      window.__multiColumnX.triggerReload();

      expect(reloadMock).not.toHaveBeenCalled();
      expect(sessionStorage.getItem(MARKER_KEY)).toBeNull();
    });

    it("scrollToTopを指定するとスクロール位置を先頭に戻してからリロードする", async () => {
      await importAutoReload();
      setScrolling(300);

      window.__multiColumnX.triggerReload(true);

      expect(document.documentElement.scrollTop).toBe(0);
      expect(reloadMock).toHaveBeenCalledTimes(1);
    });

    it("リロード前に先頭ポストのマーカーをsessionStorageへ保存する", async () => {
      const section = addSection();
      addArticle(section, "200", 0);
      addArticle(section, "100", 50);
      await importAutoReload();

      window.__multiColumnX.triggerReload();

      expect(sessionStorage.getItem(MARKER_KEY)).toBe("id:200");
      expect(reloadMock).toHaveBeenCalledTimes(1);
    });

    it("先頭ポストに投稿時刻があればマーカーにidと時刻を併記する", async () => {
      const section = addSection();
      addArticle(section, "200", 0, "2026-07-04T06:00:00.000Z");
      await importAutoReload();

      window.__multiColumnX.triggerReload();

      expect(sessionStorage.getItem(MARKER_KEY)).toBe(
        "id:200|t:2026-07-04T06:00:00.000Z",
      );
    });
  });

  describe("リロード後の新着数算出（import時の初期化処理）", () => {
    it("マーカーが無い初回起動では報告しない", async () => {
      const section = addSection();
      addArticle(section, "100", 0);

      await importAutoReload();

      expect(invokeMock).not.toHaveBeenCalled();
    });

    it("リロード後にマーカーより上のポスト数をreport_new_posts_countで報告する", async () => {
      sessionStorage.setItem(MARKER_KEY, "id:100");
      const section = addSection();
      addArticle(section, "300", 0);
      addArticle(section, "200", 50);
      addArticle(section, "100", 100);

      await importAutoReload();

      expect(invokeMock).toHaveBeenCalledWith("report_new_posts_count", {
        label: "column-1",
        count: 2,
      });
      expect(sessionStorage.getItem(MARKER_KEY)).toBeNull();
    });

    it("前回先頭が現在の先頭と同じ場合は報告しない", async () => {
      sessionStorage.setItem(MARKER_KEY, "id:100");
      const section = addSection();
      addArticle(section, "100", 0);

      await importAutoReload();

      expect(invokeMock).not.toHaveBeenCalled();
      expect(sessionStorage.getItem(MARKER_KEY)).toBeNull();
    });

    it("時刻付きマーカーでは前回先頭より上でも古い挿入物（広告など）は数えない", async () => {
      // 前回先頭 id:100 は 06:00。リロード後、その上に「新しい投稿(06:05)」と
      // 「時刻の無い広告」と「古いピン留め(05:00)」が挟まっても、新着は 06:05 の1件のみ。
      sessionStorage.setItem(MARKER_KEY, "id:100|t:2026-07-04T06:00:00.000Z");
      const section = addSection();
      addArticle(section, "300", 0, "2026-07-04T06:05:00.000Z");
      addArticle(section, null, 30); // 時刻なし（広告想定）
      addArticle(section, "50", 60, "2026-07-04T05:00:00.000Z"); // 古いピン留め想定
      addArticle(section, "100", 90, "2026-07-04T06:00:00.000Z");

      await importAutoReload();

      expect(invokeMock).toHaveBeenCalledWith("report_new_posts_count", {
        label: "column-1",
        count: 1,
      });
    });

    it("マーカー未検出でも時刻より新しいポストだけを数える", async () => {
      // 前回先頭 id:999 が描画ウィンドウ外。時刻 06:00 より新しい 06:05・06:10 の2件のみ新着。
      sessionStorage.setItem(MARKER_KEY, "id:999|t:2026-07-04T06:00:00.000Z");
      const section = addSection();
      addArticle(section, "300", 0, "2026-07-04T06:10:00.000Z");
      addArticle(section, "250", 50, "2026-07-04T06:05:00.000Z");
      addArticle(section, "200", 100, "2026-07-04T05:55:00.000Z");

      await importAutoReload();

      expect(invokeMock).toHaveBeenCalledWith("report_new_posts_count", {
        label: "column-1",
        count: 2,
      });
    });

    it("マーカー未検出かつ時刻情報が無い旧形式では報告しない", async () => {
      // 読書位置復元でウィンドウがずれただけの誤検知を防ぐため、時刻が無ければ報告しない。
      sessionStorage.setItem(MARKER_KEY, "id:999");
      const section = addSection();
      addArticle(section, "300", 0);
      addArticle(section, "200", 50);

      await importAutoReload();

      expect(invokeMock).not.toHaveBeenCalled();
    });

    it("通知ページでは先頭セルの変化でcount1を報告する", async () => {
      sessionStorage.setItem(MARKER_KEY, "text:古い通知の本文");
      const section = addSection();
      addCell(section, "新しい通知の本文", 0);

      await importAutoReload();

      expect(invokeMock).toHaveBeenCalledWith("report_new_posts_count", {
        label: "column-1",
        count: 1,
      });
    });

    it("通知ページで先頭セルの内容が変わっていなければ報告しない", async () => {
      sessionStorage.setItem(MARKER_KEY, "text:同じ通知の本文");
      const section = addSection();
      addCell(section, "同じ通知の本文", 0);

      await importAutoReload();

      expect(invokeMock).not.toHaveBeenCalled();
      expect(sessionStorage.getItem(MARKER_KEY)).toBeNull();
    });

    it("通知ページで未読バッジの数値が取得できればその値を優先して報告する", async () => {
      sessionStorage.setItem(MARKER_KEY, "text:古い通知の本文");
      const section = addSection();
      addCell(section, "新しい通知の本文", 0);
      const link = document.createElement("a");
      link.dataset.testid = "AppTabBar_Notifications_Link";
      const badge = document.createElement("span");
      badge.setAttribute("aria-label", "3件の未読通知");
      link.appendChild(badge);
      document.body.appendChild(link);

      await importAutoReload();

      expect(invokeMock).toHaveBeenCalledWith("report_new_posts_count", {
        label: "column-1",
        count: 3,
      });
    });
  });
});
