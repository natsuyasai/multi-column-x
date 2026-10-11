// HeaderCustomizer の画面文言（ナビの表示切替 title・リンクの aria-label・自前ボタンの aria-label）が
// 共有ハブ window.__mcxI18n の表示言語に追従することを検証する。
// X のヘッダーが無い状態で描画し、フォールバックの既定リンク（headerCustomizerTypes の DEFAULT_NAV_LINKS）を使う。
import { render, cleanup, act, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HeaderCustomizer } from "./HeaderCustomizer";
// 画面文言の共有ハブ（window.__mcxI18n）を読み込む（日本語固定の既定言語で従来の文言を検証する）
import "./i18n";

/** かな・カタカナ・漢字を1文字でも含むか（英語表示の検証用） */
function containsJapanese(text: string): boolean {
  return /[぀-ヿ一-鿿]/.test(text);
}

function collect(container: HTMLElement): string[] {
  const texts: string[] = [];
  container.querySelectorAll("[title], [aria-label]").forEach((el) => {
    const title = el.getAttribute("title");
    const label = el.getAttribute("aria-label");
    if (title) texts.push(title);
    if (label) texts.push(label);
  });
  return texts;
}

async function renderWithFallbackLinks(): Promise<HTMLElement> {
  const { container } = render(<HeaderCustomizer />);
  // X のヘッダーが見つからないため、リトライ後にフォールバックの既定リンクが描画される
  await act(async () => {
    await vi.advanceTimersByTimeAsync(6000);
  });
  return container;
}

describe("inject/HeaderCustomizer の表示言語", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    localStorage.clear();
    window.__multiColumnXConfig = {
      showCustomMenu: true,
      hideHeaderEnabled: false,
      hideTweetInputEnabled: false,
      visibleLinks: [],
    } as unknown as MultiColumnXConfig;
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    window.__mcxI18n?.setLang("ja");
    window.__multiColumnXConfig = undefined;
  });

  it("日本語のときトグルのtitleと既定リンクのaria-labelは従来と同じ文言になる", async () => {
    const container = await renderWithFallbackLinks();

    const texts = collect(container);
    expect(texts).toContain("ナビゲーションを表示");
    expect(texts).toEqual(
      expect.arrayContaining([
        "ホーム",
        "調べたいものを検索",
        "通知",
        "ダイレクトメッセージ",
        "Grok",
        "リスト",
        "ブックマーク",
        "コミュニティ",
        "プレミアム",
        "プロフィール",
        "ポストする",
      ]),
    );
  });

  it("表示言語が英語のときトグルのtitleと既定リンクのaria-labelが英語になり日本語を含まない", async () => {
    window.__mcxI18n?.setLang("en");

    const container = await renderWithFallbackLinks();

    const texts = collect(container);
    expect(texts).toContain("Show navigation");
    expect(texts).toEqual(
      expect.arrayContaining(["Home", "Notifications", "Messages", "Post"]),
    );
    expect(texts.some(containsJapanese)).toBe(false);
  });

  it("表示中に表示言語を切り替えると再描画されて文言が切り替わる", async () => {
    const container = await renderWithFallbackLinks();
    expect(collect(container)).toContain("ホーム");

    act(() => {
      window.__mcxI18n?.setLang("en");
    });

    const texts = collect(container);
    expect(texts).toContain("Home");
    expect(texts.some(containsJapanese)).toBe(false);
  });

  it("ポストするを押すとaria-labelが閉じるに変わり、英語では日本語を含まない", async () => {
    window.__mcxI18n?.setLang("en");
    const container = await renderWithFallbackLinks();
    const compose = container.querySelector<HTMLAnchorElement>(
      'a[href="/compose/post"]',
    );
    if (!compose) throw new Error("compose link not found");
    expect(compose.getAttribute("aria-label")).toBe("Post");

    await act(async () => {
      fireEvent.click(compose);
    });

    expect(compose.getAttribute("aria-label")).toBe("Close");

    act(() => {
      window.__mcxI18n?.setLang("ja");
    });
    expect(compose.getAttribute("aria-label")).toBe("閉じる");
  });
});
