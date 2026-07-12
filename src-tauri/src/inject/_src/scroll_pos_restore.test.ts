// @vitest-environment-options { "url": "https://x.com/" }
//
// scroll_pos_restore.ts は IIFE のため import 時に実行され、
// - 写真ページへのリンククリックを捕捉して localStorage に保存する
// - history.pushState / popstate をフックし、写真ページ→ホームへ戻ったときに
//   保存済みURLの投稿までスクロール復元を試みる
// という副作用を window に登録する。
//
// 注: このモジュールには window.__multiColumnXConfig による有効/無効フラグは無く
// （常時動作し、注入自体の有無は Rust 側 InitScriptParams.scroll_pos_restore_enabled
// で制御される）、window.__multiColumnX への API 公開も無い。そのため計画書の
// 「設定が無効なら何もしない」というテスト名はこのモジュール単体には適用できず、
// 実際の副作用（保存・復元）の契約に絞ってテスト名を調整している。
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

const STORAGE_KEY = "x-home-previous-photo-url";

function clickLink(href: string): void {
  const link = document.createElement("a");
  link.setAttribute("href", href);
  // jsdom は実ナビゲーションを試みて "not implemented" を出力するため抑止する
  link.addEventListener("click", (e) => e.preventDefault());
  document.body.appendChild(link);
  link.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true }),
  );
}

describe("inject/scroll_pos_restore", () => {
  beforeAll(async () => {
    // jsdom は scrollIntoView 未実装のため、呼び出しを検証できるようスタブ化する
    HTMLElement.prototype.scrollIntoView = vi.fn();
    await import("./scroll_pos_restore");
  });

  beforeEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
    history.pushState({}, "", "/home");
  });

  it("ホームページで写真リンクをクリックするとURLをlocalStorageに保存する", () => {
    clickLink("https://x.com/bob/status/999/photo/2");

    expect(localStorage.getItem(STORAGE_KEY)).toBe(
      "https://x.com/bob/status/999/photo/2",
    );
  });

  it("ホームページ以外での写真リンククリックでは保存しない", () => {
    history.pushState({}, "", "/bob");

    clickLink("https://x.com/bob/status/999/photo/2");

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("写真ではないリンクのクリックでは保存しない", () => {
    clickLink("https://x.com/bob/status/999");

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("写真ページから戻ったときスクロール位置を復元する", () => {
    vi.useFakeTimers();
    try {
      const target = document.createElement("a");
      target.setAttribute("role", "link");
      target.setAttribute("href", "/bob/status/999/photo/2");
      document.body.appendChild(target);
      const scrollSpy = vi.mocked(target.scrollIntoView);
      scrollSpy.mockClear();

      // 写真ページへ遷移 → URL が保存される
      history.pushState({}, "", "/bob/status/999/photo/2");
      expect(localStorage.getItem(STORAGE_KEY)).toBe(
        "https://x.com/bob/status/999/photo/2",
      );

      // ホームへ戻る → 復元処理がスケジュールされる
      history.pushState({}, "", "/home");

      vi.advanceTimersByTime(2000);

      expect(scrollSpy).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("復元対象の投稿がタイムライン上に見つからない場合は元のスクロール位置に戻す", () => {
    vi.useFakeTimers();
    const scrollToSpy = vi
      .spyOn(window, "scrollTo")
      .mockImplementation(() => {});
    try {
      history.pushState({}, "", "/bob/status/999/photo/2");
      history.pushState({}, "", "/home");

      // 対象リンクは一切 DOM に存在しない状態で最大試行回数まで進める
      vi.advanceTimersByTime(1000 + 50 * 5 + 100);

      expect(scrollToSpy).toHaveBeenCalled();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    } finally {
      scrollToSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});
