// useHeaderCustomizer.ts の hideHeaderEnabled / hideTweetInputEnabled による
// スタイル挿入制御を検証する。3つ目の useEffect（リンク抽出）は
// window.__multiColumnXConfig?.visibleLinks に依存するのみで今回のスコープ外。
import { renderHook, cleanup } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { useHeaderCustomizer } from "./useHeaderCustomizer";
import {
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
});
