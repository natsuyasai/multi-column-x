// @vitest-environment-options { "url": "https://x.com/home" }
//
// compose_only.ts は IIFE のため import 時に実行され、/home のインライン投稿フォーム
// 以外をスポットライトCSS（data 属性 + 注入 style）で隠す副作用を登録する。
// 再適用関数を window.__multiColumnX.applyComposeOnly として公開しているため、
// テストは DOM を組んでからこれを呼び、どの要素が隠されるかを検証する。
import { describe, it, expect, beforeAll, beforeEach } from "vitest";

const HIDDEN_ATTR = "data-mcx-compose-hidden";

function isHidden(id: string): boolean {
  return !!document.getElementById(id)?.hasAttribute(HIDDEN_ATTR);
}

// /home の投稿フォーム周辺を模した DOM を組む。
// body 直下: sidebar / appRoot(...composer...) / (任意で)toast レイヤ。
function buildHomeDom(options: { withToast?: boolean } = {}): void {
  const toast = options.withToast
    ? '<div id="toastWrap"><div data-testid="toast">ポストを送信しました。</div></div>'
    : "";
  document.body.innerHTML = `
    <div id="sidebar">sidebar</div>
    <div id="appRoot">
      <div data-testid="primaryColumn">
        <div id="htl">
          <div id="header">header</div>
          <div id="composer">
            <div id="ta" data-testid="tweetTextarea_0" role="textbox"></div>
            <button data-testid="tweetButtonInline">Post</button>
          </div>
          <div id="timeline"><div data-testid="cellInnerDiv">tweet</div></div>
        </div>
      </div>
    </div>
    ${toast}
  `;
}

describe("inject/compose_only", () => {
  beforeAll(async () => {
    await import("./compose_only");
  });

  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("投稿フォーム領域だけ残し、ヘッダー・タイムライン・サイドバーを隠す", () => {
    buildHomeDom();

    window.__multiColumnX.applyComposeOnly!();

    // 経路外の兄弟は隠れる
    expect(isHidden("header")).toBe(true);
    expect(isHidden("timeline")).toBe(true);
    expect(isHidden("sidebar")).toBe(true);
    // 投稿フォーム領域とその配下・経路上の祖先は隠れない
    expect(isHidden("composer")).toBe(false);
    expect(isHidden("ta")).toBe(false);
    expect(isHidden("htl")).toBe(false);
    expect(isHidden("appRoot")).toBe(false);
  });

  it("投稿フォーム(tweetTextarea_0)が見つからない場合は何も隠さない", () => {
    document.body.innerHTML = '<div id="x">a</div><div id="y">b</div>';

    window.__multiColumnX.applyComposeOnly!();

    expect(document.querySelectorAll(`[${HIDDEN_ATTR}]`).length).toBe(0);
  });

  it("完了トーストを含む枝は隠さない（whitelist）", () => {
    buildHomeDom({ withToast: true });

    window.__multiColumnX.applyComposeOnly!();

    expect(isHidden("sidebar")).toBe(true);
    expect(isHidden("toastWrap")).toBe(false);
  });

  it("投稿フォームを特定できないときは前回の適用状態を保持する（点滅防止）", () => {
    buildHomeDom();
    window.__multiColumnX.applyComposeOnly!();
    expect(isHidden("timeline")).toBe(true);
    expect(isHidden("sidebar")).toBe(true);

    // タイムラインの cellInnerDiv が一時的に消える（読込中を模擬）→ keep 特定不可
    document.querySelector('[data-testid="cellInnerDiv"]')?.remove();
    window.__multiColumnX.applyComposeOnly!();

    // 前回のマーカーが保持され、スポットライトが解除（点滅）しない
    expect(isHidden("timeline")).toBe(true);
    expect(isHidden("sidebar")).toBe(true);
  });
});
