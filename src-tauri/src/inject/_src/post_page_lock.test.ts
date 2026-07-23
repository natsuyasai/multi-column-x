// @vitest-environment-options { "url": "https://x.com/compose/post" }
//
// post_page_lock.ts は IIFE のため import 時に実行され、
// - history.pushState / replaceState / popstate を監視し、
//   投稿ページ（/compose/post）以外へ遷移したら投稿ページへ即座に戻す
// という副作用を window に登録する。
//
// window.location.assign は WebIDL 上 Unforgeable なプロパティのため、
// jsdom・実ブラウザともに vi.spyOn / Object.defineProperty で
// 直接差し替えることができない。そのためモジュール側は実際のナビゲーションを
// window.__multiColumnX.postPageLockNavigate 経由の間接呼び出しにしており、
// テストはこの関数呼び出しを検証する。
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

const COMPOSE_URL = "https://x.com/compose/post";

describe("inject/post_page_lock", () => {
  beforeAll(async () => {
    await import("./post_page_lock");
  });

  beforeEach(() => {
    history.replaceState({}, "", "/compose/post");
    window.__multiColumnX.postPageLockNavigate = vi.fn();
  });

  it("投稿ページ以外へpushStateしたら投稿ページへ戻すナビゲーションが呼ばれる", () => {
    history.pushState({}, "", "/home");

    expect(window.__multiColumnX.postPageLockNavigate).toHaveBeenCalledWith(
      COMPOSE_URL,
    );
  });

  it("投稿ページ内のpushStateでは戻さない", () => {
    history.pushState({}, "", "/compose/post");

    expect(window.__multiColumnX.postPageLockNavigate).not.toHaveBeenCalled();
  });

  it("popstateで投稿ページ外なら戻す", () => {
    history.pushState({}, "", "/home");
    vi.mocked(window.__multiColumnX.postPageLockNavigate!).mockClear();

    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(window.__multiColumnX.postPageLockNavigate).toHaveBeenCalledWith(
      COMPOSE_URL,
    );
  });
});
