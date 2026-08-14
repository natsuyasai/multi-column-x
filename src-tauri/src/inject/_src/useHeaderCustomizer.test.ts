// useHeaderCustomizer.ts の hideHeaderEnabled / hideTweetInputEnabled による
// スタイル挿入制御を検証する。3つ目の useEffect（リンク抽出）は
// window.__multiColumnXConfig?.visibleLinks に依存するのみで今回のスコープ外。
import { renderHook, cleanup, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { useHeaderCustomizer } from "./useHeaderCustomizer";
import {
  BOTTOM_BAR_SELECTOR,
  HEADER_HIDE_STYLE_ID,
  TWEET_INPUT_HIDE_STYLE_ID,
} from "./headerCustomizerTypes";

describe("useHeaderCustomizer", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    window.__multiColumnXConfig = undefined;
  });

  afterEach(() => {
    cleanup();
    window.__multiColumnXConfig = undefined;
  });

  it("hideHeaderEnabledがtrueのときheader非表示styleを挿入する", () => {
    window.__multiColumnXConfig = {
      hideHeaderEnabled: true,
      hideTweetInputEnabled: true,
    } as Window["__multiColumnXConfig"];

    renderHook(() => useHeaderCustomizer());

    expect(document.getElementById(HEADER_HIDE_STYLE_ID)).not.toBeNull();
  });

  it("hideHeaderEnabledがfalseのときheader非表示styleを挿入しない", () => {
    window.__multiColumnXConfig = {
      hideHeaderEnabled: false,
      hideTweetInputEnabled: true,
    } as Window["__multiColumnXConfig"];

    renderHook(() => useHeaderCustomizer());

    expect(document.getElementById(HEADER_HIDE_STYLE_ID)).toBeNull();
  });

  it("hideTweetInputEnabledがtrueのとき投稿欄非表示styleを挿入する", () => {
    window.__multiColumnXConfig = {
      hideHeaderEnabled: true,
      hideTweetInputEnabled: true,
    } as Window["__multiColumnXConfig"];

    renderHook(() => useHeaderCustomizer());

    expect(document.getElementById(TWEET_INPUT_HIDE_STYLE_ID)).not.toBeNull();
  });

  it("hideTweetInputEnabledがfalseのとき投稿欄非表示styleを挿入しない", () => {
    window.__multiColumnXConfig = {
      hideHeaderEnabled: true,
      hideTweetInputEnabled: false,
    } as Window["__multiColumnXConfig"];

    renderHook(() => useHeaderCustomizer());

    expect(document.getElementById(TWEET_INPUT_HIDE_STYLE_ID)).toBeNull();
  });

  it("__multiColumnXConfigが未設定のときは両方ともデフォルトtrue相当でstyleを挿入する", () => {
    renderHook(() => useHeaderCustomizer());

    expect(document.getElementById(HEADER_HIDE_STYLE_ID)).not.toBeNull();
    expect(document.getElementById(TWEET_INPUT_HIDE_STYLE_ID)).not.toBeNull();
  });

  it("BottomBar要素が存在する場合、ヘッダー非表示CSSが注入されない", () => {
    const bottomBar = document.createElement("div");
    bottomBar.setAttribute("data-testid", "BottomBar");
    document.body.appendChild(bottomBar);
    window.__multiColumnXConfig = {
      hideHeaderEnabled: true,
      hideTweetInputEnabled: true,
    } as Window["__multiColumnXConfig"];

    renderHook(() => useHeaderCustomizer());

    expect(document.querySelector(BOTTOM_BAR_SELECTOR)).not.toBeNull();
    expect(document.getElementById(HEADER_HIDE_STYLE_ID)).toBeNull();
  });

  it("BottomBar要素が存在しない場合、ヘッダー非表示CSSが注入される", () => {
    window.__multiColumnXConfig = {
      hideHeaderEnabled: true,
      hideTweetInputEnabled: true,
    } as Window["__multiColumnXConfig"];

    renderHook(() => useHeaderCustomizer());

    expect(document.querySelector(BOTTOM_BAR_SELECTOR)).toBeNull();
    expect(document.getElementById(HEADER_HIDE_STYLE_ID)).not.toBeNull();
  });

  it("マウント後にBottomBar要素が追加されると注入済みのヘッダー非表示CSSが解除される", async () => {
    window.__multiColumnXConfig = {
      hideHeaderEnabled: true,
      hideTweetInputEnabled: true,
    } as Window["__multiColumnXConfig"];

    renderHook(() => useHeaderCustomizer());
    expect(document.getElementById(HEADER_HIDE_STYLE_ID)).not.toBeNull();

    const bottomBar = document.createElement("div");
    bottomBar.setAttribute("data-testid", "BottomBar");
    document.body.appendChild(bottomBar);

    await waitFor(() => {
      expect(document.getElementById(HEADER_HIDE_STYLE_ID)).toBeNull();
    });
  });

  it("マウント後にBottomBar要素が削除されるとヘッダー非表示CSSが再注入される", async () => {
    const bottomBar = document.createElement("div");
    bottomBar.setAttribute("data-testid", "BottomBar");
    document.body.appendChild(bottomBar);
    window.__multiColumnXConfig = {
      hideHeaderEnabled: true,
      hideTweetInputEnabled: true,
    } as Window["__multiColumnXConfig"];

    renderHook(() => useHeaderCustomizer());
    expect(document.getElementById(HEADER_HIDE_STYLE_ID)).toBeNull();

    bottomBar.remove();

    await waitFor(() => {
      expect(document.getElementById(HEADER_HIDE_STYLE_ID)).not.toBeNull();
    });
  });

  it("resizeイベント発火時に再判定される", async () => {
    window.__multiColumnXConfig = {
      hideHeaderEnabled: true,
      hideTweetInputEnabled: true,
    } as Window["__multiColumnXConfig"];

    renderHook(() => useHeaderCustomizer());
    expect(document.getElementById(HEADER_HIDE_STYLE_ID)).not.toBeNull();

    const bottomBar = document.createElement("div");
    bottomBar.setAttribute("data-testid", "BottomBar");
    document.body.appendChild(bottomBar);
    window.dispatchEvent(new Event("resize"));

    await waitFor(() => {
      expect(document.getElementById(HEADER_HIDE_STYLE_ID)).toBeNull();
    });
  });
});
